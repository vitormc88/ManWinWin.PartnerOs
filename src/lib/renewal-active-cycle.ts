/**
 * Active renewal cycle selection (client-side mirror of the closing lifecycle).
 *
 * A client can carry, at the same time:
 *  - closed cycles (Won / Lost / Completed) that belong to history only;
 *  - the open operational cycle created by the closure;
 *  - derived rows produced from contract/license dates, which may still point at
 *    the *previous* period until every underlying record is refreshed.
 *
 * The active pipeline must always show the open operational cycle — never the
 * closed one, and never a stale derived row that shadows it.
 */

export const CLOSED_RENEWAL_STATUSES = new Set(["Won", "Lost", "Completed"]);

export interface RenewalComponentLike {
  id?: string | null;
  superseded_by_renewal_id?: string | null;
  status?: string | null;
  closed_at?: string | null;
  outcome?: string | null;
  renewal_date?: string | null;
  estimated_value?: number | null;
}

export function isClosedComponent(c: RenewalComponentLike | null | undefined): boolean {
  if (!c) return false;
  if (c.closed_at) return true;
  if ((c.outcome || "").trim()) return true;
  return CLOSED_RENEWAL_STATUSES.has((c.status || "").trim());
}


export function isDerivedComponent(c: RenewalComponentLike | null | undefined): boolean {
  return String(c?.id || "").startsWith("derived-");
}

export interface ActiveCycleSelection<T extends RenewalComponentLike> {
  /** Row that drives date / status / priority in the pipeline. */
  primary: T;
  /** Components the commercial value must be computed from. */
  valueComponents: T[];
  /** True when the selected cycle is a closed (history-only) row. */
  isClosed: boolean;
}

const byDateAsc = (a: RenewalComponentLike, b: RenewalComponentLike) =>
  (a.renewal_date || "").localeCompare(b.renewal_date || "");
const byDateDesc = (a: RenewalComponentLike, b: RenewalComponentLike) =>
  (b.renewal_date || "").localeCompare(a.renewal_date || "");

/**
 * Picks the cycle that represents the client in the active pipeline.
 * Operational (explicit) open cycles always win over derived rows, so a stale
 * license/contract date can never resurrect an already renewed period.
 */
export function selectActiveCycle<T extends RenewalComponentLike>(
  components: T[]
): ActiveCycleSelection<T> | null {
  if (!components.length) return null;

  const open = components.filter((c) => !isClosedComponent(c));
  const explicitOpen = open.filter((c) => !isDerivedComponent(c));

  if (explicitOpen.length) {
    const sorted = [...explicitOpen].sort(byDateAsc);
    return { primary: sorted[0], valueComponents: explicitOpen, isClosed: false };
  }
  if (open.length) {
    const sorted = [...open].sort(byDateAsc);
    return { primary: sorted[0], valueComponents: open, isClosed: false };
  }

  const closed = [...components].sort(byDateDesc);
  return { primary: closed[0], valueComponents: closed, isClosed: true };
}

/**
 * The renewal record a client screen must treat as the NEXT renewal.
 *
 * Returns the explicit open cycle (Upcoming / Due Soon / In Progress / At Risk).
 * Closed cycles are history: they never become the next renewal, even when they
 * carry the most recent date. Returns null when only closed cycles exist, so the
 * caller can fall back to contract / license dates.
 */
export function selectActiveRenewalRecord<T extends RenewalComponentLike>(
  components: T[] | null | undefined
): T | null {
  const selection = selectActiveCycle(components || []);
  if (!selection || selection.isClosed) return null;
  return selection.primary;
}

/**
 * Phase 2f — a closed cycle (Renewed or Lost) owns its period. A derived row
 * (from contract / licence / S&AT dates) whose date falls within this window of
 * a closed cycle's renewal date is the SAME period and must not reappear as
 * pending. A derived date clearly after it is a genuine later period.
 */
export const CLOSED_CYCLE_WINDOW_DAYS = 45;

const dayMs = 86400000;
function toTime(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(String(d).slice(0, 10) + "T00:00:00Z").getTime();
  return isNaN(t) ? null : t;
}

export function isDateCoveredByClosedCycle(
  date: string | null | undefined,
  components: RenewalComponentLike[] | null | undefined,
  windowDays = CLOSED_CYCLE_WINDOW_DAYS
): boolean {
  const t = toTime(date);
  if (t === null) return false;
  return (components || []).some((c) => {
    if (isDerivedComponent(c) || !isClosedComponent(c)) return false;
    const ct = toTime(c.renewal_date);
    // Anything on or before the closed period (plus the window) is that period or older.
    return ct !== null && t <= ct + windowDays * dayMs;
  });
}

/** Drops derived rows that belong to an already-closed cycle's period. */
export function suppressDerivedForClosedCycles<T extends RenewalComponentLike>(components: T[]): T[] {
  return components.filter((c) => !isDerivedComponent(c) || !isDateCoveredByClosedCycle(c.renewal_date, components));
}

/** KeepIT is perpetual: a licence end date alone never creates a renewal obligation. */
export function isPerpetualKeepIt(l: { product?: string | null; edition?: string | null; license_type?: string | null } | null | undefined): boolean {
  if (!l) return false;
  const txt = `${l.product || ""} ${l.edition || ""} ${l.license_type || ""}`.toLowerCase();
  return txt.includes("keepit") && !txt.includes("saas");
}

/** Reconciled duplicate records remain stored for audit, outside commercial counts. */
export function canonicalRenewalComponents<T extends RenewalComponentLike>(rows: T[]): T[] {
  return rows.filter(r => !r.superseded_by_renewal_id);
}
