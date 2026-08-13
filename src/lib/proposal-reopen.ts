/**
 * Reopening a persisted proposal (P0 — existing-customer proposals).
 *
 * A saved proposal is reopened in the canonical Proposal Builder. Its source
 * identity is rebuilt from the persisted row so that a client-anchored
 * proposal never degrades into a deal- or renewal-anchored one.
 */

import {
  clientProposalSource,
  dealProposalSource,
  renewalProposalSource,
  type ProposalSource,
} from "./proposal-source";

export interface PersistedProposalRow {
  id?: string | null;
  source_type?: string | null;
  deal_id?: string | null;
  lead_id?: string | null;
  renewal_id?: string | null;
  client_id?: string | null;
  partner_uuid?: string | null;
  contract_id?: string | null;
  license_id?: string | null;
  status?: string | null;
}

/** Rebuild the typed source identity of a persisted proposal. */
export function proposalSourceFromRecord(row: PersistedProposalRow | null | undefined): ProposalSource | null {
  if (!row) return null;
  const type = (row.source_type || "").trim().toLowerCase();

  if (type === "renewal" || (!type && row.renewal_id)) {
    return renewalProposalSource({
      renewalId: row.renewal_id,
      clientId: row.client_id,
      partnerUuid: row.partner_uuid,
      contractId: row.contract_id,
      licenseId: row.license_id,
    });
  }

  if (type === "client" || (!type && row.client_id && !row.deal_id && !row.lead_id)) {
    return clientProposalSource({
      clientId: row.client_id,
      partnerUuid: row.partner_uuid,
      contractId: row.contract_id,
      licenseId: row.license_id,
    });
  }

  return dealProposalSource(row.deal_id || row.lead_id);
}

/** Statuses that close a proposal commercially — reopened as read-only. */
const CLOSED_STATUSES = new Set(["won", "lost", "rejected", "cancelled", "canceled", "expired", "accepted"]);

/**
 * A closed proposal is historical evidence: it opens read-only.
 * Draft / Ready / Sent remain editable subject to module permissions.
 */
export function isProposalReadOnly(status: string | null | undefined, canEdit = true): boolean {
  if (!canEdit) return true;
  return CLOSED_STATUSES.has((status || "").trim().toLowerCase());
}

const ACTION_LABELS: Record<string, string> = {
  none: "Renewal",
  straight: "Renewal",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  add_users: "Additional users",
  add_modules: "Additional modules",
  add_plugins: "Additional plugins",
  change_hosting: "Hosting change",
};

/** Human label for the commercial action behind a proposal. */
export function proposalActionLabel(
  row: { source_type?: string | null; renewal_change_mode?: string | null } | null | undefined,
): string {
  const mode = (row?.renewal_change_mode || "").trim().toLowerCase();
  if (mode && ACTION_LABELS[mode]) return ACTION_LABELS[mode];
  const type = (row?.source_type || "").trim().toLowerCase();
  if (type === "renewal") return "Renewal";
  if (type === "client") return "Commercial action";
  return "New business";
}
