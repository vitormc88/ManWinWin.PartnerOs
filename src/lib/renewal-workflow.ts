/**
 * Renewal workflow write helpers (Phase 2C).
 *
 * These wrap the *real* create paths used by PartnerDetail / ClientDetail so the
 * duplicate guard cannot be bypassed, and so the behaviour is testable without
 * a database: the caller injects the fetch/insert functions.
 */

import {
  findEquivalentOpenRenewal,
  type RenewalIdentityInput,
} from "./renewal-identity";

export interface RenewalCreateOutcome<T> {
  created: boolean;
  /** Existing equivalent row when reused, or the inserted row. */
  row: T | null;
  id: string | null;
  reason: "created" | "reused_existing";
}

/**
 * Creates a renewal workflow row only when no equivalent OPEN row exists.
 * When an equivalent exists, returns exactly that row (never "some row with
 * the same date").
 */
export async function createRenewalWorkflowRow<T extends RenewalIdentityInput & { id?: string | null }>(deps: {
  /** Existing renewal rows for the client (must include identity columns). */
  fetchExisting: () => Promise<T[]>;
  /** Logical identity of the renewal we want to create. */
  target: RenewalIdentityInput;
  /** Performs the actual insert; only called when no equivalent exists. */
  insert: () => Promise<T | null>;
}): Promise<RenewalCreateOutcome<T>> {
  const existing = await deps.fetchExisting();
  const match = findEquivalentOpenRenewal(existing, deps.target);
  if (match) {
    return { created: false, row: match, id: match.id ?? null, reason: "reused_existing" };
  }
  const row = await deps.insert();
  return { created: true, row, id: row?.id ?? null, reason: "created" };
}
