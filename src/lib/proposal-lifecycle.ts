// Proposal lifecycle semantics.
//
// A proposal that exists, is Draft/Ready, or has a generated DOCX is NOT sent.
// "Sent" requires an explicit signal: proposal.status === "Sent" (or a later
// commercial status), a canonical sent timestamp, or a logged `proposal_sent`
// activity. Nothing is inferred from proposal existence, generation or value.

export type ProposalLifecycleState = "none" | "generated" | "sent";

export interface ProposalLike {
  status?: string | null;
  created_at?: string | null;
  generated_at?: string | null;
  sent_at?: string | null;
}

export interface ActivityLike {
  activity_type?: string | null;
  activity_date?: string | null;
  created_at?: string | null;
}

/** Statuses that explicitly mean the proposal reached the customer. */
export const SENT_PROPOSAL_STATUSES = new Set(["sent", "accepted", "won", "rejected", "negotiation"]);

export function isProposalSent(p: ProposalLike | null | undefined): boolean {
  if (!p) return false;
  if (p.sent_at) return true;
  const s = (p.status || "").trim().toLowerCase();
  return SENT_PROPOSAL_STATUSES.has(s);
}

function ts(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return isNaN(t) ? null : t;
}

export interface ProposalLifecycle {
  state: ProposalLifecycleState;
  label: string;
  /** When the latest proposal was created/generated. */
  generatedAt: Date | null;
  /** Only set for an explicit sent signal. */
  sentAt: Date | null;
}

export function resolveProposalLifecycle(
  proposals: ProposalLike[] = [],
  activities: ActivityLike[] = []
): ProposalLifecycle {
  const live = proposals.filter((p) => (p.status || "").toLowerCase() !== "lost");

  let generatedAt: number | null = null;
  for (const p of live) {
    const t = ts(p.generated_at) ?? ts(p.created_at);
    if (t !== null && (generatedAt === null || t > generatedAt)) generatedAt = t;
  }

  let sentAt: number | null = null;
  for (const p of live) {
    if (!isProposalSent(p)) continue;
    const t = ts(p.sent_at) ?? ts(p.generated_at) ?? ts(p.created_at);
    if (t !== null && (sentAt === null || t > sentAt)) sentAt = t;
  }
  for (const a of activities) {
    if ((a.activity_type || "") !== "proposal_sent") continue;
    const t = ts(a.activity_date) ?? ts(a.created_at);
    if (t !== null && (sentAt === null || t > sentAt)) sentAt = t;
  }

  if (sentAt !== null) {
    return {
      state: "sent",
      label: "Proposal sent",
      generatedAt: generatedAt !== null ? new Date(generatedAt) : new Date(sentAt),
      sentAt: new Date(sentAt),
    };
  }
  if (generatedAt !== null) {
    return {
      state: "generated",
      label: "Proposal generated/ready",
      generatedAt: new Date(generatedAt),
      sentAt: null,
    };
  }
  return { state: "none", label: "No proposal yet", generatedAt: null, sentAt: null };
}
