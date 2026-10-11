-- FIN02 issue #36 MANUAL/REVIEW-ONLY rollback.
-- Restores exact read-only TEST policy predicates captured 2026-10-12.
-- Safe only if deployed policy MD5 matches the reviewed patch; otherwise FAIL.
-- SECURITY WARNING: rollback restores prior weaker permissions. Prefer a
-- corrective forward patch if exposures would be reintroduced for users.
-- Never execute against PROD. No data rows updated by this script.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $rollback_guard$
DECLARE r record; actual text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('licenses','licenses_select','ee669111277e6472860b8c461e4f6cf2'),
   ('contracts','contracts_select','330907b1a467be5ab476a615308f8c77'),
   ('renewals','renewals_select','6b69a60063e85df298fff1b954e5534d')
 ) expected(tab, policy, deployed_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies WHERE schemaname='public'
       AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.deployed_hash THEN
      RAISE EXCEPTION 'FIN02_SEC36_ROLLBACK_POLICY_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.deployed_hash,coalesce(actual,'MISSING');
    END IF;
 END LOOP;
END $rollback_guard$;
ALTER POLICY "licenses_select" ON public."licenses"
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = licenses.client_id) AND (c.partner_id IS NOT NULL) AND can_view_partner((c.partner_id)::uuid))))));

ALTER POLICY "contracts_select" ON public."contracts"
  USING ((is_hq_user(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = contracts.client_id) AND (c.partner_id IS NOT NULL) AND can_view_partner((c.partner_id)::uuid))))));

ALTER POLICY "renewals_select" ON public."renewals"
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND can_view_partner((partner_id)::uuid))));
DO $verify_rollback$
DECLARE r record; actual text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
    ('licenses','licenses_select','bfebb8436f0634b4bc6bd8ae92d2853a'),
    ('contracts','contracts_select','f78a701cb6e66f7e8c29530600f85bb0'),
    ('renewals','renewals_select','40304077653ef7169e090d523da6d341')
 ) expected(tab,policy,baseline_hash) LOOP
  SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
    INTO actual FROM pg_policies WHERE schemaname='public'
      AND tablename=r.tab AND policyname=r.policy;
  IF actual IS DISTINCT FROM r.baseline_hash THEN
    RAISE EXCEPTION 'FIN02_SEC36_ROLLBACK_FAILED_TO_RESTORE: %.%',r.tab,r.policy;
  END IF;
 END LOOP;
END $verify_rollback$;
COMMIT;
