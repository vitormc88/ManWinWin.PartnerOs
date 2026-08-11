/**
 * Canonical renewal milestone rule (mirror of `public.renewal_automation_run`).
 *
 * The approved operational calendar is fixed and is NEVER re-derived from the
 * contract length: 120 / 90 / 60 / 30 days before the renewal date, plus an
 * overdue escalation after it.
 *
 * When a contract is first tracked already inside the 120-day window we only
 * create the next actionable milestone and the ones still in the future —
 * never back-dated history, and never an invented calendar for short periods.
 */

export type RenewalMilestoneKind = "m120" | "m90" | "m60" | "m30" | "action_required" | "overdue";

export interface RenewalMilestone {
  key: RenewalMilestoneKind;
  /** Days before the renewal date (0 for the immediate/overdue entries). */
  offsetDays: number;
  label: string;
  /** ISO date (YYYY-MM-DD) the task is due. */
  dueDate: string;
  priority: "Medium" | "High" | "Critical";
}

export const CANONICAL_MILESTONES: { key: RenewalMilestoneKind; offsetDays: number; label: string }[] = [
  { key: "m120", offsetDays: 120, label: "Start renewal preparation" },
  { key: "m90", offsetDays: 90, label: "Review contract and prepare renewal proposal" },
  { key: "m60", offsetDays: 60, label: "Renewal proposal / follow-up checkpoint" },
  { key: "m30", offsetDays: 30, label: "Renewal decision and escalation checkpoint" },
];

const DAY = 86400000;

function toUTC(d: string): number {
  return new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getTime();
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY);
}

export interface MilestonePlanInput {
  renewalDate: string;
  /** "today" for the automation run. */
  today: string;
  /** Contract start date — milestones before it are not created. */
  contractStartDate?: string | null;
  /** Date the cycle started being tracked (defaults to `today`). */
  trackedSince?: string | null;
}

/**
 * Deterministic list of milestone tasks the automation must create.
 * Already-obsolete milestones are dropped, the contract period is never altered.
 */
export function planRenewalMilestones(input: MilestonePlanInput): RenewalMilestone[] {
  const { renewalDate, today } = input;
  if (!renewalDate || !today) return [];
  const renewalMs = toUTC(renewalDate);
  const todayMs = toUTC(today);
  const startMs = input.contractStartDate ? toUTC(input.contractStartDate) : null;
  const trackedMs = input.trackedSince ? toUTC(input.trackedSince) : todayMs;

  const out: RenewalMilestone[] = [];

  for (const m of CANONICAL_MILESTONES) {
    const dueMs = renewalMs - m.offsetDays * DAY;
    if (dueMs < todayMs) continue; // obsolete → never back-dated
    if (startMs !== null && dueMs < startMs) continue; // before the contract exists
    out.push({
      key: m.key,
      offsetDays: m.offsetDays,
      label: m.label,
      dueDate: iso(dueMs),
      priority: m.offsetDays <= 30 ? "High" : "Medium",
    });
  }

  if (renewalMs >= todayMs && out.length === 0) {
    // First tracked inside the last 30 days: one immediate action, no fake history.
    out.push({
      key: "action_required",
      offsetDays: 0,
      label: "Action required — renewal decision",
      dueDate: iso(todayMs),
      priority: "High",
    });
  }

  const overdueSeeded = renewalMs >= todayMs && out.some((m) => m.key === "action_required");
  const alreadyOverdue = renewalMs < todayMs && trackedMs <= renewalMs;
  if (overdueSeeded || alreadyOverdue) {
    out.push({
      key: "overdue",
      offsetDays: 0,
      label: "Overdue renewal escalation",
      dueDate: iso(renewalMs),
      priority: "Critical",
    });
  }

  return out;
}
