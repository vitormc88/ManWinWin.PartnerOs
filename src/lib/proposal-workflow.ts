/**
 * Proposal workflow (Phase 2): explicit Validate → Sent → Accepted operations.
 * Status changes are performed only by database operations; this module holds
 * the shared labels, option lists and error translation for the UI.
 */

export const DIFFERENCE_CATEGORIES = [
  { value: "price_change", label: "Price change" },
  { value: "plan_change", label: "Plan change" },
  { value: "discount", label: "Discount" },
  { value: "indexation", label: "Indexation" },
  { value: "scope_change", label: "Scope change" },
  { value: "year2_progression", label: "Year 2 price progression already agreed" },
  { value: "promo_end", label: "End of promotional discount" },
  { value: "other", label: "Other (note required)" },
] as const;

export const ACCEPTANCE_EVIDENCE_TYPES = [
  { value: "signed_proposal", label: "Signed proposal" },
  { value: "purchase_order", label: "Purchase order" },
  { value: "acceptance_email", label: "Acceptance email" },
  { value: "internal_note", label: "Internal note (HQ exception)" },
] as const;

export type DifferenceCategory = (typeof DIFFERENCE_CATEGORIES)[number]["value"];
export type AcceptanceEvidenceType = (typeof ACCEPTANCE_EVIDENCE_TYPES)[number]["value"];

export function isRenewalProposal(p: { renewal_id?: string | null; source_type?: string | null } | null | undefined): boolean {
  return !!p && (!!p.renewal_id || p.source_type === "renewal");
}

/** Renewal proposals show the stored `Ready` as "Validated"; opportunities keep "Ready". */
export function proposalStatusLabel(status: string | null | undefined, renewal: boolean): string {
  const s = status || "Draft";
  if (renewal && s === "Ready") return "Validated";
  return s;
}

export type ProposalAction = "validate" | "mark_sent" | "record_acceptance";

/** Which explicit workflow actions are available for a proposal right now. */
export function availableProposalActions(p: { status?: string | null; renewal_id?: string | null; source_type?: string | null }): ProposalAction[] {
  const s = p.status || "Draft";
  const renewal = isRenewalProposal(p);
  if (s === "Draft") return ["validate"];
  if (s === "Ready") return renewal ? ["mark_sent", "record_acceptance"] : ["mark_sent"];
  if (s === "Sent") return renewal ? ["record_acceptance"] : [];
  return [];
}

/** Whether a document download may change status. Never — Phase 2 rule. */
export function downloadChangesStatus(): false {
  return false;
}

/** Splits a database workflow error into user-facing messages. */
export function workflowErrorMessages(error: unknown): string[] {
  const raw = String((error as any)?.message || error || "").trim();
  const m = raw.match(/^([A-Z_]+):\s*(.*)$/s);
  if (!m) return [raw || "The operation failed."];
  const [, code, rest] = m;
  if (code === "VALIDATION_FAILED") return rest.split(" | ").map((s) => s.trim()).filter(Boolean);
  if (code === "NOT_AUTHORIZED") return ["You don't have permission to change this proposal."];
  return [rest || code];
}

export interface CloseReadinessIssue {
  code: string;
  message: string;
  components?: Array<{ id: string; renewal_type: string; renewal_date: string; contract_id: string | null }>;
}

export interface CloseReadiness {
  renewal_id: string;
  closed: boolean;
  can_close: boolean;
  issues: CloseReadinessIssue[];
  enforced: boolean;
  proposal_id: string | null;
  proposal_status: string | null;
}

/** Issues that block closing as the given outcome when enforcement is on. */
export function blockingIssues(r: CloseReadiness | null | undefined): CloseReadinessIssue[] {
  if (!r) return [];
  return r.enforced ? r.issues : [];
}
