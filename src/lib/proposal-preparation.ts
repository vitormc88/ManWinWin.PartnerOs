import type { Proposal } from "@/types/proposal";
import type { AdditionDraft } from "./commercial-additions";

export interface PreparationDraft {
  id: string; client_id: string; license_id: string; contract_id: string; partner_uuid: string | null;
  proposal_id: string | null; proposal_updated_at: string | null;
  kind: "addition" | "request"; body: Record<string, unknown>; updated_at: string;
}
export function preparationProposal(row: PreparationDraft, clientName: string): Proposal {
  return {
    id: row.proposal_id || row.id, source_type: "client", client_id: row.client_id,
    contract_id: row.contract_id, license_id: row.license_id, partner_uuid: row.partner_uuid,
    client_name: clientName, status: "Draft", version: 0, updated_at: row.proposal_updated_at,
    notes: String(row.body.notes || ""), payment_terms: String(row.body.terms || ""),
    business_config: { ...(row.kind === "addition" ? { commercial_addition: row.body.draft as AdditionDraft } : { commercial_request: row.body.request }), preparation: row },
  } as unknown as Proposal;
}
export function readPreparation(proposal?: Proposal | null): PreparationDraft | null {
  const config = proposal?.business_config as unknown as { preparation?: PreparationDraft } | null;
  return config?.preparation || null;
}
