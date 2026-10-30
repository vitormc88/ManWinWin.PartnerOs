import type { PricingRule } from "@/types/proposal";
import { readLicenseVocabulary, normalizeDeployment } from "@/lib/licensing";

export const ADDITION_SCHEMA = "commercial_addition_v1";
export const ADDITION_ACTIONS = ["add_users", "add_modules", "add_plugins"] as const;
export type AdditionAction = typeof ADDITION_ACTIONS[number];
export const ADDITION_PRODUCTS = [
  { id: "requests", label: "Maintenance Requests", suffix: "REQUESTS_MODULE", kind: "module", aliases: ["maintenance requests", "requests", "pman"] },
  { id: "stock", label: "Stock Management", suffix: "STOCK_MODULE", kind: "module", aliases: ["stock management", "stock", "inventory"] },
  { id: "purchase", label: "Purchase Management", suffix: "PURCHASE_MODULE", kind: "module", aliases: ["purchase management", "purchase orders", "purchasing", "purchase"] },
  { id: "import", label: "Import Tool", suffix: "PLUGIN_IMPORT", kind: "plugin", aliases: ["import tool", "data import", "import"] },
  { id: "workflow", label: "Workflow", suffix: "PLUGIN_WORKFLOW", kind: "plugin", aliases: ["workflow", "workflow email notifications"] },
  { id: "reports", label: "Advanced Reports", suffix: "PLUGIN_ADVANCED_REPORTS", kind: "plugin", aliases: ["advanced reports", "advanced reporting"] },
  { id: "sla", label: "SLA", suffix: "PLUGIN_SLA", kind: "plugin", aliases: ["sla", "sla management"] },
  { id: "api", label: "API ManWinWin", suffix: "API", kind: "plugin", aliases: ["api", "api manwinwin", "api access"] },
] as const;
export type AdditionProduct = typeof ADDITION_PRODUCTS[number]["id"];
export interface AdditionBaseline {
  clientId: string; clientName: string; partnerId: string | null;
  licenseId: string | null; contractId: string | null;
  family: "Business" | "Professional" | null; model: "keepit" | "useit" | null;
  plan: number | null; deployment: "saas" | "on_premise" | null;
  backoffice: number; web: number; owned: AdditionProduct[];
  renewalDate: string | null; priceTable: string | null; recordedAnnual: number | null;
  satActive: boolean | null;
  componentIds?: string[];
  licenseUpdatedAt?: string | null;
  contractUpdatedAt?: string | null;
  currency?: string;
}
export interface AdditionSelection {
  backoffice: number; web: number; products: AdditionProduct[];
  effectiveDate: string; renewalDate: string;
  monthPolicy: "" | "complete" | "started" | "agreed"; agreedMonths: number | null;
  pricingBasis: "" | "direct" | "derived";
  priceReview: string; monthReview: string;
  offerBasis: "" | "customer" | "partner";
  licenseShare: number | null; hostingShare: number | null;
  implementationReview: "" | "not_needed" | "separate";
  baselineAnnualConfirmed: boolean;
  commercial?: AdditionCommercial;
}
export interface AdditionAdjustment {
  unitPrice: number | null;
  initialDiscountPct: number;
  renewalDiscountPct: number;
  reason: string;
}
export interface AdditionPayment {
  invoice: "" | "award" | "split";
  awardPercent: number;
  awardDueDays: number;
  installationDueDays: number;
  activation: "" | "full_payment" | "award_payment" | "on_award";
  reference: string;
}
export interface AdditionCommercial {
  version: 2; language: "PT" | "EN"; proposalDate: string; validityDays: number;
  adjustments: Record<string, AdditionAdjustment>;
  payment: AdditionPayment;
}
export function initialAdditionCommercial(today: string): AdditionCommercial {
  return { version: 2, language: "PT", proposalDate: today, validityDays: 30, adjustments: {},
    payment: { invoice: "", awardPercent: 100, awardDueDays: 0, installationDueDays: 30, activation: "", reference: "" } };
}
export interface AdditionLine {
  code: string; label: string; quantity: number; ruleCodes: string[];
  annual: number; oneTime: number; dueNow: number; kind: "license" | "sat" | "hosting" | "web" | "api";
  referenceAnnual?: number; referenceOneTime?: number; initialAnnual?: number;
  referenceUnitPrice?: number; unitPrice?: number; unitPeriod?: "month" | "year" | "once";
  initialDiscountPct?: number; renewalDiscountPct?: number; reason?: string;
}
export interface AdditionQuote {
  months: number | null; lines: AdditionLine[]; blockers: string[];
  dueNow: number; annualIncrease: number; renewalAnnual: number | null;
  afterBackoffice: number; afterWeb: number; supportNote: string;
}
export interface AdditionDraft {
  schema: typeof ADDITION_SCHEMA; action: AdditionAction; baseline: AdditionBaseline;
  selection: AdditionSelection; rules: PricingRule[]; quote: AdditionQuote;
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function canonicalAdditionProduct(value: string): AdditionProduct | null {
  const name = normalize(value);
  return ADDITION_PRODUCTS.find(p => p.id === name || normalize(p.suffix) === name.replace(/^bus (keepit|useit) /, "") || p.aliases.some(alias => name === alias || name === `${alias} module` || name === `${alias} plugin` || name === `manwinwin ${alias}`))?.id ?? null;
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === "string" ? v : "";
export function additionBaselineFromSnapshot(snapshot: unknown): AdditionBaseline {
  const s = record(snapshot), license = record(s.license), contract = record(s.contract);
  const vocabulary = readLicenseVocabulary({ product: text(license.product), edition: text(license.edition), license_model: text(license.license_model), deployment_type: text(license.deployment_type), database_type: text(license.database_type) });
  const family = vocabulary.product.family || (s.licenseFamily === "Business" || s.licenseFamily === "Professional" ? s.licenseFamily : null);
  const variant = normalize(vocabulary.product.family ? vocabulary.product.value : text(s.licenseVariant) || text(license.license_model));
  const deployment = normalize(normalizeDeployment(text(license.deployment_type), text(s.deployment)).value);
  const rows = [...(Array.isArray(s.modules) ? s.modules : []), ...(Array.isArray(s.plugins) ? s.plugins : [])];
  const owned = rows.flatMap(value => {
    const r = record(value);
    const id = canonicalAdditionProduct(text(r.module_name) || text(r.plugin_name) || text(r.name) || text(r.code));
    return id ? [id] : [];
  });
  if (s.apiAccess === true || license.api_access === true) owned.push("api");
  const planToken = variant.replace(/^(professional|plan)\s*/, "");
  const plan = ({ i: 1, ii: 2, iii: 3 } as Record<string, number>)[planToken] ?? Number(planToken);
  if (family === "Professional" && plan >= 2) owned.push("stock");
  if (family === "Professional" && plan === 3) owned.push("purchase");
  return {
    clientId: text(s.clientId), clientName: text(s.clientName), partnerId: text(s.partnerId) || null,
    licenseId: text(license.id) || null, contractId: text(contract.id) || null,
    family, model: family === "Business" ? variant.replace(/ /g, "").includes("keepit") ? "keepit" : variant.replace(/ /g, "").includes("useit") ? "useit" : null : null,
    plan: plan >= 1 && plan <= 3 ? plan : null,
    deployment: deployment === "saas" || deployment === "cloud" ? "saas" : /on.?prem|client.server/.test(deployment) ? "on_premise" : null,
    backoffice: Number(s.backofficeUsers) || 0, web: Number(s.webUsers) || 0,
    owned: [...new Set(owned)], renewalDate: text(s.renewalDate) || null,
    priceTable: text(contract.price_table_reference) || null,
    recordedAnnual: typeof s.arr === "number" && Number.isFinite(s.arr) ? s.arr : null,
    satActive: typeof s.satActive === "boolean" ? s.satActive : null,
    componentIds: rows.map(value => text(record(value).id)).filter(Boolean).sort(),
    licenseUpdatedAt: text(license.updated_at) || null,
    contractUpdatedAt: text(contract.updated_at) || null,
    currency: text(license.currency) || text(contract.currency) || "EUR",
  };
}
export function initialAdditionSelection(b: AdditionBaseline, today: string): AdditionSelection {
  return { backoffice: 0, web: 0, products: [], effectiveDate: today, renewalDate: b.renewalDate || "",
    monthPolicy: "", agreedMonths: null, pricingBasis: "", priceReview: "", monthReview: "",
    offerBasis: "", licenseShare: null, hostingShare: null, implementationReview: "", baselineAnnualConfirmed: false };
}
function utcDay(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? d : null;
}
/** Month anniversaries clamp to month end; no implicit floor/ceil or 12-month cap. */
export function additionMonths(start: string, end: string, policy: AdditionSelection["monthPolicy"], agreed: number | null): number | null {
  const a = utcDay(start), b = utcDay(end);
  if (!a || !b || b <= a || !policy) return null;
  if (policy === "agreed") return agreed != null && Number.isFinite(agreed) && agreed > 0 ? agreed : null;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const year = a.getUTCFullYear(), month = a.getUTCMonth() + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(year, month, Math.min(a.getUTCDate(), last)));
  if (anniversary > b) months--;
  const complete = months;
  const endOfCompleteMonth = new Date(Date.UTC(year, a.getUTCMonth() + complete, Math.min(a.getUTCDate(), new Date(Date.UTC(year, a.getUTCMonth() + complete + 1, 0)).getUTCDate())));
  return policy === "started" && endOfCompleteMonth < b ? complete + 1 : complete;
}
function calculateCatalogueAddition(b: AdditionBaseline, s: AdditionSelection, rules: PricingRule[]): AdditionQuote {
  const blockers: string[] = [], lines: AdditionLine[] = [];
  const months = additionMonths(s.effectiveDate, s.renewalDate, s.monthPolicy, s.agreedMonths);
  if (!b.clientId || !b.licenseId || !b.contractId) blockers.push("A linked client, license and contract are required.");
  if (b.currency && b.currency !== "EUR") blockers.push("This addition catalogue supports EUR contracts only; a reviewed currency conversion is required.");
  if (!b.family || !b.deployment || (b.family === "Business" && !b.model) || (b.family === "Professional" && !b.plan)) blockers.push("Current license identity or hosting is incomplete; reconcile the source first.");
  if (b.renewalDate !== s.renewalDate) blockers.push("Renewal date must match the source contract; reconcile it before quoting.");
  if (months == null || months <= 0) blockers.push("Choose a valid effective date and an explicit positive billable-month policy.");
  if (s.monthPolicy === "agreed" && !s.monthReview.trim()) blockers.push("Explain the agreed billable months.");
  if (!s.pricingBasis || !s.priceReview.trim()) blockers.push("Review the applicable price table and record the pricing decision.");
  if (!s.offerBasis) blockers.push("Choose customer prices or a confirmed Navaltik/partner basis.");
  if (!s.implementationReview) blockers.push("Review whether implementation services are needed; none are added automatically.");
  if (![s.backoffice, s.web].every(n => Number.isSafeInteger(n) && n >= 0)) blockers.push("Additional user quantities must be whole, non-negative numbers.");
  if (!s.backoffice && !s.web && !s.products.length) blockers.push("Select at least one additional access or component.");
  if (new Set(s.products).size !== s.products.length) blockers.push("Duplicate components are not allowed.");
  if (s.products.some(id => b.owned.includes(id))) blockers.push("A selected component is already licensed; it must not be charged again.");
  if (b.family === "Professional" && (s.backoffice > 0 || s.products.some(id => id !== "requests"))) blockers.push("Professional does not support these additions separately. Use a supported license upgrade instead.");
  const shares = s.offerBasis === "partner" ? [s.licenseShare, s.hostingShare] : [100, 100];
  if (shares.some(n => n == null || !Number.isFinite(n) || n < 0 || n > 100)) blockers.push("Confirm both partner revenue shares (0–100%); they are never inferred from notes.");
  const licenseShare = (shares[0] ?? 0) / 100, hostingShare = (shares[1] ?? 0) / 100;
  const byCode = new Map(rules.filter(r => r.active).map(r => [r.code, r]));
  const price = (code: string, percentage = false) => {
    const r = byCode.get(code), value = Number(percentage ? r?.support_percentage : r?.unit_price);
    const expectedUnit = code === "BUS_USEIT_FACTOR" ? "percentage" : code === "BUS_KEEPIT_SAT" ? "yearly" : code.startsWith("BUS_KEEPIT_") ? "one-time" : ["BUS_WEB_MOBILE_USER", "web_user", "BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE"].includes(code) ? "per-user-month" : "yearly";
    if (!r || r.currency !== "EUR" || r.unit_type !== expectedUnit || !Number.isFinite(value) || value <= 0 || (percentage && value > 100)) {
      blockers.push(`Missing, zero, invalid or non-EUR catalogue rule: ${code}.`); return 0;
    }
    return value;
  };
  const add = (code: string, label: string, quantity: number, annual: number, oneTime: number, kind: AdditionLine["kind"], ruleCodes = [code]) => {
    const share = kind === "hosting" ? hostingShare : licenseShare;
    const annualNet = round(annual * share), onceNet = round(oneTime * share);
    lines.push({ code, label, quantity, annual: annualNet, oneTime: onceNet, dueNow: round(onceNet + annualNet * (months ?? 0) / 12), kind, ruleCodes });
  };
  const licensePart = (suffix: string, label: string, qty: number) => {
    if (b.model === "keepit") {
      const code = `BUS_KEEPIT_${suffix}`, base = price(code) * qty;
      add(code, label, qty, 0, base, "license");
      if (b.satActive !== true) blockers.push("Confirm the active KeepIT S&AT arrangement before adding license components.");
      const pct = price("BUS_KEEPIT_SAT", true);
      add(`${code}_SAT`, `${label} — incremental S&AT (${pct}%)`, qty, base * pct / 100, 0, "sat", [code, "BUS_KEEPIT_SAT"]);
    } else {
      const derived = s.pricingBasis === "derived";
      const code = `BUS_${derived ? "KEEPIT" : "USEIT"}_${suffix}`;
      const factor = derived ? price("BUS_USEIT_FACTOR", true) / 100 : 1;
      add(code, `${label} — UseIT, S&AT included`, qty, price(code) * factor * qty, 0, "license", derived ? [code, "BUS_USEIT_FACTOR"] : [code]);
    }
  };
  if (b.family === "Business" && s.backoffice > 0) {
    licensePart("ADDITIONAL_BACKOFFICE", "Additional BackOffice", s.backoffice);
    if (b.deployment === "saas") add("BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE", "Additional BackOffice SaaS hosting", s.backoffice, price("BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE") * 12 * s.backoffice, 0, "hosting");
  }
  if (s.web > 0) {
    const code = b.family === "Business" ? "BUS_WEB_MOBILE_USER" : "web_user";
    add(code, "Additional WEB / Mobility", s.web, price(code) * 12 * s.web, 0, "web");
  }
  for (const id of s.products) {
    const p = ADDITION_PRODUCTS.find(p => p.id === id);
    if (!p) { blockers.push(`Unknown component: ${id}.`); continue; }
    if (b.family === "Professional") {
      if (id === "requests") add("requests_module", p.label, 1, price("requests_module"), 0, "license");
    } else if (id === "api") add("BUS_API", p.label, 1, price("BUS_API"), 0, "api");
    else licensePart(p.suffix, p.label, 1);
  }
  const annualIncrease = round(lines.reduce((n, l) => n + l.annual, 0));
  const dueNow = round(lines.reduce((n, l) => n + l.dueNow, 0));
  if (!Number.isFinite(dueNow) || !Number.isFinite(annualIncrease) || dueNow <= 0 || dueNow > 100000000 || annualIncrease > 100000000) blockers.push("The incremental quote must have finite, positive amounts within the supported range.");
  if (months != null && months > 1200) blockers.push("Billable months exceed the supported range.");
  return { months, lines, blockers: [...new Set(blockers)], dueNow, annualIncrease,
    renewalAnnual: s.baselineAnnualConfirmed && b.recordedAnnual != null ? round(b.recordedAnnual + annualIncrease) : null,
    afterBackoffice: b.backoffice + s.backoffice, afterWeb: b.web + s.web,
    supportNote: b.family === "Business" && b.model === "keepit" ? "Only the incremental S&AT is charged for the remaining period. Existing S&AT/base fees are not charged again."
      : "S&AT is included in UseIT/Professional licensing. No additional 17% S&AT is stacked on top. Existing base services are not charged again." };
}
/** Legacy snapshots keep their exact calculation. Detailed terms are opt-in and frozen on save. */
export function calculateAddition(b: AdditionBaseline, s: AdditionSelection, rules: PricingRule[]): AdditionQuote {
  const q = calculateCatalogueAddition(b, s, rules), c = s.commercial;
  if (!c) return q;
  const blockers = [...q.blockers];
  if (c.version !== 2 || !["PT", "EN"].includes(c.language) || !utcDay(c.proposalDate)
    || !Number.isSafeInteger(c.validityDays) || c.validityDays < 1 || c.validityDays > 365) blockers.push("Review proposal language, date and validity (1–365 days).");
  const payment = c.payment;
  if (!payment || !["award", "split"].includes(payment.invoice) || !["full_payment", "award_payment", "on_award"].includes(payment.activation)
    || ![payment.awardDueDays, payment.installationDueDays].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 365)
    || (payment.invoice === "award" ? payment.awardPercent !== 100 : !Number.isFinite(payment.awardPercent) || payment.awardPercent <= 0 || payment.awardPercent >= 100)
    || !payment.reference?.trim()) blockers.push("Choose explicit invoicing, due dates and activation conditions, with the agreement reference.");
  if (c.proposalDate > s.effectiveDate) blockers.push("The effective date cannot precede the proposal date.");
  const raw = new Map(q.lines.map(l => [l.code, l]));
  if (!c.adjustments || typeof c.adjustments !== "object" || Array.isArray(c.adjustments)) blockers.push("Invalid component pricing adjustments.");
  for (const code of Object.keys(c.adjustments || {})) if (!raw.has(code)) blockers.push(`Remove the adjustment for an unselected component: ${code}.`);
  const unitFactor = (l: AdditionLine) => l.kind === "web" || l.kind === "hosting" ? 12 : 1;
  const bases = new Map(q.lines.map(l => {
    const factor = unitFactor(l), original = (l.oneTime || l.annual) / l.quantity / factor;
    const a = c.adjustments?.[l.code];
    if (a && (a.unitPrice != null && (!Number.isFinite(a.unitPrice) || a.unitPrice < 0 || a.unitPrice > 100000000)
      || ![a.initialDiscountPct, a.renewalDiscountPct].every(n => Number.isFinite(n) && n >= 0 && n <= 100)
      || !a.reason?.trim() || l.oneTime > 0 && a.renewalDiscountPct !== 0 || l.kind === "sat" && a.unitPrice != null)) blockers.push(`Review the negotiated price, discount and justification: ${l.label}.`);
    const unit = l.kind === "sat" ? original : a?.unitPrice ?? original;
    return [l.code, { unit, original, annual: l.annual > 0 ? round(unit * l.quantity * factor) : 0, once: l.oneTime > 0 ? round(unit * l.quantity) : 0 }];
  }));
  const lines = q.lines.map(l => {
    const a = c.adjustments?.[l.code], v = bases.get(l.code)!;
    // KeepIT S&AT follows the negotiated capital tariff. Discounts on the purchase
    // itself do not silently change the separately agreed S&AT discount.
    if (l.kind === "sat") {
      const parentCode = l.code.replace(/_SAT$/, ""), parent = raw.get(parentCode), adjusted = bases.get(parentCode);
      if (parent?.oneTime && adjusted) v.annual = round(l.annual * adjusted.once / parent.oneTime);
      v.unit = v.annual / l.quantity;
    }
    const initialPct = a?.initialDiscountPct ?? 0, renewalPct = a?.renewalDiscountPct ?? 0;
    const initialAnnual = round(v.annual * (1 - initialPct / 100));
    const annual = round(v.annual * (1 - renewalPct / 100)), once = round(v.once * (1 - initialPct / 100));
    return { ...l, annual, oneTime: once, initialAnnual, dueNow: round(once + initialAnnual * (q.months ?? 0) / 12),
      referenceAnnual: v.annual, referenceOneTime: v.once, referenceUnitPrice: v.original, unitPrice: v.unit,
      unitPeriod: (l.oneTime > 0 ? "once" : unitFactor(l) === 12 ? "month" : "year") as AdditionLine["unitPeriod"],
      initialDiscountPct: initialPct, renewalDiscountPct: renewalPct, reason: a?.reason || "" };
  });
  const annualIncrease = round(lines.reduce((sum, l) => sum + l.annual, 0)), dueNow = round(lines.reduce((sum, l) => sum + l.dueNow, 0));
  if (![annualIncrease, dueNow, ...lines.flatMap(l => [l.annual, l.oneTime, l.initialAnnual!, l.dueNow])].every(n => Number.isFinite(n) && n >= 0 && n <= 100000000)) blockers.push("Negotiated amounts must be finite, non-negative and within the supported range.");
  return { ...q, lines, dueNow, annualIncrease, renewalAnnual: s.baselineAnnualConfirmed && b.recordedAnnual != null ? round(b.recordedAnnual + annualIncrease) : null, blockers: [...new Set(blockers)] };
}
export function readAdditionDraft(row: { business_config?: unknown } | null | undefined): AdditionDraft | null {
  const config = record(row?.business_config), draft = record(config.commercial_addition);
  const b = record(draft.baseline), s = record(draft.selection), q = record(draft.quote);
  if (draft.schema !== ADDITION_SCHEMA || !ADDITION_ACTIONS.some(a => a === draft.action) || !Array.isArray(draft.rules)
    || !Array.isArray(b.owned) || !Array.isArray(s.products) || !Array.isArray(q.lines) || !Array.isArray(q.blockers)
    || !["priceReview", "monthReview", "effectiveDate", "renewalDate"].every(k => typeof s[k] === "string")
    || typeof b.clientName !== "string" || typeof b.clientId !== "string") return null;
  if (![b.backoffice, b.web, s.backoffice, s.web].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)
    || ![...b.owned, ...s.products].every(id => typeof id === "string")
    || !draft.rules.every(value => { const r = record(value); return typeof r.code === "string" && typeof r.unit_type === "string" && typeof r.currency === "string" && typeof r.active === "boolean"; })) return null;
  if (s.commercial != null) {
    const c = record(s.commercial), p = record(c.payment), adjustments = record(c.adjustments);
    if (c.version !== 2 || !["PT", "EN"].includes(String(c.language)) || typeof c.proposalDate !== "string" || typeof c.validityDays !== "number"
      || !c.adjustments || Array.isArray(c.adjustments) || !c.payment
      || !["invoice", "activation", "reference"].every(k => typeof p[k] === "string")
      || !["awardPercent", "awardDueDays", "installationDueDays"].every(k => typeof p[k] === "number")
      || !Object.values(adjustments).every(value => { const a = record(value); return (a.unitPrice == null || typeof a.unitPrice === "number") && typeof a.initialDiscountPct === "number" && typeof a.renewalDiscountPct === "number" && typeof a.reason === "string"; })) return null;
  }
  return draft as unknown as AdditionDraft;
}
