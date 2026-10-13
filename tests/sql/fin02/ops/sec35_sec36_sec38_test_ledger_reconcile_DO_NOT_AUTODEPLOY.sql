-- AUDITED TEST-ONLY METADATA RECONCILIATION, NEVER AUTODEPLOY OR RUN ON PROD.
-- This source must be run ONLY via the authorized Lovable TEST project UUID
-- 09e44188-ec64-4ec3-8add-b3b54882408c, Supabase ref avxxzmoayxzrykwqzoqn.
-- BEFORE executing, operator MUST independently verify that project mapping and
-- review 11 installed policy hashes. This script will fail-closed if TEST drifted.
-- This script ONLY INSERTS records in supabase_migrations.schema_migrations;
-- it NEVER executes the archived migration SQL in statements[]. Read-only.
-- Already applied through Lovable native Drizzle journal; do NOT reapply DDL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;

DO $fin02_ledger_guard$
DECLARE pol_ok integer; journal_ok integer; source_ok integer; got_extra integer; old_ok integer;
BEGIN
  WITH expected(tab, policy, h) AS (VALUES
    ('clients','clients_insert','ffd83a8780c4e9fb5fc3d4e8797c7580'),
    ('clients','clients_update','da6fafc61791ee6689ad3d103e733133'),
    ('contracts','contracts_select','330907b1a467be5ab476a615308f8c77'),
    ('licenses','licenses_select','ee669111277e6472860b8c461e4f6cf2'),
    ('renewals','renewals_select','6b69a60063e85df298fff1b954e5534d'),
    ('contracts','contracts_insert','d80318e26704b5a73ab1ec8129777e20'),
    ('contracts','contracts_update','259e5a2d9a31c391017b27b3bc3260b1'),
    ('licenses','licenses_insert','d80318e26704b5a73ab1ec8129777e20'),
    ('licenses','licenses_update','259e5a2d9a31c391017b27b3bc3260b1'),
    ('renewals','renewals_insert','4f45b7ff545834f3e6af197fa3ce1caf'),
    ('renewals','renewals_update','f4a70cbd9a78223d8a7ac1e54aca1c56')
  )
  SELECT count(*) INTO pol_ok FROM expected e JOIN pg_policies p ON p.schemaname='public'
   AND p.tablename=e.tab AND p.policyname=e.policy
   AND md5(coalesce(p.qual,'')||'|'||coalesce(p.with_check,''))=e.h
   AND p.permissive='PERMISSIVE' AND p.roles::text[]=ARRAY['authenticated']::text[]
   AND p.cmd=upper(split_part(e.policy,'_',2));
  SELECT count(*) INTO journal_ok FROM drizzle.__drizzle_migrations WHERE
   (id=1 AND hash='2762f2ef87e9950572b03db74aa4c7bb0ca38d1564d70fe15050ec38c5a16d54')
   OR (id=2 AND hash='6b87663e20a60ea93bbdcc6b43f822657075c612140c07de0be3b76c4d968121')
   OR (id=3 AND hash='998e8958341e73e41f0a95cc24aab37909503d9ee18fa97233ab8727c5536742');
  SELECT count(*) INTO source_ok FROM drizzle.__drizzle_migrations;
  SELECT count(*) INTO old_ok FROM supabase_migrations.schema_migrations
   WHERE (version='20261011213000' AND name='fin02_award_source_line_renewal_policy')
      OR (version='20261012000300' AND name='fin02_sec37_initial_sale_ledger');
  SELECT count(*) INTO got_extra FROM supabase_migrations.schema_migrations
   WHERE version IN ('20261012000100','20261012000200','20261012000400');
  IF (pol_ok,journal_ok,source_ok,old_ok,got_extra) IS DISTINCT FROM (11,3,3,2,0)
    OR (SELECT count(*) FROM pg_class WHERE oid IN ('public.clients'::regclass,'public.contracts'::regclass,'public.licenses'::regclass,'public.renewals'::regclass) AND relrowsecurity)<>4
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.deals'::regclass AND tgname='fin02_initial_sale_on_won' AND tgenabled='O')<>1
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.contract_lines'::regclass AND tgname='trg_fin02_capture_contract_policy' AND tgenabled='O')<>1
  THEN RAISE EXCEPTION 'TEST_FIN02_RECONCILE_PRECONDITION_FAILED: policies %, drizzle verified %, drizzle count %, prior history %, target history %',pol_ok,journal_ok,source_ok,old_ok,got_extra; END IF;
END $fin02_ledger_guard$;

INSERT INTO supabase_migrations.schema_migrations(version, statements, name)
VALUES
  ('20261012000100', ARRAY[$fin02_original_0$-- FIN02 R1 SEC-35. REVIEW-ONLY migration, NOT applied to TEST/PROD.
-- Baseline: read-only TEST public.pg_policies snapshot 2026-10-12.
-- Must fail CLOSED on missing/unexpected policy state. No migration is authorized
-- for PROD; TEST execution requires separate explicit user approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Prevent concurrent policy/trigger DDL between preflight and rollback/patch.
LOCK TABLE public.clients IN ACCESS EXCLUSIVE MODE;
DO $fin02_preflight$
DECLARE r record; actual text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('clients','clients_insert','d7a91f1c156083c1b180f67150ac937d'),
    ('clients','clients_update','9c6212431a65fefd979fb4d126457188')
  ) expected(tab, policy, original_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies
      WHERE schemaname='public' AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.original_hash THEN
      RAISE EXCEPTION 'FIN02_SEC35_BASELINE_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.original_hash,coalesce(actual,'MISSING');
    END IF;
  END LOOP;
END
$fin02_preflight$;

ALTER POLICY clients_insert ON public.clients WITH CHECK (
  public.has_module_access('clients','edit') AND (public.is_hq_user(auth.uid()) OR (
      partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())
    ) OR (
      partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())
    ))
);
ALTER POLICY clients_update ON public.clients
  USING (public.has_module_access('clients','edit') AND (public.is_hq_user(auth.uid()) OR (
      partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())
    ) OR (
      partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())
    )))
  WITH CHECK (public.has_module_access('clients','edit') AND (public.is_hq_user(auth.uid()) OR (
      partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())
    ) OR (
      partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())
    )));
COMMIT;
$fin02_original_0$]::text[], 'fin02_sec35_clients_write_policy'),
  ('20261012000200', ARRAY[$fin02_original_1$-- FIN02 R1 SEC-36. REVIEW-ONLY migration, NOT applied to TEST/PROD.
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
    ('contracts','contracts_select','f78a701cb6e66f7e8c29530600f85bb0'),
    ('licenses','licenses_select','bfebb8436f0634b4bc6bd8ae92d2853a'),
    ('renewals','renewals_select','40304077653ef7169e090d523da6d341')
  ) expected(tab, policy, original_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies
      WHERE schemaname='public' AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.original_hash THEN
      RAISE EXCEPTION 'FIN02_SEC36_BASELINE_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.original_hash,coalesce(actual,'MISSING');
    END IF;
  END LOOP;
END
$fin02_preflight$;

ALTER POLICY licenses_select ON public.licenses USING (public.is_hq_user(auth.uid()) OR EXISTS (
 SELECT 1 FROM public.clients c WHERE c.id=licenses.client_id AND (
   (c.partner_uuid IS NOT NULL AND public.can_view_partner(c.partner_uuid))
   OR (c.partner_uuid IS NULL AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND public.can_view_partner((CASE WHEN c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN c.partner_id::uuid ELSE NULL::uuid END)))
 )
));
ALTER POLICY contracts_select ON public.contracts USING (public.is_hq_user(auth.uid()) OR EXISTS (
 SELECT 1 FROM public.clients c WHERE c.id=contracts.client_id AND (
   (c.partner_uuid IS NOT NULL AND public.can_view_partner(c.partner_uuid))
   OR (c.partner_uuid IS NULL AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND public.can_view_partner((CASE WHEN c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN c.partner_id::uuid ELSE NULL::uuid END)))
 )
));
ALTER POLICY renewals_select ON public.renewals USING (public.is_hq_user(auth.uid()) OR
 (partner_uuid IS NOT NULL AND public.can_view_partner(partner_uuid)) OR
 (partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.can_view_partner((CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END))));
COMMIT;
$fin02_original_1$]::text[], 'fin02_sec36_canonical_partner_reads'),
  ('20261012000400', ARRAY[$fin02_original_2$-- FIN02 R1 SEC-38. REVIEW-ONLY migration, NOT applied to TEST/PROD.
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
$fin02_original_2$]::text[], 'fin02_sec38_financial_write_policy');

DO $fin02_ledger_verify$
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN
 ('20261011213000','20261012000100','20261012000200','20261012000300','20261012000400')) <> 5
 OR (SELECT count(*) FROM supabase_migrations.schema_migrations
   WHERE (version='20261012000100' AND name='fin02_sec35_clients_write_policy' AND array_length(statements,1)=1)
      OR (version='20261012000200' AND name='fin02_sec36_canonical_partner_reads' AND array_length(statements,1)=1)
      OR (version='20261012000400' AND name='fin02_sec38_financial_write_policy' AND array_length(statements,1)=1)) <> 3
 OR (SELECT count(*) FROM drizzle.__drizzle_migrations)<>3
 THEN RAISE EXCEPTION 'TEST_FIN02_RECONCILE_POSTCONDITION_FAILED'; END IF;
END $fin02_ledger_verify$;
SELECT version,name,array_length(statements,1) AS archived_original_sql_count, length(statements[1]) AS original_sql_bytes
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261012000100','20261012000200','20261012000400')
ORDER BY version;
COMMIT;
