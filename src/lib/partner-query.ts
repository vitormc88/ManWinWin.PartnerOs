/**
 * PHASE 3D — Canonical partner READ layer for `clients` and `renewals`.
 *
 * Writes were made canonical in Phase 3C (`partner_uuid` only). This module
 * closes the remaining asymmetry: every relational read/filter/match against
 * `partners.id` must also go through `partner_uuid`.
 *
 * Rules:
 *  - Only `partner_uuid` is ever used as a relational key.
 *  - A non-uuid / legacy-only reference is NEVER promoted or guessed into a
 *    join: the scope resolves to `unresolved` and the caller must degrade
 *    safely (no partner-scoped query, no automatic association).
 *  - `null` partner means an explicit HQ Direct scope (`partner_uuid is null`).
 */

import { isUuid, resolvePartnerIdentity, type PartnerRefRecord } from "./partner-identity";

/** The only relational partner column for `clients` / `renewals`. */
export const CANONICAL_PARTNER_COLUMN = "partner_uuid" as const;

export type PartnerScope =
  | { kind: "partner"; column: typeof CANONICAL_PARTNER_COLUMN; value: string }
  | { kind: "hq"; column: typeof CANONICAL_PARTNER_COLUMN }
  | { kind: "unresolved"; ref: string };

/**
 * Resolve a partner reference into a safe query scope.
 * `undefined` is not a scope — callers should skip partner filtering entirely.
 */
export function canonicalPartnerScope(ref: string | null | undefined): PartnerScope {
  if (ref === null) return { kind: "hq", column: CANONICAL_PARTNER_COLUMN };
  const trimmed = typeof ref === "string" ? ref.trim() : "";
  if (isUuid(trimmed)) return { kind: "partner", column: CANONICAL_PARTNER_COLUMN, value: trimmed };
  return { kind: "unresolved", ref: trimmed };
}

/** Minimal structural type of the PostgREST filter builder we rely on. */
export interface PartnerFilterableQuery<Q> {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
}

/**
 * Apply a canonical partner scope to a query builder.
 * Returns `null` when the reference is legacy/unresolved — the caller must NOT
 * run a partner-scoped query in that case (no guessed join).
 */
export function applyPartnerScope<Q extends PartnerFilterableQuery<Q>>(
  query: Q,
  scope: PartnerScope,
): Q | null {
  if (scope.kind === "partner") return query.eq(scope.column, scope.value);
  if (scope.kind === "hq") return query.is(scope.column, null);
  return null;
}

/**
 * In-memory equivalent for already-fetched `clients` / `renewals` rows.
 * Legacy-only rows never match a partner — they stay Legacy / Unresolved.
 */
export function belongsToPartner(
  record: PartnerRefRecord | null | undefined,
  partnerId: string | null | undefined,
): boolean {
  const identity = resolvePartnerIdentity(record);
  if (!isUuid(partnerId)) return false;
  return identity.partnerId?.toLowerCase() === String(partnerId).trim().toLowerCase();
}
