-- FIN02 issue #35 MANUAL/REVIEW-ONLY rollback.
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
   ('clients','clients_insert','9624316b33ad1166f963d28cbbe1545f'),
   ('clients','clients_update','759edb9d4bd0a53e98257f22de25c379')
 ) expected(tab, policy, deployed_hash) LOOP
    SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,''))
      INTO actual FROM pg_policies WHERE schemaname='public'
       AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.deployed_hash THEN
      RAISE EXCEPTION 'FIN02_SEC35_ROLLBACK_POLICY_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.deployed_hash,coalesce(actual,'MISSING');
    END IF;
 END LOOP;
END $rollback_guard$;
ALTER POLICY "clients_insert" ON public."clients"
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));

ALTER POLICY "clients_update" ON public."clients"
  USING ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))))
  WITH CHECK ((is_hq_user(auth.uid()) OR ((partner_id IS NOT NULL) AND ((partner_id)::uuid = get_user_partner_id(auth.uid())))));
DO $verify_rollback$
DECLARE r record; actual text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
    ('clients','clients_insert','d7a91f1c156083c1b180f67150ac937d'),
    ('clients','clients_update','9c6212431a65fefd979fb4d126457188')
 ) expected(tab,policy,baseline_hash) LOOP
  SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,''))
    INTO actual FROM pg_policies WHERE schemaname='public'
      AND tablename=r.tab AND policyname=r.policy;
  IF actual IS DISTINCT FROM r.baseline_hash THEN
    RAISE EXCEPTION 'FIN02_SEC35_ROLLBACK_FAILED_TO_RESTORE: %.%',r.tab,r.policy;
  END IF;
 END LOOP;
END $verify_rollback$;
COMMIT;
