-- FIN02 issue #38 MANUAL/REVIEW-ONLY rollback.
-- Restores exact read-only TEST policy predicates captured 2026-10-12.
-- Safe only if deployed policy MD5 matches the reviewed patch; otherwise FAIL.
-- SECURITY WARNING: rollback restores prior weaker permissions. Prefer a
-- corrective forward patch if exposures would be reintroduced for users.
-- Never execute against PROD. No data rows updated by this script.
BEGIN;
SET LOCAL lock_timeout='5s';
-- Prevent concurrent policy/trigger DDL between preflight and rollback/patch.
LOCK TABLE public.contracts, public.licenses, public.renewals IN ACCESS EXCLUSIVE MODE;
DO $rollback_guard$
DECLARE r record; actual text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('licenses','licenses_insert','d80318e26704b5a73ab1ec8129777e20'),
   ('licenses','licenses_update','259e5a2d9a31c391017b27b3bc3260b1'),
   ('contracts','contracts_insert','d80318e26704b5a73ab1ec8129777e20'),
   ('contracts','contracts_update','259e5a2d9a31c391017b27b3bc3260b1'),
   ('renewals','renewals_insert','4f45b7ff545834f3e6af197fa3ce1caf'),
   ('renewals','renewals_update','f4a70cbd9a78223d8a7ac1e54aca1c56')
 ) expected(tab, policy, deployed_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies WHERE schemaname='public'
       AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.deployed_hash THEN
      RAISE EXCEPTION 'FIN02_SEC38_ROLLBACK_POLICY_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.deployed_hash,coalesce(actual,'MISSING');
    END IF;
 END LOOP;
END $rollback_guard$;
ALTER POLICY "licenses_insert" ON public."licenses"
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

ALTER POLICY "licenses_update" ON public."licenses"
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))))
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

ALTER POLICY "contracts_insert" ON public."contracts"
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

ALTER POLICY "contracts_update" ON public."contracts"
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))))
  WITH CHECK ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND ((c.partner_id)::uuid = get_user_partner_id(auth.uid())))))));

ALTER POLICY "renewals_insert" ON public."renewals"
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

ALTER POLICY "renewals_update" ON public."renewals"
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))))
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));
DO $verify_rollback$
DECLARE r record; actual text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
    ('licenses','licenses_insert','dcac9db3ec765a7f0619b20e470f846d'),
    ('licenses','licenses_update','dcc929cfdd00e2acf7554d5d94f58bea'),
    ('contracts','contracts_insert','c89bfbf491687267768132c13e52fa0f'),
    ('contracts','contracts_update','6e549224e84785db593a057794bdeb78'),
    ('renewals','renewals_insert','d7a91f1c156083c1b180f67150ac937d'),
    ('renewals','renewals_update','9c6212431a65fefd979fb4d126457188')
 ) expected(tab,policy,baseline_hash) LOOP
  SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
    INTO actual FROM pg_policies WHERE schemaname='public'
      AND tablename=r.tab AND policyname=r.policy;
  IF actual IS DISTINCT FROM r.baseline_hash THEN
    RAISE EXCEPTION 'FIN02_SEC38_ROLLBACK_FAILED_TO_RESTORE: %.%',r.tab,r.policy;
  END IF;
 END LOOP;
END $verify_rollback$;
COMMIT;
