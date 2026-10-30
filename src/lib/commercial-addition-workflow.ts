import { commercialTermsChanged } from "./proposal-workflow";
import type { AdditionDraft } from "./commercial-additions";
import type { Proposal } from "@/types/proposal";

export type AdditionOperation = "validate" | "sent" | "accept" | "reject" | "revise" | "activate";
export function additionOperations(status: string, activated: boolean): AdditionOperation[] {
  if (status === "Draft") return ["validate", "reject"];
  if (status === "Ready") return ["sent", "accept", "revise", "reject"];
  if (status === "Sent") return ["accept", "revise", "reject"];
  if (status === "Accepted" && !activated) return ["activate"];
  return [];
}
export function additionMatchesSaved(saved: Proposal, draft: AdditionDraft, terms: string, notes: string): boolean {
  return (saved.notes || "") === notes && !commercialTermsChanged(
    { proposal: { business_config: saved.business_config, payment_terms: saved.payment_terms }, items: [] },
    { proposal: { business_config: { commercial_addition: draft }, payment_terms: terms }, items: [] },
  );
}
export const additionOperationLabels: Record<AdditionOperation, string> = {
  validate: "Mark Ready", sent: "Mark Sent", accept: "Adjudicate", reject: "Reject", revise: "Return to Draft", activate: "Activate awarded additions",
};
