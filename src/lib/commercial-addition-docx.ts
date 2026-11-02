import { saveAs } from "file-saver";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "./commercial-additions";
import { buildAdditionPrintHtml } from "./commercial-addition-documents";
import { generateBrandedDocx } from "./proposal-branded-docx";
export async function generateAdditionDocx(proposal: Partial<Proposal>, draft: AdditionDraft) {
  return generateBrandedDocx(buildAdditionPrintHtml(proposal, draft));
}
export async function downloadAdditionDocx(proposal: Partial<Proposal>, draft: AdditionDraft) {
  const blob = await generateAdditionDocx(proposal, draft);
  saveAs(blob, `Addition_${draft.baseline.clientName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${proposal.id && proposal.version ? `v${proposal.version}` : "preview"}.docx`);
}
