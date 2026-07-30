-- =========================================================================
-- PHASE 3 — REVIEW ONLY BACKFILL TEMPLATE. NOT EXECUTABLE AS-IS.
-- No name-matching SQL. Every write requires an explicit, reviewed ID list.
-- Requires phase3_01_historical_dates_and_identity.sql to be applied first.
-- =========================================================================

-- ---------- STEP 1: PREVIEW ONLY — partner identity states ---------------
-- SELECT
--   count(*) FILTER (WHERE partner_uuid IS NOT NULL)                                   AS resolved,
--   count(*) FILTER (WHERE partner_uuid IS NULL AND nullif(btrim(partner_id),'') IS NOT NULL) AS legacy_only,
--   count(*) FILTER (WHERE partner_uuid IS NULL AND nullif(btrim(partner_id),'') IS NULL)     AS hq_direct
-- FROM public.clients;

-- Rows where the legacy text is a uuid that disagrees with the canonical FK:
-- SELECT id, commercial_name, partner_uuid, partner_id
-- FROM public.clients
-- WHERE partner_uuid IS NOT NULL
--   AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   AND lower(partner_id) <> lower(partner_uuid::text);

-- Legacy-only rows that WOULD resolve, for manual confidence review:
-- SELECT c.id, c.commercial_name, c.partner_id, p.id AS candidate_partner, p.company_name
-- FROM public.clients c
-- LEFT JOIN public.partners p
--   ON c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--  AND p.id = c.partner_id::uuid
-- WHERE c.partner_uuid IS NULL AND nullif(btrim(c.partner_id),'') IS NOT NULL;

-- Confidence criteria for including a client id in STEP 2:
--   HIGH   — legacy text is a valid uuid AND matches exactly one existing partner.
--   MEDIUM — partner confirmed by a human from a contract/invoice document.
--   LOW    — anything inferred from names, codes or free text  → EXCLUDE.
-- Only HIGH and MEDIUM ids may be listed below, one reviewed id at a time.

-- ---------- STEP 2: TEMPLATE — canonical partner assignment --------------
-- BEGIN;
-- CREATE TEMP TABLE phase3_partner_rollback AS
--   SELECT id, partner_uuid FROM public.clients WHERE id IN (
--     -- '00000000-0000-0000-0000-000000000000'::uuid  -- reviewed id
--   );
-- UPDATE public.clients c
--    SET partner_uuid = v.partner_uuid
--   FROM (VALUES
--     -- ('<client_id>'::uuid, '<partner_id>'::uuid)
--   ) AS v(id, partner_uuid)
--  WHERE c.id = v.id AND c.partner_uuid IS DISTINCT FROM v.partner_uuid;
-- -- verify, then COMMIT; or ROLLBACK;
-- ROLLBACK;
-- Rollback after commit:
--   UPDATE public.clients c SET partner_uuid = r.partner_uuid
--     FROM phase3_partner_rollback r WHERE c.id = r.id;

-- ---------- STEP 3: PREVIEW ONLY — Customer Since ------------------------
-- SELECT
--   count(*) FILTER (WHERE first_installation_date IS NOT NULL) AS factual,
--   count(*) FILTER (WHERE first_installation_date IS NULL)     AS unknown
-- FROM public.clients;
--
-- FORBIDDEN: any UPDATE setting customer_since from created_at, updated_at,
-- imported_at, or a sync timestamp. Only explicit reviewed (id, date, source)
-- tuples are allowed, using the same VALUES + rollback-table pattern as STEP 2.

-- ---------- STEP 4: PREVIEW ONLY — lifecycle event provenance ------------
-- SELECT count(*) AS events_sharing_occurred_and_created
-- FROM public.lifecycle_events
-- WHERE date_trunc('second', occurred_at) = date_trunc('second', created_at);
--
-- These are candidates for occurred_at_known = false, but only after the
-- import batch that produced them has been positively identified in production.
