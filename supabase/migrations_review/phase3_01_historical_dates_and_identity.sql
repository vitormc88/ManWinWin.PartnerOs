-- =========================================================================
-- PHASE 3 — REVIEW ONLY. DO NOT APPLY FROM THIS DIRECTORY.
-- Additive, nullable columns for historical business dates and provenance.
--
-- Scope:
--   clients.customer_since              date        (explicit business date)
--   clients.customer_since_source       text        (provenance label)
--   clients.imported_at                 timestamptz (import/sync technical date)
--   lifecycle_events.effective_date     date        (real business date)
--   lifecycle_events.imported_at        timestamptz (import/sync technical date)
--   lifecycle_events.occurred_at_known  boolean     (nullable tri-state)
--
-- Rollback: DROP COLUMN for exactly the six columns above. No legacy column is
-- renamed, removed, or rewritten. No backfill is performed here.
--
-- Deliberately NOT included:
--   * NOT NULL / CHECK constraints that would reject historical rows
--   * any UPDATE derived from created_at / updated_at / import timestamps
--   * any new table, function, trigger, policy or grant
-- RLS/grants: both tables already have RLS enabled and grants in place; new
-- columns inherit them. Data API exposure reviewed: non-sensitive.
-- =========================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS customer_since        date,
  ADD COLUMN IF NOT EXISTS customer_since_source text,
  ADD COLUMN IF NOT EXISTS imported_at           timestamptz;

COMMENT ON COLUMN public.clients.customer_since IS
  'First real known date of the commercial relationship. Never derived from created_at/updated_at/import timestamps.';
COMMENT ON COLUMN public.clients.customer_since_source IS
  'Provenance of customer_since, e.g. legacy_system, contract_document, confirmed_by_partner.';
COMMENT ON COLUMN public.clients.imported_at IS
  'Technical timestamp of import/sync into PartnerOS. Not a business date.';
COMMENT ON COLUMN public.clients.partner_id IS
  'LEGACY text partner reference (no FK). Canonical relation is clients.partner_uuid -> partners.id.';

ALTER TABLE public.lifecycle_events
  ADD COLUMN IF NOT EXISTS effective_date    date,
  ADD COLUMN IF NOT EXISTS imported_at       timestamptz,
  ADD COLUMN IF NOT EXISTS occurred_at_known boolean;

COMMENT ON COLUMN public.lifecycle_events.effective_date IS
  'Real business date of the event when known. Takes precedence over occurred_at for display and ordering.';
COMMENT ON COLUMN public.lifecycle_events.imported_at IS
  'Technical timestamp of import/sync. Shown only as secondary metadata.';
COMMENT ON COLUMN public.lifecycle_events.occurred_at_known IS
  'NULL = unassessed, false = occurred_at holds a technical timestamp, true = occurred_at is a real business date.';

-- Optional read-only helper index for later timeline ordering (safe, additive):
-- CREATE INDEX IF NOT EXISTS lifecycle_events_client_effective_idx
--   ON public.lifecycle_events (client_id, effective_date DESC NULLS LAST, occurred_at DESC);
