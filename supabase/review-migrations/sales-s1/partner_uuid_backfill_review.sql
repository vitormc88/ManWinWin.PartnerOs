-- REVIEW-ONLY partner_uuid backfill. Not run. Requires explicit approval per target.
-- Step 1 (read-only preview): which legacy partner_id values map unambiguously.
SELECT
  count(*) FILTER (WHERE d.partner_id IS NULL)                                   AS no_partner,
  count(*) FILTER (WHERE d.partner_id ~* '^[0-9a-f-]{36}$' AND p.id IS NOT NULL)  AS resolvable,
  count(*) FILTER (WHERE d.partner_id IS NOT NULL AND p.id IS NULL)              AS unresolved
FROM public.deals d
LEFT JOIN public.partners p
  ON d.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND p.id = d.partner_id::uuid;

-- Step 2 (write, only after approval): exact UUID match to an existing partner.
-- Unresolved rows stay NULL. sales_engine is NOT touched.
-- BEGIN;
-- UPDATE public.deals d SET partner_uuid = p.id
--   FROM public.partners p
--  WHERE d.partner_uuid IS NULL
--    AND d.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--    AND p.id = d.partner_id::uuid;
-- COMMIT;
