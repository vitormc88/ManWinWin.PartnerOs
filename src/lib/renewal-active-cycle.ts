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
