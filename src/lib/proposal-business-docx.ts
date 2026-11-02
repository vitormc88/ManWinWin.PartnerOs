/** Editable Word uses the same commercial composition as the Business PDF. */
import { saveAs } from "file-saver";
import type { PricingRule, Proposal } from "@/types/proposal";
import type { BusinessConfig } from "./proposal-business-engine";
import { buildBusinessProposalPrintHtml } from "./proposal-business-print";
import { generateBrandedDocx } from "./proposal-branded-docx";
import { proposalFileName } from "./proposal-document-control";
export interface BusinessDocxOptions { proposal: Proposal; cfg: BusinessConfig; rules: PricingRule[] }
export async function generateBusinessProposalDocx(opts: BusinessDocxOptions): Promise<Blob> {
  return generateBrandedDocx(buildBusinessProposalPrintHtml(opts));
}
export interface BusinessDocxResult { blob: Blob; fileName: string }
export async function downloadBusinessProposalDocx(opts: BusinessDocxOptions): Promise<BusinessDocxResult> {
  const blob = await generateBusinessProposalDocx(opts);
  const fileName = proposalFileName(opts.proposal, "Business_Proposal");
  saveAs(blob, fileName);
  return { blob, fileName };
}
