import type { Proposal } from "@/types/proposal";
import { ADDITION_PRODUCTS, readAdditionDraft, type AdditionDraft } from "./commercial-additions";

export interface PreparationDraft {
  id: string; client_id: string; license_id: string; contract_id: string; partner_uuid: string | null;
  proposal_id: string | null; proposal_updated_at: string | null;
  kind: "addition" | "request"; body: Record<string, unknown>; updated_at: string;
}
/** List rows deliberately exclude potentially large document bodies. */
export type PreparationListRow = Omit<PreparationDraft, "body"> & { scope?: unknown; services?: import("./commercial-proposal-journey").ServiceReview };
export const PREPARATION_LIST_COLUMNS = "id,client_id,license_id,contract_id,partner_uuid,proposal_id,proposal_updated_at,kind,updated_at,scope:body->draft->selection,services:body->services";
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
export function preparationScope(row: { kind: string; scope?: unknown; services?: import("./commercial-proposal-journey").ServiceReview; body?: Record<string, unknown> }): string {
  if (row.kind !== "addition") return row.services ? `Services budget · ${row.services.modality} · ${row.services.status} · ${row.services.owner} · ${row.services.scope}` : "Commercial review";
  const draft = row.body ? readAdditionDraft({ business_config: { commercial_addition: row.body.draft } }) : null;
  const value = row.scope ?? draft?.selection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Continue to review the selected items";
  const s = value as Record<string, unknown>;
  const count = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  return [count(s.backoffice) ? `+${s.backoffice} BackOffice` : "", count(s.web) ? `+${s.web} WEB` : "",
    ...(Array.isArray(s.products) ? s.products.flatMap(id => { const product = ADDITION_PRODUCTS.find(p => p.id === id); return product ? [product.label] : []; }) : [])].filter(Boolean).join(" · ") || "Items not yet selected";
}
