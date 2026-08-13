/**
 * Renewal entitlements — central catalogue rule that separates LICENSED
 * CAPACITY from BILLABLE QUANTITY.
 *
 * One rule, used by client/license views, contracts, renewal computation,
 * proposal lines, preview/PDF and closing:
 *
 *   billable = max(0, total licensed − included by the selected product)
 *
 * Product defaults (no client-specific conditional anywhere):
 *   - Professional includes 1 BackOffice + 1 Web
 *   - Business     includes 3 BackOffice + 1 Web
 *
 * Total licensed capacity is NEVER overwritten to produce a billable quantity.
 * A total below the included minimum is flagged as a configuration
 * inconsistency for review — never a negative quantity, never a silent credit.
 */

import type { PricingRule, ProposalItem, ProposalProductFamily } from "@/types/proposal";

export type AccessType = "backoffice" | "web";

export const ACCESS_TYPES: AccessType[] = ["backoffice", "web"];

export const ACCESS_LABELS: Record<AccessType, string> = {
  backoffice: "BackOffice accesses",
  web: "Web accesses",
};

/** Central catalogue entitlement rule. */
export const PRODUCT_INCLUDED_ACCESSES: Record<ProposalProductFamily, Record<AccessType, number>> = {
  Professional: { backoffice: 1, web: 1 },
  Business: { backoffice: 3, web: 1 },
};

export function includedAccesses(
  family: ProposalProductFamily | null | undefined,
  accessType: AccessType,
): number {
  if (!family) return 0;
  return PRODUCT_INCLUDED_ACCESSES[family]?.[accessType] ?? 0;
}

export type AccessBillingFrequency = "monthly" | "yearly";

export interface AccessPricing {
  unitPrice: number | null;
  billingFrequency: AccessBillingFrequency | null;
  ruleCode?: string | null;
  ruleId?: string | null;
  label?: string | null;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Monthly unit prices are annualized (× 12); yearly prices are kept as-is. */
export function annualizeUnitPrice(
  unitPrice: number | null | undefined,
  frequency: AccessBillingFrequency | null | undefined,
): number | null {
  if (unitPrice == null || !Number.isFinite(Number(unitPrice))) return null;
  return frequency === "monthly" ? round2(Number(unitPrice) * 12) : round2(Number(unitPrice));
}

export interface AccessEntitlement {
  accessType: AccessType;
  label: string;
  /** Licensed capacity, exactly as recorded. Never modified here. */
  total: number | null;
  /** Quantity included by the selected product. */
  included: number;
  /** Additional billable quantity = max(0, total − included). */
  billable: number;
  unitPrice: number | null;
  billingFrequency: AccessBillingFrequency | null;
  annualUnitPrice: number | null;
  /** billable × annual unit price (null when no price is published). */
  annualAmount: number | null;
  ruleCode: string | null;
  ruleId: string | null;
  /** Total below the included minimum — needs review, never a credit. */
  inconsistent: boolean;
  inconsistencyMessage: string | null;
}

export function computeAccessEntitlement(input: {
  accessType: AccessType;
  family: ProposalProductFamily | null;
  total: number | null | undefined;
  pricing?: AccessPricing | null;
}): AccessEntitlement {
  const { accessType, family } = input;
  const included = includedAccesses(family, accessType);
  const total = input.total == null || !Number.isFinite(Number(input.total)) ? null : Number(input.total);
  const billable = total == null ? 0 : Math.max(0, total - included);
  const inconsistent = total != null && total < included;

  const pricing = input.pricing ?? null;
  const annualUnitPrice = annualizeUnitPrice(pricing?.unitPrice ?? null, pricing?.billingFrequency ?? null);

  return {
    accessType,
    label: ACCESS_LABELS[accessType],
    total,
    included,
    billable,
    unitPrice: pricing?.unitPrice ?? null,
    billingFrequency: pricing?.billingFrequency ?? null,
    annualUnitPrice,
    annualAmount: annualUnitPrice == null || billable === 0 ? (billable === 0 ? 0 : null) : round2(annualUnitPrice * billable),
    ruleCode: pricing?.ruleCode ?? null,
    ruleId: pricing?.ruleId ?? null,
    inconsistent,
    inconsistencyMessage: inconsistent
      ? `${ACCESS_LABELS[accessType]}: ${total} licensed is below the ${included} included by ${family}. Review the configuration — no credit is applied.`
      : null,
  };
}

export interface EntitlementSet {
  family: ProposalProductFamily | null;
  backoffice: AccessEntitlement;
  web: AccessEntitlement;
  list: AccessEntitlement[];
  /** Sum of the billable annual amounts (null contributions are skipped). */
  billableAnnualTotal: number;
  /** Billable quantities with no published price. */
  missingPrices: AccessType[];
  inconsistencies: string[];
}

export function computeEntitlements(input: {
  family: ProposalProductFamily | null;
  backofficeTotal: number | null | undefined;
  webTotal: number | null | undefined;
  pricing?: Partial<Record<AccessType, AccessPricing | null>>;
}): EntitlementSet {
  const backoffice = computeAccessEntitlement({
    accessType: "backoffice",
    family: input.family,
    total: input.backofficeTotal,
    pricing: input.pricing?.backoffice ?? null,
  });
  const web = computeAccessEntitlement({
    accessType: "web",
    family: input.family,
    total: input.webTotal,
    pricing: input.pricing?.web ?? null,
  });
  const list = [backoffice, web];
  return {
    family: input.family,
    backoffice,
    web,
    list,
    billableAnnualTotal: round2(list.reduce((s, e) => s + (e.annualAmount ?? 0), 0)),
    missingPrices: list.filter((e) => e.billable > 0 && e.annualUnitPrice == null).map((e) => e.accessType),
    inconsistencies: list.map((e) => e.inconsistencyMessage).filter((m): m is string => !!m),
  };
}

/** "Web accesses: 4 total · 1 included · 3 additional billable" */
export function entitlementLabel(e: AccessEntitlement): string {
  const total = e.total == null ? "Not recorded" : `${e.total} total`;
  return `${e.label}: ${total} · ${e.included} included · ${e.billable} additional billable`;
}

export function entitlementLabels(set: EntitlementSet): string[] {
  return set.list.map(entitlementLabel);
}

/* ------------------------------------------------------------------ */
/* Catalogue price lookup                                              */
/* ------------------------------------------------------------------ */

/** Catalogue codes that price an ADDITIONAL access, by product family. */
export const ACCESS_RULE_CODES: Record<ProposalProductFamily, Partial<Record<AccessType, string[]>>> = {
  Professional: { web: ["web_user"], backoffice: [] },
  Business: {
    web: ["BUS_WEB_MOBILE_USER"],
    backoffice: ["BUS_USEIT_ADDITIONAL_BACKOFFICE", "BUS_KEEPIT_ADDITIONAL_BACKOFFICE"],
  },
};

function frequencyOf(rule: PricingRule): AccessBillingFrequency | null {
  const unit = String(rule.unit_type || "").toLowerCase();
  if (unit.includes("month")) return "monthly";
  if (unit.includes("year") || unit.includes("annual")) return "yearly";
  const billing = String(rule.billing_frequency || "").toLowerCase();
  if (billing.includes("month")) return "monthly";
  if (billing.includes("year") || billing.includes("annual")) return "yearly";
  return null;
}

export function accessPricingFromRules(
  rules: PricingRule[] | null | undefined,
  family: ProposalProductFamily | null,
  accessType: AccessType,
  variant?: "keepit" | "useit" | null,
): AccessPricing | null {
  if (!family) return null;
  let codes = ACCESS_RULE_CODES[family]?.[accessType] ?? [];
  if (family === "Business" && accessType === "backoffice" && variant) {
    const preferred = variant === "keepit" ? "BUS_KEEPIT_ADDITIONAL_BACKOFFICE" : "BUS_USEIT_ADDITIONAL_BACKOFFICE";
    codes = [preferred, ...codes.filter((c) => c !== preferred)];
  }
  for (const code of codes) {
    const rule = (rules || []).find((r) => r.code === code && r.active !== false);
    if (rule) {
      return {
        unitPrice: Number(rule.unit_price || 0),
        billingFrequency: frequencyOf(rule),
        ruleCode: rule.code,
        ruleId: rule.id ?? null,
        label: rule.label,
      };
    }
  }
  return null;
}

export function entitlementPricingFromRules(
  rules: PricingRule[] | null | undefined,
  family: ProposalProductFamily | null,
  variant?: "keepit" | "useit" | null,
): Partial<Record<AccessType, AccessPricing | null>> {
  return {
    backoffice: accessPricingFromRules(rules, family, "backoffice", variant),
    web: accessPricingFromRules(rules, family, "web", variant),
  };
}

/* ------------------------------------------------------------------ */
/* Proposal lines                                                      */
/* ------------------------------------------------------------------ */

/**
 * One recurring line per access type WITH a billable quantity. Included
 * quantities are never charged, and never charged twice.
 */
export function buildAccessProposalItems(
  set: EntitlementSet,
  ctx: { sourcePlan?: number | null; targetPlan?: number | null; startSortOrder?: number },
): ProposalItem[] {
  let sort = ctx.startSortOrder ?? 0;
  const items: ProposalItem[] = [];
  for (const e of set.list) {
    if (e.billable <= 0) continue;
    const unit = e.annualUnitPrice ?? 0;
    const amount = round2(unit * e.billable);
    items.push({
      category: "addon",
      item_code: e.ruleCode || `access_${e.accessType}`,
      item_name: `Additional ${e.label.replace(" accesses", "")} accesses`,
      description:
        `${e.total ?? 0} licensed · ${e.included} included by ${set.family ?? "the product"} · ` +
        `${e.billable} additional billable at ${unit.toFixed(2)}/year each.`,
      qty: e.billable,
      unit_price: unit,
      frequency: "yearly",
      total: amount,
      discount_type: "none",
      discount_value: 0,
      gross_total: amount,
      discount_amount: 0,
      net_total: amount,
      is_override: false,
      is_recurring: true,
      sort_order: sort++,
      pricing_rule_code: e.ruleCode,
      pricing_rule_id: e.ruleId,
      source_plan: ctx.sourcePlan ?? null,
      target_plan: ctx.targetPlan ?? null,
      line_type: e.accessType === "web" ? "mww_web" : "license",
      change_kind: "access_addition",
      gross_delta: null,
      access_type: e.accessType,
      total_licensed_qty: e.total,
      included_qty: e.included,
      billable_qty: e.billable,
    });
  }
  return items;
}

/** Serializable entitlement snapshot persisted on the proposal. */
export function entitlementSnapshot(set: EntitlementSet): Record<string, unknown> {
  const one = (e: AccessEntitlement) => ({
    total: e.total,
    included: e.included,
    billable: e.billable,
    unit_price: e.unitPrice,
    billing_frequency: e.billingFrequency,
    annual_unit_price: e.annualUnitPrice,
    annual_amount: e.annualAmount,
    pricing_rule_code: e.ruleCode,
    inconsistent: e.inconsistent,
  });
  return {
    family: set.family,
    backoffice: one(set.backoffice),
    web: one(set.web),
    billable_annual_total: set.billableAnnualTotal,
    inconsistencies: set.inconsistencies,
  };
}
