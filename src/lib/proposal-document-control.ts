import type { Proposal } from "@/types/proposal";
import { proposalIdentity, proposalRevisionLabel } from "./commercial-proposal-journey";

export const PROPOSAL_SUPPORT_EMAIL = "support@manwinwin.com";
export const PROPOSAL_WEBSITE = "www.manwinwin.com";

export function proposalDocumentTitle(proposal: Pick<Proposal, "client_name" | "version"> & Partial<Proposal>, label = "Investment Proposal") {
  return `${label} — ${proposal.client_name} — ${proposal.commercial_reference?proposalIdentity(proposal):proposalRevisionLabel(proposal)}`;
}

export function proposalFileName(
  proposal: Pick<Proposal, "client_name" | "version"> & Partial<Proposal>,
  prefix = "Proposal",
) {
  const client = proposal.client_name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80) || "Client";
  return `${proposal.commercial_reference?`${proposal.commercial_reference}_`:""}${prefix}_${client}_${proposalRevisionLabel(proposal).replace(/\. /g,"_")}.docx`;
}

/** Keep entered terms readable without changing their wording. */
export function proposalTermLines(value: string | null | undefined): string[] {
  const source = (value || "").trim();
  if (!source) return [];
  const lines = source
    .split(/\r?\n|\s*[•·]\s*/g)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : [source];
}
