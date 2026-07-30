/**
 * PHASE 3C — Canonical partner payload for `renewals` (and `clients`) writes.
 *
 * `clients.partner_id` / `renewals.partner_id` are LEGACY TEXT columns.
 * The canonical relation is `partner_uuid -> partners.id`.
 *
 * Scope note: `partner_id` is legitimate and canonical in OTHER tables
 * (e.g. `profiles`, `partner_certifications`, `partner_notes`, `deals`).
 * These helpers must only be used for `clients` and `renewals`.
 */

import { buildPartnerCreatePayload } from "./partner-identity";

export interface PartnerSourceRecord {
  /** Canonical uuid relation of the source record (client or partner id). */
  partner_uuid?: string | null;
  /** Legacy text reference — read for display only, never propagated. */
  partner_id?: string | null;
}

/**
 * Partner columns for a NEW renewal row: canonical uuid only.
 * A legacy-only source yields `partner_uuid: null` — the legacy text is never
 * promoted, converted or copied into the new record.
 */
export function buildRenewalPartnerPayload(
  source: PartnerSourceRecord | null | undefined,
): { partner_uuid: string | null } {
  return buildPartnerCreatePayload(source?.partner_uuid ?? null);
}

/**
 * Compose a renewal INSERT payload with canonical partner columns.
 * Any `partner_id` present in `fields` is dropped, so no new renewal row can
 * ever carry a legacy text reference.
 */
export function buildRenewalInsertPayload<T extends Record<string, unknown>>(
  fields: T,
  source: PartnerSourceRecord | null | undefined,
): Omit<T, "partner_id" | "partner_uuid"> & { partner_uuid: string | null } {
  const rest = { ...fields } as Record<string, unknown>;
  delete rest.partner_id;
  delete rest.partner_uuid;
  return { ...rest, ...buildRenewalPartnerPayload(source) } as Omit<T, "partner_id" | "partner_uuid"> & {
    partner_uuid: string | null;
  };
}
