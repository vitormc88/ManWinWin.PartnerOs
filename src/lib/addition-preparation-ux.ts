import { calculateAddition, type AdditionBaseline, type AdditionSelection, type AdditionLine, type AdditionAdjustment } from "./commercial-additions";
import type { PricingRule } from "@/types/proposal";

/** Only Business UseIT capital components have two genuinely different calculations. */
export function needsAdditionCalculationChoice(b: AdditionBaseline, s: AdditionSelection) {
  return b.family === "Business" && b.model === "useit" && (s.backoffice > 0 || s.products.some(id => id !== "api"));
}
export function needsAdditionHostingShare(b: AdditionBaseline, s: AdditionSelection) {
  return b.family === "Business" && b.deployment === "saas" && s.backoffice > 0;
}

export function normalizeAdditionScope(b: AdditionBaseline, s: AdditionSelection, rules: PricingRule[]) {
  const next = { ...s, pricingBasis: needsAdditionCalculationChoice(b, s) ? s.pricingBasis : "direct" as const,
    // Neutral, unused share only. Never infer a real hosting share from license terms.
    hostingShare: s.offerBasis === "partner" && !needsAdditionHostingShare(b, s) ? 100 : s.hostingShare };
  if (!s.commercial) return next;
  const codes = new Set(calculateAddition(b, next, rules).lines.map(l => l.code));
  return { ...next, commercial: { ...s.commercial, adjustments: Object.fromEntries(Object.entries(s.commercial.adjustments).filter(([code]) => codes.has(code))) } };
}

const componentKey = (code: string) => code.replace(/^BUS_(KEEPIT|USEIT)_/, "BUS_LICENSE_");
/** Preserve semantic concessions; a changed absolute tariff needs an explicit decision. */
export function changeAdditionCalculation(b: AdditionBaseline, s: AdditionSelection, rules: PricingRule[], basis: AdditionSelection["pricingBasis"], tariff: "keep" | "catalogue" = "keep"): AdditionSelection {
  const next = { ...s, pricingBasis: basis };
  if (!s.commercial) return next;
  const lines = calculateAddition(b, next, rules).lines;
  const adjustments: Record<string, AdditionAdjustment> = {};
  for (const [code, adjustment] of Object.entries(s.commercial.adjustments)) {
    const target = lines.find(line => line.code === code) ?? lines.find(line => componentKey(line.code) === componentKey(code));
    if (!target) { adjustments[code] = adjustment; continue; }
    adjustments[target.code] = { ...adjustment, unitPrice: target.code !== code && tariff === "catalogue" ? null : adjustment.unitPrice };
  }
  return { ...next, commercial: { ...s.commercial, adjustments } };
}
export function hasCalculationTariff(s: AdditionSelection) {
  return Object.entries(s.commercial?.adjustments || {}).some(([code, a]) => /^BUS_(KEEPIT|USEIT)_/.test(code) && a.unitPrice != null);
}

export interface AdditionFieldIssue { target: string; message: string; affectsAmount: boolean; code?: string; step?: number }
export function additionFieldIssues(s: AdditionSelection, lines: AdditionLine[], maxDiscount: number): AdditionFieldIssue[] {
  const issues: AdditionFieldIssue[] = [];
  for (const line of lines) {
    const a = s.commercial?.adjustments[line.code];
    if (!a) continue;
    for (const [field, value] of [["initial-discount", a.initialDiscountPct], ["renewal-discount", a.renewalDiscountPct]] as const) {
      if (!Number.isFinite(value) || value < 0 || value > maxDiscount) issues.push({ code: line.code, target: `${field}-${line.code}`, message: `${line.label}: ${field === "initial-discount" ? "initial" : "renewal"} discount must be between 0% and ${maxDiscount}%.`, affectsAmount: true });
    }
    if (a.unitPrice != null && (!Number.isFinite(a.unitPrice) || a.unitPrice < 0 || a.unitPrice > 100000000)) issues.push({ code: line.code, target: `price-${line.code}`, message: `${line.label}: enter a unit price between €0 and €100,000,000.`, affectsAmount: true });
    if (!a.reason.trim()) issues.push({ code: line.code, target: `reason-${line.code}`, message: `${line.label}: enter the commercial justification for this discount or negotiated tariff.`, affectsAmount: false });
  }
  const c = s.commercial;
  if (c) {
    const issue = (target: string, message: string) => issues.push({target,message,affectsAmount:false,step:2});
    if (!Number.isSafeInteger(c.validityDays) || c.validityDays < 1 || c.validityDays > 365) issue("addition-validity", "Enter a proposal validity between 1 and 365 whole days.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.proposalDate) || !Number.isFinite(Date.parse(`${c.proposalDate}T00:00:00Z`))) issue("addition-proposal-date", "Enter a valid proposal date.");
    const p = c.payment;
    if (!["award", "split"].includes(p.invoice)) issue("addition-invoice", "Choose when the proposal will be invoiced.");
    if (!["full_payment", "award_payment", "on_award"].includes(p.activation)) issue("addition-activation-condition", "Choose the payment condition required before activation.");
    if (!p.reference.trim()) issue("addition-payment-agreement", "Enter the proposed conditions or the existing commercial agreement reference.");
    if (!Number.isSafeInteger(p.awardDueDays) || p.awardDueDays < 0 || p.awardDueDays > 365) issue("addition-award-due", "Enter an invoice due date between 0 and 365 whole days.");
    if (p.invoice === "split") {
      if (!Number.isFinite(p.awardPercent) || p.awardPercent <= 0 || p.awardPercent >= 100) issue("addition-award-percent", "The award invoice must be greater than 0% and less than 100% for split billing.");
      if (!Number.isSafeInteger(p.installationDueDays) || p.installationDueDays < 0 || p.installationDueDays > 365) issue("addition-installation-due", "Enter an installation invoice due date between 0 and 365 whole days.");
    }
  }
  return issues;
}

export function additionPreparationBlockers(b: AdditionBaseline, s: AdditionSelection) {
  return !s.baselineAnnualConfirmed || b.recordedAnnual == null || !Number.isFinite(b.recordedAnnual) || b.recordedAnnual < 0
    ? ["Confirm the recorded annual baseline and the matching customer/partner price basis before issuing the proposal."] : [];
}

export interface AdditionReview { id: string; step: number; target: string; title: string; owner: string; details: string[] }
/** Keep technical guards intact, while giving each actionable task one place and owner. */
export function additionReviews(blockers: string[], hasItems: boolean, issues: AdditionFieldIssue[] = []): AdditionReview[] {
  const groups = new Map<string, AdditionReview>();
  for (const issue of issues) {
    const id = issue.step === 2 ? "payment-inputs" : issue.target;
    if (groups.has(id)) groups.get(id)!.details.push(issue.message);
    else groups.set(id, { id, target: issue.target, step: issue.step ?? 1, title: issue.message, owner: "You · correct this field", details: [] });
  }
  const definitions: [RegExp, Omit<AdditionReview, "details">][] = [
    [/services budget|services review|training \/ implementation|onsite travel|service quantity|service discount|services quotation/, {id:"services-budget",step:0,target:"addition-services",title:"Complete and save the linked services budget request",owner:"Services budget owner"}],
    [/software only/, {id:"services-exclusion",step:2,target:"addition-software-only",title:"Confirm software and services are separately quoted",owner:"You"}],
    [/annual baseline/, { id: "baseline", step: 1, target: "addition-baseline", title: "Confirm the existing annual renewal", owner: "Contract review · HQ if uncertain" }],
    [/billable.month|effective date|Renewal date|agreed billable/, { id: "period", step: 1, target: "addition-effective", title: "Confirm the period to charge", owner: "You · use the agreed contract rule" }],
    [/pricing decision|price table|catalogue|calculation/, { id: "catalogue", step: 1, target: "addition-price-review", title: "Confirm which prices apply", owner: "Price review · HQ for exceptions" }],
    [/customer prices|partner basis|revenue shares/, { id: "basis", step: 1, target: "addition-offer", title: "Choose who the prices are for", owner: "You · HQ confirms partner shares" }],
    [/implementation services/, { id: "services", step: 0, target: "addition-implementation", title: "Confirm whether services are needed", owner: "You" }],
    [/Select at least|quantities|already licensed|Professional|Duplicate components/, { id: "items", step: 0, target: "addition-items", title: "Choose the items to propose", owner: "You" }],
    [/invoic|activation conditions|payment terms|credit|agreement reference/, { id: "payment", step: 2, target: "addition-payment", title: "Set the proposed payment conditions", owner: "You · HQ approves credit exceptions" }],
    [/language|validity/, { id: "document", step: 2, target: "addition-language", title: "Check the document date and validity", owner: "You" }],
    [/discount|negotiated|adjustment/, { id: "discounts", step: 1, target: "addition-discounts", title: "Review the discounts and justification", owner: "You · within your authorization" }],
  ];
  for (const message of new Set(blockers)) {
    // An empty basket has no price yet; it is not an additional invalid-amount task.
    if (!hasItems && /incremental quote must have finite/.test(message)) continue;
    if (issues.length && (/Review the negotiated price, discount and justification:/.test(message) || issues.some(i => i.affectsAmount) && /Negotiated amounts must be finite/.test(message))) continue;
    if (issues.some(i=>i.step===2) && /Choose explicit invoicing|proposal language, date and validity|Complete the proposed payment terms/.test(message)) continue;
    const match = definitions.find(([pattern]) => pattern.test(message));
    const definition = match?.[1] ?? { id: `source-${message}`, step: 1, target: "addition-source", title: "Review the source contract or price data", owner: "HQ / contract owner" };
    const existing = groups.get(definition.id);
    if (existing) existing.details.push(message);
    else groups.set(definition.id, { ...definition, details: [message] });
  }
  return [...groups.values()].sort((a, b) => a.step - b.step || Number(b.id === "items") - Number(a.id === "items"));
}
