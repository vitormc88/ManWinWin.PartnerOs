/**
 * Renewals P0 — build a renewal proposal from the REAL contract.
 *
 * Pure, side-effect-free helpers that turn the renewal's linked operational
 * records (renewal + client + contract + contract lines + license + licensed
 * modules) into:
 *
 *  1. a read-only **Current Contract Baseline** (evidence, never written back);
 *  2. the **initial proposal configuration/items** for a straight renewal;
 *  3. the **financial split** (current recurring vs proposed recurring vs
 *     one-time) and the **Changes from Current Contract** comparison.
 *
 * Established PartnerOS rules encoded here:
 *  - SaaS and "SaaS Direct" both mean hosted on ManWinWin servers (not On-Premise).
 *  - "Postos"/"Licenças" correspond to BackOffice users.
 *  - Employee accesses are ignored.
 *  - The historical LIC "license version" field is structurally unreliable and
 *    is never used; only the reliable current software version is shown.
 *  - Costs / Budget Control belongs to the Base module and is never an
 *    independently chargeable module.
 *  - "Pedidos Manutenção Web" and "Maintenance Requests" are the same module.
 *  - Historical/custom licensed modules are never hidden just because they are
 *    absent from the current price catalogue.
 *
 * Nothing here invents values: an unavailable field is `null` and must be
 * rendered as "Not recorded".
 */

import {
  classifyContractLines,
  computeContractFinancials,
  isRecurringClassifiedLine,
  lineTypeLabel,
  normalizeBillingFrequency,
  type ClassifiableLine,
} from "./contract-lines";
import { readDeployment, readLicenseVocabulary } from "./licensing";
import type { ProposalItem, ProposalPlan, ProposalProductFamily } from "@/types/proposal";

export const NOT_RECORDED = "Not recorded";

/* ------------------------------------------------------------------ */
/* Source shapes (loose on purpose — rows come straight from the DB)   */
/* ------------------------------------------------------------------ */

export interface BaselineSources {
  renewal?: Record<string, any> | null;
  client?: Record<string, any> | null;
  contract?: Record<string, any> | null;
  contractLines?: (ClassifiableLine & Record<string, any>)[] | null;
  license?: Record<string, any> | null;
  licensedModules?: Record<string, any>[] | null;
}

export interface BaselineModule {
  key: string;
  name: string;
  kind: "module" | "plugin";
  quantity: number | null;
  unitPrice: number | null;
  /** Part of the Base module — informational, never independently chargeable. */
  includedInBase: boolean;
  /** Present in the licence but unmapped to the current catalogue. */
  needsReview: boolean;
}

export interface BaselineRecurringLine {
  key: string;
  label: string;
  lineType: string;
  amount: number;
  needsReview: boolean;
}

export interface RenewalBaseline {
  hasRealData: boolean;
  renewalId: string | null;
  clientId: string | null;
  contractId: string | null;
  licenseId: string | null;

  productFamily: ProposalProductFamily | null;
  /** Raw canonical product, e.g. "Business UseIT" / "Professional 2". */
  product: string | null;
  variantLabel: string | null;
  plan: ProposalPlan | null;
  hosting: "SaaS" | "On-Premise" | null;
  version: string | null;

  backofficeUsers: number | null;
  webUsers: number | null;
  mobileUsers: number | null;

  modules: BaselineModule[];
  plugins: BaselineModule[];

  currency: string;
  currentRecurring: number | null;
  recurringLines: BaselineRecurringLine[];
  /** Historical one-time (project/implementation) revenue — NEVER the baseline. */
  historicalOneTime: number | null;

  contractStartDate: string | null;
  contractEndDate: string | null;
  renewalDate: string | null;
  billingFrequency: string | null;

  /** Fields we could not map safely from the source records. */
  unmappedFields: string[];
}

/* ------------------------------------------------------------------ */
/* Module vocabulary                                                   */
/* ------------------------------------------------------------------ */

const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Accesses that must never be treated as licensed modules/users. */
const IGNORED_MODULE_PATTERNS = [/employee access/, /acesso[s]? colaborador/];

/** Costs / Budget Control are part of the Base module. */
const BASE_MODULE_PATTERNS = [/^costs?$/, /budget control/, /controlo de custos/, /custos/];

/** Same module under two historical names. */
const MODULE_ALIASES: { test: RegExp; canonical: string }[] = [
  { test: /pedidos manutencao web|maintenance requests|web requests/, canonical: "Maintenance Requests" },
];

export function isIgnoredModuleName(name: string | null | undefined): boolean {
  const n = norm(name);
  return !!n && IGNORED_MODULE_PATTERNS.some((re) => re.test(n));
}

export function isBaseIncludedModule(name: string | null | undefined): boolean {
  const n = norm(name);
  return !!n && BASE_MODULE_PATTERNS.some((re) => re.test(n));
}

export function canonicalModuleName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  const n = norm(raw);
  const alias = MODULE_ALIASES.find((a) => a.test.test(n));
  return alias ? alias.canonical : raw;
}

/** Normalize + de-duplicate licensed modules/plugins. Nothing is hidden. */
export function normalizeLicensedItems(rows: Record<string, any>[] | null | undefined): {
  modules: BaselineModule[];
  plugins: BaselineModule[];
} {
  const modules = new Map<string, BaselineModule>();
  const plugins = new Map<string, BaselineModule>();

  for (const row of rows || []) {
    if (row?.enabled === false) continue;
    const rawName = row?.module_name ?? row?.name ?? null;
    if (!rawName) continue;
    if (isIgnoredModuleName(rawName)) continue;

    const name = canonicalModuleName(rawName);
    const kind: "module" | "plugin" = row?.item_type === "plugin" || row?.plugin_id ? "plugin" : "module";
    const includedInBase = Boolean(row?.included_in_base) || isBaseIncludedModule(name);
    const key = norm(name);
    const entry: BaselineModule = {
      key,
      name,
      kind,
      quantity: row?.quantity == null ? null : Number(row.quantity),
      // A Base-included item is never independently chargeable.
      unitPrice: includedInBase ? 0 : row?.unit_price == null ? null : Number(row.unit_price),
      includedInBase,
      // Historical/custom module with no catalogue reference — keep it visible.
      needsReview: !row?.module_id && !row?.plugin_id,
    };
    const bucket = kind === "plugin" ? plugins : modules;
    if (!bucket.has(key)) bucket.set(key, entry);
  }

  return { modules: [...modules.values()], plugins: [...plugins.values()] };
}

/* ------------------------------------------------------------------ */
/* Baseline construction                                               */
/* ------------------------------------------------------------------ */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

function familyOf(product: string | null): ProposalProductFamily | null {
  if (!product) return null;
  if (/^business/i.test(product)) return "Business";
  if (/^professional/i.test(product)) return "Professional";
  return null;
}

function planOf(product: string | null): ProposalPlan | null {
  const m = /professional\s*([123])/i.exec(product || "");
  return m ? (Number(m[1]) as ProposalPlan) : null;
}

export function buildRenewalBaseline(sources: BaselineSources): RenewalBaseline {
  const { renewal, client, contract, contractLines, license, licensedModules } = sources;
  const unmapped: string[] = [];

  const vocab = readLicenseVocabulary(
    {
      product: license?.product ?? client?.product_type ?? null,
      edition: license?.edition ?? null,
      deployment_type: license?.deployment_type ?? null,
      database_type: license?.database_type ?? null,
      license_model: license?.license_model ?? client?.license_type ?? null,
      // The historical LIC "license version" field is structurally unreliable.
      version: null,
    },
    // Fallbacks: hosting money on the contract, then the client's cloud flag.
    contract?.hosting_value != null && Number(contract.hosting_value) > 0 ? "SaaS" : client?.cloud_onpremise ?? null,
  );
  const product = vocab.product.value || null;
  const productFamily = (vocab.product.family || null) as ProposalProductFamily | null;
  if (!product) unmapped.push("product");

  // Hosting: SaaS / SaaS Direct / Cloud all mean hosted on ManWinWin servers.
  const deploymentView = readDeployment(
    { deployment_type: license?.deployment_type ?? null, database_type: license?.database_type ?? null },
    contract?.hosting_value != null && Number(contract.hosting_value) > 0 ? "SaaS" : client?.cloud_onpremise ?? null,
  );
  const hosting = (deploymentView.value || null) as "SaaS" | "On-Premise" | null;
  if (!hosting) unmapped.push("hosting");

  // Only the reliable current software version is shown.
  const version = str(client?.current_version) ?? null;
  if (!version) unmapped.push("version");

  // "Postos"/"Licenças" == BackOffice users. Employee accesses are ignored.
  const backofficeUsers = num(license?.backoffice_users);
  const webUsers = num(license?.web_accesses);
  const mobileUsers = num(license?.mobile_users);
  if (backofficeUsers == null) unmapped.push("backoffice_users");

  const { modules, plugins } = normalizeLicensedItems(licensedModules);

  const classified = classifyContractLines((contractLines || []) as ClassifiableLine[]);
  const financials = computeContractFinancials((contractLines || []) as ClassifiableLine[]);

  const recurringLines: BaselineRecurringLine[] = classified
    .filter((c) => isRecurringClassifiedLine(c))
    .map((c, idx) => ({
      key: String((c.line as any)?.id ?? `line-${idx}`),
      label: str((c.line as any)?.description) || lineTypeLabel(c.effectiveType),
      lineType: c.effectiveType,
      amount: Number((c.line as any)?.amount || 0),
      needsReview: c.isUnclassified,
    }));

  let currentRecurring: number | null = recurringLines.length ? financials.recurringArr : null;
  if (currentRecurring == null) {
    // No structured lines: fall back to the renewal's own commercial value.
    currentRecurring = num(renewal?.estimated_value) ?? num(contract?.total_value) ?? null;
    if (currentRecurring == null) unmapped.push("current_recurring_value");
  }

  const historicalOneTime = recurringLines.length ? financials.oneTimeValue : null;

  const billingFrequency =
    str(license?.periodicity) ??
    str(license?.billing_frequency) ??
    null;
  if (!billingFrequency) unmapped.push("billing_frequency");

  const hasRealData = Boolean(contract || license || recurringLines.length);

  return {
    hasRealData,
    renewalId: str(renewal?.id),
    clientId: str(renewal?.client_id ?? client?.id),
    contractId: str(renewal?.contract_id ?? contract?.id),
    licenseId: str(renewal?.license_id ?? license?.id),

    productFamily,
    product,
    variantLabel: vocab.product.label || product,
    plan: planOf(product),
    hosting,
    version,

    backofficeUsers,
    webUsers,
    mobileUsers,

    modules,
    plugins,

    currency: str(contract?.currency) ?? str(license?.currency) ?? "EUR",
    currentRecurring,
    recurringLines,
    historicalOneTime,

    contractStartDate: str(contract?.contract_start_date) ?? str(license?.license_start_date),
    contractEndDate: str(contract?.contract_end_date) ?? str(license?.license_end_date),
    renewalDate: str(renewal?.renewal_date) ?? str(license?.license_end_date),
    billingFrequency: billingFrequency ? normalizeBillingFrequencyLabel(billingFrequency) : null,

    unmappedFields: unmapped,
  };
}

function normalizeBillingFrequencyLabel(value: string): string {
  const f = normalizeBillingFrequency(value);
  const labels: Record<string, string> = {
    annual: "Annual",
    monthly: "Monthly",
    quarterly: "Quarterly",
    semiannual: "Semi-annual",
    one_time: "One-time",
    unknown: value,
  };
  return labels[f] ?? value;
}

/* ------------------------------------------------------------------ */
/* Proposal prepopulation                                              */
/* ------------------------------------------------------------------ */

/**
 * Initial proposal items for a straight renewal: strictly the current
 * recurring commercial reality. No implementation/services are ever added.
 */
export function buildBaselineProposalItems(baseline: RenewalBaseline): ProposalItem[] {
  const items: ProposalItem[] = [];

  if (baseline.recurringLines.length > 0) {
    baseline.recurringLines.forEach((line, idx) => {
      items.push({
        category: "software",
        item_code: `renewal_${line.lineType}_${idx + 1}`,
        item_name: line.label,
        description: line.needsReview ? "Needs review — source line could not be mapped to the catalogue." : null,
        qty: 1,
        unit_price: line.amount,
        frequency: "yearly",
        total: line.amount,
        discount_type: "none",
        discount_value: 0,
        gross_total: line.amount,
        discount_amount: 0,
        net_total: line.amount,
        is_override: false,
        is_recurring: true,
        sort_order: idx,
      });
    });
    return items;
  }

  if (baseline.currentRecurring != null) {
    items.push({
      category: "software",
      item_code: "renewal_current_recurring",
      item_name: `Renewal — current recurring agreement${baseline.product ? ` (${baseline.product})` : ""}`,
      description: "Derived from the renewal's current recurring value. Needs review — no contract lines recorded.",
      qty: 1,
      unit_price: baseline.currentRecurring,
      frequency: "yearly",
      total: baseline.currentRecurring,
      discount_type: "none",
      discount_value: 0,
      gross_total: baseline.currentRecurring,
      discount_amount: 0,
      net_total: baseline.currentRecurring,
      is_override: false,
      is_recurring: true,
      sort_order: 0,
    });
  }

  return items;
}

/** Initial (non-item) configuration derived from the baseline. */
export interface BaselineConfig {
  productFamily: ProposalProductFamily | null;
  plan: ProposalPlan | null;
  hosting: "SaaS" | "On-Premise" | null;
  webUsers: number | null;
  backofficeUsers: number | null;
}

export function buildBaselineConfig(baseline: RenewalBaseline): BaselineConfig {
  return {
    productFamily: baseline.productFamily,
    plan: baseline.plan,
    hosting: baseline.hosting,
    webUsers: baseline.webUsers,
    backofficeUsers: baseline.backofficeUsers,
  };
}

/* ------------------------------------------------------------------ */
/* Financial split                                                     */
/* ------------------------------------------------------------------ */

export interface RenewalFinancialSummary {
  currentRecurring: number | null;
  proposedRecurring: number;
  recurringDelta: number | null;
  recurringDeltaPct: number | null;
  oneTimeCharges: number;
  proposedYear1: number;
  proposedYear2Plus: number;
}

export function buildRenewalFinancialSummary(input: {
  baseline: RenewalBaseline | null;
  proposedRecurring: number;
  proposedYear1: number;
}): RenewalFinancialSummary {
  const current = input.baseline?.currentRecurring ?? null;
  const proposedRecurring = Number(input.proposedRecurring || 0);
  const proposedYear1 = Number(input.proposedYear1 || 0);
  const oneTime = Math.max(0, round2(proposedYear1 - proposedRecurring));
  const delta = current == null ? null : round2(proposedRecurring - current);
  const deltaPct = current == null || current === 0 ? null : round2(((proposedRecurring - current) / current) * 100);
  return {
    currentRecurring: current,
    proposedRecurring,
    recurringDelta: delta,
    recurringDeltaPct: deltaPct,
    oneTimeCharges: oneTime,
    proposedYear1,
    proposedYear2Plus: proposedRecurring,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Changes from current contract                                       */
/* ------------------------------------------------------------------ */

export type BaselineChangeKind =
  | "added"
  | "removed"
  | "qty_increased"
  | "qty_decreased"
  | "price_changed"
  | "unchanged";

export interface BaselineChange {
  kind: BaselineChangeKind;
  label: string;
  detail: string | null;
}

export interface BaselineComparison {
  changes: BaselineChange[];
  isStraightRenewal: boolean;
}

interface ComparableItem {
  item_name: string;
  qty: number;
  unit_price: number;
  is_recurring?: boolean;
  category?: string;
}

/** Compare the proposed items against the baseline recurring reality. */
export function compareProposalToBaseline(
  baseline: RenewalBaseline | null,
  proposed: ComparableItem[],
): BaselineComparison {
  if (!baseline) return { changes: [], isStraightRenewal: false };

  const key = (name: string) => norm(name);
  const baseItems = buildBaselineProposalItems(baseline);
  const baseMap = new Map(baseItems.map((i) => [key(i.item_name), i]));
  const propMap = new Map(proposed.map((i) => [key(i.item_name), i]));
  const changes: BaselineChange[] = [];

  for (const [k, base] of baseMap) {
    const prop = propMap.get(k);
    if (!prop) {
      changes.push({ kind: "removed", label: base.item_name, detail: fmt(base.unit_price, baseline.currency) });
      continue;
    }
    const qtyBase = Number(base.qty || 0);
    const qtyProp = Number(prop.qty || 0);
    const priceBase = round2(Number(base.unit_price || 0));
    const priceProp = round2(Number(prop.unit_price || 0));
    if (qtyProp > qtyBase) {
      changes.push({ kind: "qty_increased", label: base.item_name, detail: `${qtyBase} → ${qtyProp}` });
    } else if (qtyProp < qtyBase) {
      changes.push({ kind: "qty_decreased", label: base.item_name, detail: `${qtyBase} → ${qtyProp}` });
    } else if (priceProp !== priceBase) {
      changes.push({
        kind: "price_changed",
        label: base.item_name,
        detail: `${fmt(priceBase, baseline.currency)} → ${fmt(priceProp, baseline.currency)}`,
      });
    } else {
      changes.push({ kind: "unchanged", label: base.item_name, detail: null });
    }
  }

  for (const [k, prop] of propMap) {
    if (!baseMap.has(k)) {
      changes.push({
        kind: "added",
        label: prop.item_name,
        detail: fmt(Number(prop.unit_price || 0) * Number(prop.qty || 1), baseline.currency),
      });
    }
  }

  const isStraightRenewal = changes.length > 0 && changes.every((c) => c.kind === "unchanged");
  return { changes, isStraightRenewal };
}

function fmt(value: number, currency: string): string {
  return `${currency === "EUR" ? "€" : `${currency} `}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Display helper: never invent a default value. */
export function displayOrNotRecorded(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return NOT_RECORDED;
  return `${value}${suffix}`;
}
