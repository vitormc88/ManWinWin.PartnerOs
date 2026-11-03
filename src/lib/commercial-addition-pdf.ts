import { proposalFileIdentity } from "./commercial-proposal-journey";
import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "./commercial-additions";
import { buildAdditionPrintHtml } from "./commercial-addition-documents";
import { createBrandedProposalPdf } from "./proposal-branded-pdf";

type AssetLoader = (path: string) => Promise<Uint8Array>;
/** PDF and Word now render the same composition, including grouped services and renewal metrics. */
export async function createAdditionPdf(proposal: Partial<Proposal>, draft: AdditionDraft, assets?: AssetLoader) {
  return createBrandedProposalPdf(buildAdditionPrintHtml(proposal,draft), assets);
}
export async function downloadAdditionPdf(proposal:Partial<Proposal>,draft:AdditionDraft) {
  const bytes=await createAdditionPdf(proposal,draft);
  const blob=new Blob([bytes as BlobPart],{type:"application/pdf"}),url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=`ManWinWin_${draft.baseline.clientName.replace(/[^a-zA-Z0-9_-]/g,"_")}_${proposalFileIdentity(proposal)}.pdf`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
