/**
 * Renewals Hardening — Prompt 1B.
 *
 * Pure helpers describing how a renewal-sourced proposal is linked to its
 * renewal and which cached queries must be refreshed afterwards, so the
 * behaviour is testable without rendering the Proposal Builder.
 */

export type RenewalProposalAction = "proposal_created" | "proposal_updated";

export interface RenewalLinkArgs {
  _renewal_id: string;
  _proposal_id: string;
  _action: RenewalProposalAction;
  _performed_by: string | null;
  _notes: string | null;
}

export function buildRenewalLinkArgs(input: {
  renewalId: string;
  proposalId: string;
  isUpdate: boolean;
  performedBy?: string | null;
  version: number;
  clientName: string;
}): RenewalLinkArgs {
  const verb = input.isUpdate ? "updated" : "created";
  return {
    _renewal_id: input.renewalId,
    _proposal_id: input.proposalId,
    _action: input.isUpdate ? "proposal_updated" : "proposal_created",
    _performed_by: input.performedBy || null,
    _notes: `Renewal proposal v${input.version} ${verb} for ${input.clientName}.`,
  };
}

/** Exact query keys the UI reads — all must be invalidated after a save. */
export function renewalProposalRefreshKeys(
  renewalId: string,
  clientId?: string | null
): unknown[][] {
  const keys: unknown[][] = [
    ["proposal", "renewal", renewalId],
    ["proposals"],
    ["renewals"],
    ["renewal_activities", renewalId],
  ];
  if (clientId) keys.push(["client_commercial_intelligence", clientId]);
  return keys;
}
