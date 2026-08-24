/**
 * AGREED NEXT STEP — a real, recorded commitment.
 *
 * This is deliberately distinct from Timing (timing_status describes when the
 * customer might buy). A next step only exists when it is written down here.
 */

export const NEXT_STEP_TYPES = [
  { key: "call", label: "Call" },
  { key: "discovery_meeting", label: "Discovery meeting" },
  { key: "demo", label: "Demo" },
  { key: "workshop", label: "Workshop / deep dive" },
  { key: "proposal_review", label: "Proposal review" },
  { key: "customer_action", label: "Customer action" },
  { key: "internal_action", label: "Internal action" },
  { key: "decision_meeting", label: "Decision meeting" },
  { key: "other", label: "Other" },
];

export const NEXT_STEP_STATUSES = [
  { key: "open", label: "Open" },
  { key: "done", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export function nextStepTypeLabel(key: string | null | undefined): string {
  return NEXT_STEP_TYPES.find((t) => t.key === key)?.label ?? (key || "—");
}

export interface NextStepLike {
  id?: string;
  title: string;
  step_type?: string | null;
  due_at?: string | null;
  agreed_with_customer?: boolean | null;
  agreed_at?: string | null;
  status?: string | null;
  completed_at?: string | null;
  internal_owner_user_id?: string | null;
  customer_contact_name?: string | null;
}

export function isOpenNextStep(s: NextStepLike): boolean {
  return (s.status ?? "open") === "open";
}

/** The single next step to surface: the soonest open one. */
export function currentNextStep(steps: NextStepLike[]): NextStepLike | null {
  const open = steps.filter(isOpenNextStep);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const ta = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  })[0];
}

export function isOverdue(s: NextStepLike, now: number = Date.now()): boolean {
  return isOpenNextStep(s) && !!s.due_at && new Date(s.due_at).getTime() < now;
}

/**
 * Readiness signal used by qualification and the stage gates: an open step,
 * agreed with the customer, dated in the future.
 */
export function hasAgreedFutureNextStep(steps: NextStepLike[], now: number = Date.now()): boolean {
  return steps.some(
    (s) =>
      isOpenNextStep(s) &&
      !!s.agreed_with_customer &&
      !!s.due_at &&
      new Date(s.due_at).getTime() >= now
  );
}

/** Any open step agreed with the customer, regardless of date. */
export function hasCustomerNextStep(steps: NextStepLike[]): boolean {
  return steps.some((s) => isOpenNextStep(s) && !!s.agreed_with_customer);
}

export function nextStepSummary(steps: NextStepLike[], now: number = Date.now()): string {
  const s = currentNextStep(steps);
  if (!s) return "No next step recorded";
  const when = s.due_at ? new Date(s.due_at).toLocaleDateString() : "no date";
  const agreed = s.agreed_with_customer ? "agreed with customer" : "not agreed with customer";
  const late = isOverdue(s, now) ? " · overdue" : "";
  return `${s.title} — ${when} · ${agreed}${late}`;
}
