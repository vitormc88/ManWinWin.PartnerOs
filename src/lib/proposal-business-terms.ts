import type { Proposal } from "@/types/proposal";
import { proposalTermLines } from "./proposal-document-control";

type DefaultTerms = { standardTerms: string; paymentLine1: string; paymentLine2: string; footnote1: string; footnote2: string };
/** User-entered terms replace defaults, never silently add conflicting conditions. */
export function businessPaymentSection(value: string | null | undefined, defaults: DefaultTerms) {
  const lines = proposalTermLines(value);
  if (!lines.length) return { heading: defaults.standardTerms, lines: [defaults.paymentLine1, defaults.paymentLine2], footnotes: [defaults.footnote1, defaults.footnote2] };
  const normalize = (text: string) => text.trim().replace(/:$/, "").toLocaleLowerCase();
  const hasHeading = normalize(lines[0]) === normalize(defaults.standardTerms);
  return { heading: hasHeading ? lines[0] : null, lines: hasHeading ? lines.slice(1) : lines, footnotes: [] as string[] };
}
export function businessNotesTitle(language: string) {
  return language === "PT" ? "Notas / Condições especiais" : language === "ES" ? "Notas / Condiciones especiales" : "Notes / Special Conditions";
}
export function withCurrentBusinessDocumentText(proposal: Proposal, paymentTerms: string, notes: string): Proposal {
  return { ...proposal, payment_terms: paymentTerms, notes: notes || null };
}
/** Stored documents must match saved commercial text; saving remains explicit. */
export function assertSavedBusinessDocumentText(proposal: Proposal, paymentTerms: string, notes: string) {
  if ((proposal.payment_terms || "") !== paymentTerms || (proposal.notes || "") !== notes) {
    throw new Error("Payment terms or special conditions have unsaved changes. Save as Draft first, then reopen and generate the stored Word document.");
  }
}
