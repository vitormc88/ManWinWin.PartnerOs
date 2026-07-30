/**
 * PHASE 3 — Canonical partner identity layer.
 *
 * Production reality (see PHASE3_RELATIONSHIPS_AND_DATES_AUDIT.md):
 *  - `partners.id` is `uuid` and is the ONLY canonical relational identity.
 *  - `clients.partner_uuid` / `renewals.partner_uuid` are real FKs to `partners.id`.
 *  - `clients.partner_id` / `renewals.partner_id` are LEGACY TEXT references.
 *    They may hold a UUID string, an old external key, a partner code or free text.
 *
 * Rules enforced here:
 *  - Reads resolve through the canonical uuid column only.
 *  - A legacy-only reference is never silently joined; it surfaces as
 *    `legacy_unresolved` so the record stays visible without a wrong join.
 *  - A canonical uuid that disagrees with the legacy text is reported as
 *    `conflict` — never merged with `||` truthiness.
 *  - Writes only ever set the canonical column; the legacy value is preserved
 *    untouched unless the user explicitly changes the partner.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type PartnerLinkState =
  | "resolved"
  | "legacy_unresolved"
  | "conflict"
  | "unlinked";

export interface PartnerRefRecord {
  /** Canonical FK column (uuid) — `clients.partner_uuid`, `renewals.partner_uuid`. */
  partner_uuid?: string | null;
  /** Legacy text column, semantics unknown per row. */
  partner_id?: string | null;
}

export interface PartnerIdentity {
  state: PartnerLinkState;
  /** Canonical partner uuid, only when it is a real uuid. */
  partnerId: string | null;
  /** Display name when the canonical uuid resolves against the partners table. */
  partnerName: string | null;
  /** Raw legacy value, always preserved for display/debug. */
  legacyRef: string | null;
  /** Human label safe to render directly. */
  label: string;
  /** True when the UI must show a warning/qualifier chip. */
  needsAttention: boolean;
}

export type PartnerNameLookup =
  | Record<string, string | undefined>
  | Map<string, string>
  | ((id: string) => string | undefined);

function lookupName(lookup: PartnerNameLookup | undefined, id: string): string | undefined {
  if (!lookup) return undefined;
  if (typeof lookup === "function") return lookup(id);
  if (lookup instanceof Map) return lookup.get(id);
  return lookup[id];
}

export const HQ_DIRECT_LABEL = "HQ Direct";
export const LEGACY_UNRESOLVED_LABEL = "Legacy / Unresolved";

/**
 * Resolve the partner identity of a record. Never falls back from the canonical
 * uuid to the legacy text reference.
 */
export function resolvePartnerIdentity(
  record: PartnerRefRecord | null | undefined,
  partners?: PartnerNameLookup,
): PartnerIdentity {
  const rawLegacy = typeof record?.partner_id === "string" ? record.partner_id.trim() : null;
  const legacyRef = rawLegacy && rawLegacy.length > 0 ? rawLegacy : null;
  const canonical = isUuid(record?.partner_uuid) ? String(record!.partner_uuid).trim() : null;

  if (canonical) {
    const name = lookupName(partners, canonical) ?? null;
    // Legacy text that is itself a uuid but points elsewhere is a real conflict.
    const conflicting = !!legacyRef && isUuid(legacyRef) && legacyRef.toLowerCase() !== canonical.toLowerCase();
    if (conflicting) {
      return {
        state: "conflict",
        partnerId: canonical,
        partnerName: name,
        legacyRef,
        label: name ?? canonical,
        needsAttention: true,
      };
    }
    return {
      state: "resolved",
      partnerId: canonical,
      partnerName: name,
      legacyRef,
      label: name ?? LEGACY_UNRESOLVED_LABEL,
      needsAttention: !name,
    };
  }

  if (legacyRef) {
    return {
      state: "legacy_unresolved",
      partnerId: null,
      partnerName: null,
      legacyRef,
      label: LEGACY_UNRESOLVED_LABEL,
      needsAttention: true,
    };
  }

  return {
    state: "unlinked",
    partnerId: null,
    partnerName: null,
    legacyRef: null,
    label: HQ_DIRECT_LABEL,
    needsAttention: false,
  };
}

/** Predicate for partner-scoped filtering that never guesses on legacy text. */
export function matchesPartnerFilter(
  record: PartnerRefRecord | null | undefined,
  filter: string,
): boolean {
  const identity = resolvePartnerIdentity(record);
  if (filter === "all") return true;
  if (filter === "hq") return identity.state === "unlinked";
  if (filter === "legacy") return identity.state === "legacy_unresolved" || identity.state === "conflict";
  return identity.partnerId?.toLowerCase() === filter.toLowerCase();
}

/**
 * Build the partner portion of an INSERT payload. New writes are canonical-only.
 */
export function buildPartnerCreatePayload(partnerId: string | null | undefined): {
  partner_uuid: string | null;
} {
  return { partner_uuid: isUuid(partnerId) ? String(partnerId).trim() : null };
}

export interface PartnerUpdateInput {
  /** Current stored row (raw values). */
  current: PartnerRefRecord | null | undefined;
  /** Only set when the user explicitly interacted with the partner selector. */
  partnerChanged?: boolean;
  /** New canonical partner uuid (null = explicitly HQ Direct). */
  nextPartnerId?: string | null;
}

/**
 * Build the partner portion of an UPDATE payload.
 *  - Untouched partner → returns `{}`: both the canonical and the legacy raw
 *    values stay exactly as stored.
 *  - Explicit change → writes the canonical column AND clears the legacy text
 *    column, so the row cannot keep an obsolete/conflicting legacy reference.
 *    This clearing is only allowed because it is the direct result of an
 *    explicit partner change made by the user.
 *  - Explicit HQ Direct → both columns are set to null so the record really
 *    resolves as HQ Direct instead of `legacy_unresolved`.
 */
export function buildPartnerUpdatePayload({
  partnerChanged,
  nextPartnerId,
}: PartnerUpdateInput): { partner_uuid?: string | null; partner_id?: string | null } {
  if (!partnerChanged) return {};
  return {
    partner_uuid: isUuid(nextPartnerId) ? String(nextPartnerId).trim() : null,
    partner_id: null,
  };
}

