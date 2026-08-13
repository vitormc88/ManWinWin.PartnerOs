/**
 * Typed proposal source identity (Renewals Hardening — Prompt 1).
 *
 * A proposal is either:
 *  - `deal`     → born in the Pipeline, anchored on a REAL `deals.id`;
 *  - `renewal`  → born on an operational renewal, anchored on a REAL
 *                 `renewals.id` + the client it belongs to;
 *  - `client`   → born on an EXISTING customer outside a renewal cycle
 *                 (mid-cycle upgrade, extra users, extra modules, services),
 *                 anchored on a REAL `clients.id`.
 *
 * A client UUID must NEVER be written into `proposals.lead_id`: that column is
 * a deal reference and is what the deal-scoped RLS policy authorizes against.
 * Client-sourced proposals are authorized against `clients.id` instead.
 */

import { isUuid } from "./partner-identity";

export type ProposalSourceType = "deal" | "renewal" | "client";

export interface ProposalSource {
  source_type: ProposalSourceType;
  /** Real `deals.id` — only for deal-sourced proposals. */
  deal_id: string | null;
  /** Real `renewals.id` — only for renewal-sourced proposals. */
  renewal_id: string | null;
  /** Canonical `clients.id`. */
  client_id: string | null;
  /** Canonical `partners.id` (never the legacy text reference). */
  partner_uuid: string | null;
  contract_id?: string | null;
  license_id?: string | null;
}

const clean = (v: unknown): string | null => (isUuid(v) ? String(v).trim() : null);

export function dealProposalSource(dealId: string | null | undefined): ProposalSource {
  return {
    source_type: "deal",
    deal_id: clean(dealId),
    renewal_id: null,
    client_id: null,
    partner_uuid: null,
    contract_id: null,
    license_id: null,
  };
}

export function renewalProposalSource(input: {
  renewalId: string | null | undefined;
  clientId: string | null | undefined;
  partnerUuid?: string | null;
  contractId?: string | null;
  licenseId?: string | null;
}): ProposalSource {
  return {
    source_type: "renewal",
    deal_id: null,
    renewal_id: clean(input.renewalId),
    client_id: clean(input.clientId),
    partner_uuid: clean(input.partnerUuid),
    contract_id: clean(input.contractId),
    license_id: clean(input.licenseId),
  };
}

/**
 * Existing-customer commercial action that is NOT a renewal cycle:
 * upgrade, extra users, extra modules, extra services. It is anchored on the
 * client (and optionally the contract/license it evolves).
 */
export function clientProposalSource(input: {
  clientId: string | null | undefined;
  partnerUuid?: string | null;
  contractId?: string | null;
  licenseId?: string | null;
}): ProposalSource {
  return {
    source_type: "client",
    deal_id: null,
    renewal_id: null,
    client_id: clean(input.clientId),
    partner_uuid: clean(input.partnerUuid),
    contract_id: clean(input.contractId),
    license_id: clean(input.licenseId),
  };
}

export function isRenewalSource(source: ProposalSource | null | undefined): boolean {
  return source?.source_type === "renewal";
}

export function isClientSource(source: ProposalSource | null | undefined): boolean {
  return source?.source_type === "client";
}

/** True when the proposal belongs to an existing customer (renewal or client). */
export function isExistingCustomerSource(source: ProposalSource | null | undefined): boolean {
  return isRenewalSource(source) || isClientSource(source);
}

/** A source is only usable when its own anchor is a real uuid. */
export function isValidProposalSource(source: ProposalSource | null | undefined): boolean {
  if (!source) return false;
  if (source.source_type === "deal") return isUuid(source.deal_id);
  if (source.source_type === "client") return isUuid(source.client_id);
  return isUuid(source.renewal_id) && isUuid(source.client_id);
}

/** Columns written on every proposal INSERT/UPDATE for source identity. */
export function buildProposalSourcePayload(source: ProposalSource): {
  source_type: ProposalSourceType;
  lead_id: string | null;
  deal_id: string | null;
  renewal_id: string | null;
  client_id: string | null;
  partner_uuid: string | null;
  contract_id: string | null;
  license_id: string | null;
} {
  const isDeal = source.source_type === "deal";
  return {
    source_type: source.source_type,
    // Legacy/deal-scoped column: only ever a real deal id.
    lead_id: isDeal ? clean(source.deal_id) : null,
    deal_id: isDeal ? clean(source.deal_id) : null,
    renewal_id: source.source_type === "renewal" ? clean(source.renewal_id) : null,
    client_id: isDeal ? clean(source.client_id) : clean(source.client_id),
    partner_uuid: clean(source.partner_uuid),
    contract_id: clean(source.contract_id),
    license_id: clean(source.license_id),
  };
}

/** Storage folder for generated documents — never a fabricated deal id. */
export function proposalStoragePrefix(source: ProposalSource): string {
  if (source.source_type === "renewal") return source.renewal_id || "unassigned";
  if (source.source_type === "client") return source.client_id || "unassigned";
  return source.deal_id || "unassigned";
}

/** Read back the source of a persisted proposal row. */
export function readProposalSource(row: Record<string, any> | null | undefined): ProposalSource | null {
  if (!row) return null;
  if (row.source_type === "renewal") {
    return renewalProposalSource({
      renewalId: row.renewal_id,
      clientId: row.client_id,
      partnerUuid: row.partner_uuid,
      contractId: row.contract_id,
      licenseId: row.license_id,
    });
  }
  if (row.source_type === "client") {
    return clientProposalSource({
      clientId: row.client_id,
      partnerUuid: row.partner_uuid,
      contractId: row.contract_id,
      licenseId: row.license_id,
    });
  }
  return dealProposalSource(row.deal_id ?? row.lead_id);
}
