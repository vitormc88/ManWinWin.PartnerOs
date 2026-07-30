/**
 * Renewal workflow identity & duplicate detection (Phase 2C).
 *
 * One single pure source of truth for "are these two renewal rows the same
 * commercial renewal?". Used both to decide whether a new workflow row may be
 * created AND to locate the row to reuse — so the two can never disagree.
 *
 * Identity = client_id + renewal date + logical target.
 * A date match alone is NEVER enough.
 */

import { isOpenRenewal, isValidDateString, type RenewalRecordLike } from "./renewal-resolution";

export type RenewalTargetKind = "contract" | "license" | "none" | string;

export interface RenewalIdentityInput extends RenewalRecordLike {
  /** Real schema columns on `renewals`. */
  contract_id?: string | null;
  license_id?: string | null;
}

export interface RenewalTargetIdentity {
  kind: RenewalTargetKind;
  id: string | null;
}

const norm = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : null;
};

/**
 * Normalizes the several ways a renewal can point at its subject
 * (`contract_id`, `license_id`, or the generic `target_type` / `target_id`)
 * into one logical identity.
 */
export function renewalTargetIdentity(row: RenewalIdentityInput | null | undefined): RenewalTargetIdentity {
  if (!row) return { kind: "none", id: null };

  const targetType = norm(row.target_type)?.toLowerCase() ?? null;
  const targetId = norm(row.target_id);

  const contractId = norm(row.contract_id) ?? (targetType === "contract" ? targetId : null);
  if (contractId) return { kind: "contract", id: contractId };

  const licenseId = norm(row.license_id) ?? (targetType === "license" ? targetId : null);
  if (licenseId) return { kind: "license", id: licenseId };

  // Any other explicit target type (e.g. "sat") keeps its own identity.
  if (targetType && targetId) return { kind: targetType, id: targetId };

  // No usable target identity: a target-less renewal.
  return { kind: "none", id: null };
}

export function sameRenewalTarget(a: RenewalIdentityInput, b: RenewalIdentityInput): boolean {
  const ia = renewalTargetIdentity(a);
  const ib = renewalTargetIdentity(b);
  // A target-less renewal is only ever equivalent to another target-less one.
  if (ia.kind === "none" || ib.kind === "none") return ia.kind === "none" && ib.kind === "none";
  return ia.kind === ib.kind && ia.id === ib.id;
}

const dateKey = (v: string | null | undefined) => (isValidDateString(v) ? String(v).slice(0, 10) : null);

/** Same client + same date + same logical target. */
export function isEquivalentRenewal(a: RenewalIdentityInput, b: RenewalIdentityInput): boolean {
  const da = dateKey(a.renewal_date);
  const db = dateKey(b.renewal_date);
  if (!da || !db || da !== db) return false;

  const ca = norm(a.client_id);
  const cb = norm(b.client_id);
  if (!ca || !cb || ca !== cb) return false;

  return sameRenewalTarget(a, b);
}

/**
 * The open renewal row that represents the same commercial renewal, or null.
 * Closed/cancelled rows never match — they must not block a new renewal.
 */
export function findEquivalentOpenRenewal<T extends RenewalIdentityInput>(
  existing: T[] | null | undefined,
  target: RenewalIdentityInput
): T | null {
  const rows = (existing || []).filter(isOpenRenewal);
  return rows.find((r) => isEquivalentRenewal(r, target)) ?? null;
}

/** True only when no equivalent OPEN workflow row already exists. */
export function shouldCreateRenewalWorkflowRow(
  existing: RenewalIdentityInput[] | null | undefined,
  target: RenewalIdentityInput
): boolean {
  return findEquivalentOpenRenewal(existing, target) === null;
}

/** Columns needed to evaluate identity — keep the real queries in sync with this. */
export const RENEWAL_IDENTITY_SELECT =
  "id, client_id, renewal_date, status, target_type, target_id, contract_id, license_id";
