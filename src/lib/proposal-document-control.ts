import type { Proposal } from "@/types/proposal";

export const PROPOSAL_SUPPORT_EMAIL = "support@manwinwin.com";
export const PROPOSAL_WEBSITE = "www.manwinwin.com";

export function proposalDocumentTitle(proposal: Pick<Proposal, "client_name" | "version">, label = "Investment Proposal") {
  return `${label} — ${proposal.client_name} — v${proposal.version}`;
}

export function proposalFileName(
  proposal: Pick<Proposal, "client_name" | "version">,
  prefix = "Proposal",
) {
  const client = proposal.client_name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80) || "Client";
  return `${prefix}_${client}_v${proposal.version}.docx`;
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