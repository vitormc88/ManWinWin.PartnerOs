-- FIN02 R1 SEC-38. REVIEW-ONLY migration, NOT applied to TEST/PROD.
-- Baseline: read-only TEST public.pg_policies snapshot 2026-10-12.
-- Must fail CLOSED on missing/unexpected policy state. No migration is authorized
-- for PROD; TEST execution requires separate explicit user approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Prevent concurrent policy/trigger DDL between preflight and rollback/patch.
LOCK TABLE public.contracts, public.licenses, public.renewals IN ACCESS EXCLUSIVE MODE;
DO $fin02_preflight$
DECLARE r record; actual text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('contracts','contracts_insert','c89bfbf491687267768132c13e52fa0f'),
    ('contracts','contracts_update','6e549224e84785db593a057794bdeb78'),
    ('licenses','licenses_insert','dcac9db3ec765a7f0619b20e470f846d'),
    ('licenses','licenses_update','dcc929cfdd00e2acf7554d5d94f58bea'),
    ('renewals','renewals_insert','d7a91f1c156083c1b180f67150ac937d'),
    ('renewals','renewals_update','9c6212431a65fefd979fb4d126457188')
  ) expected(tab, policy, original_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies
      WHERE schemaname='public' AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.original_hash THEN
      RAISE EXCEPTION 'FIN02_SEC38_BASELINE_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.original_hash,coalesce(actual,'MISSING');
    END IF;
  END LOOP;
END
$fin02_preflight$;

ALTER POLICY licenses_insert ON public.licenses WITH CHECK (public.can_manage_client(client_id));
ALTER POLICY licenses_update ON public.licenses USING (public.can_manage_client(client_id)) WITH CHECK (public.can_manage_client(client_id));
ALTER POLICY contracts_insert ON public.contracts WITH CHECK (public.can_manage_client(client_id));
ALTER POLICY contracts_update ON public.contracts USING (public.can_manage_client(client_id)) WITH CHECK (public.can_manage_client(client_id));
ALTER POLICY renewals_insert ON public.renewals WITH CHECK (public.has_module_access('renewals','edit') AND
 (public.is_hq_user(auth.uid()) OR
 (partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())) OR
 (partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid()))));
ALTER POLICY renewals_update ON public.renewals USING (public.has_module_access('renewals','edit') AND
 (public.is_hq_user(auth.uid()) OR
 (partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())) OR
 (partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())))) WITH CHECK (public.has_module_access('renewals','edit') AND
 (public.is_hq_user(auth.uid()) OR
 (partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())) OR
 (partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid()))));
COMMIT;
