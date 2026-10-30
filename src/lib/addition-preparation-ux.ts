import { calculateAddition, type AdditionBaseline, type AdditionSelection } from "./commercial-additions";
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

export function additionPreparationBlockers(b: AdditionBaseline, s: AdditionSelection) {
  return !s.baselineAnnualConfirmed || b.recordedAnnual == null || !Number.isFinite(b.recordedAnnual) || b.recordedAnnual < 0
    ? ["Confirm the recorded annual baseline and the matching customer/partner price basis before issuing the proposal."] : [];
}

export interface AdditionReview { id: string; step: number; target: string; title: string; owner: string; details: string[] }
/** Keep technical guards intact, while giving each actionable task one place and owner. */
export function additionReviews(blockers: string[], hasItems: boolean): AdditionReview[] {
  const groups = new Map<string, AdditionReview>();
  const definitions: [RegExp, Omit<AdditionReview, "details">][] = [
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
    const match = definitions.find(([pattern]) => pattern.test(message));
    const definition = match?.[1] ?? { id: `source-${message}`, step: 1, target: "addition-source", title: "Review the source contract or price data", owner: "HQ / contract owner" };
    const existing = groups.get(definition.id);
    if (existing) existing.details.push(message);
    else groups.set(definition.id, { ...definition, details: [message] });
  }
  return [...groups.values()].sort((a, b) => a.step - b.step || Number(b.id === "items") - Number(a.id === "items"));
}
