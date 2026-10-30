import type { AdditionCommercial, AdditionPayment } from "./commercial-additions";

export function additionPaymentText(p: AdditionPayment, language: "PT" | "EN") {
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
  return `${invoice}\n${activation}\n${pt ? "Referência do acordo" : "Agreement reference"}: ${p.reference}`;
}
export function additionValidUntil(c: AdditionCommercial) {
  const date = new Date(`${c.proposalDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+c.validityDays);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : "";
}
