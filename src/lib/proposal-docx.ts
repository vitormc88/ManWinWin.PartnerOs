/** Editable Word shares the Professional PDF composition and price engine. */
import { saveAs } from "file-saver";
import type { Proposal, ProposalItem } from "@/types/proposal";
import { buildProposalPrintHtml } from "./proposal-print";
import { generateBrandedDocx } from "./proposal-branded-docx";
import { proposalFileName } from "./proposal-document-control";
export async function generateProposalDocx(proposal: Proposal, items: ProposalItem[]): Promise<Blob> {
  return generateBrandedDocx(buildProposalPrintHtml(proposal, items));
}
export async function downloadProposalDocx(proposal: Proposal, items: ProposalItem[]) {
  const blob = await generateProposalDocx(proposal, items);
  const fileName = proposalFileName(proposal);
  saveAs(blob, fileName);
  return { blob, fileName };
}
