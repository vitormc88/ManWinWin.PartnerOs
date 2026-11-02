import type { AdditionCommercial, AdditionPayment } from "./commercial-additions";

const LEGACY_UPFRONT_REFERENCE = "Proposed terms: 100% upfront; activation after full payment";
export const PROPOSED_PAYMENT_REFERENCE = "Proposed conditions in this proposal";
export const isGeneratedPaymentReference = (value: string) => [LEGACY_UPFRONT_REFERENCE, PROPOSED_PAYMENT_REFERENCE].includes(value);
export function upfrontAdditionPayment(previous: AdditionPayment): AdditionPayment {
  return { invoice: "award", awardPercent: 100, awardDueDays: 0, installationDueDays: 30, activation: "full_payment",
    reference: previous.reference.trim() && !isGeneratedPaymentReference(previous.reference) ? previous.reference : PROPOSED_PAYMENT_REFERENCE };
}

export function additionPaymentText(p: AdditionPayment, language: "PT" | "EN", servicesOnly = false) {
  if (!["award", "split"].includes(p.invoice) || !["full_payment", "award_payment", "on_award"].includes(p.activation)) {
    return language === "PT" ? "Condições de pagamento e ativação por definir." : "Payment and activation conditions have not been agreed yet.";
  }
  const pt = language === "PT", days = (n: number) => n === 0 ? (pt ? "pronto pagamento" : "due immediately") : pt ? `pagamento a ${n} dias` : `payment within ${n} days`;
  const invoice = p.invoice === "split"
    ? pt ? `Fatura de ${p.awardPercent}% na adjudicação, ${days(p.awardDueDays)}.\nFatura dos restantes ${100-p.awardPercent}% na instalação, ${days(p.installationDueDays)}.` : `${p.awardPercent}% invoiced on award, ${days(p.awardDueDays)}.\nRemaining ${100-p.awardPercent}% invoiced on installation, ${days(p.installationDueDays)}.`
    : pt ? `Fatura de 100% na adjudicação, ${days(p.awardDueDays)}.` : `100% invoiced on award, ${days(p.awardDueDays)}.`;
  const activation = p.activation === "full_payment" ? pt ? "Ativação após confirmação do pagamento integral." : "Activation after confirmation of full payment."
    : p.activation === "award_payment" ? pt ? "Ativação após confirmação do pagamento da fatura de adjudicação." : "Activation after confirmation of the award invoice payment."
    : pt ? "Ativação após adjudicação e autorização das condições de crédito por HQ; sem exigir pagamento antecipado." : "Activation following award and HQ authorization of credit terms; advance payment is not required.";
  const reference = isGeneratedPaymentReference(p.reference)
    ? pt ? "Condições propostas neste documento, sujeitas a aceitação." : "Conditions proposed in this document, subject to acceptance."
    : `${pt ? "Referência comercial" : "Commercial reference"}: ${p.reference}`;
  const commencement = servicesOnly ? activation.replace(/^Ativação /,"Início dos serviços ").replace(/^Activation /,"Service commencement ") : activation;
  return `${invoice}\n${commencement}\n${reference}`;
}
export function additionValidUntil(c: AdditionCommercial) {
  const date = new Date(`${c.proposalDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+c.validityDays);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : "";
}
