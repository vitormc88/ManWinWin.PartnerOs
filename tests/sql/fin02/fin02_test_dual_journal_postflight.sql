-- PartnerOS R1: TEST SQL read-only preflight for dual migration-journal reconciliation.
-- Verify the Lovable project ref avxxzmoayxzrykwqzoqn OUTSIDE this query.
-- Do not treat current_database()='postgres' as proof of TEST identity.
-- Postflight read-only assertion. No migration or ledger writes are permitted.
WITH expected(tab,policy,hash) AS (
  VALUES
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
), audit AS (
  SELECT count(*) AS expected_policies, count(p.policyname) AS found_policies,
    count(*) FILTER (WHERE p.policyname IS NOT NULL
      AND p.permissive='PERMISSIVE'
      AND p.roles::text[]=ARRAY['authenticated']::text[]
      AND p.cmd=upper(split_part(e.policy,'_',2))
      AND md5(coalesce(p.qual,'')||'|'||coalesce(p.with_check,''))=e.hash) AS correct_policies
  FROM expected e LEFT JOIN pg_policies p
    ON p.schemaname='public' AND p.tablename=e.tab AND p.policyname=e.policy
), dj AS (
  SELECT count(*) AS journal_rows,
  count(*) FILTER (WHERE id=1 AND hash='2762f2ef87e9950572b03db74aa4c7bb0ca38d1564d70fe15050ec38c5a16d54') AS sec35,
  count(*) FILTER (WHERE id=2 AND hash='6b87663e20a60ea93bbdcc6b43f822657075c612140c07de0be3b76c4d968121') AS sec36,
  count(*) FILTER (WHERE id=3 AND hash='998e8958341e73e41f0a95cc24aab37909503d9ee18fa97233ab8727c5536742') AS sec38
  FROM drizzle.__drizzle_migrations
), sh AS (
  SELECT
    count(*) FILTER (WHERE version IN ('20261011213000','20261012000300')) AS fin02_sec37,
    count(*) FILTER (WHERE version IN ('20261012000100','20261012000200','20261012000400')) AS sec35_36_38
  FROM supabase_migrations.schema_migrations
), provenance AS (
 SELECT count(*) AS originals_archived
 FROM supabase_migrations.schema_migrations
 WHERE (version='20261012000100' AND name='fin02_sec35_clients_write_policy' AND
        md5(statements[1])='41c8b479ff5c8b347e611695435727d3' AND array_length(statements,1)=1)
    OR (version='20261012000200' AND name='fin02_sec36_canonical_partner_reads' AND
        md5(statements[1])='90c7a036484a31ed29d30d28263f8831' AND array_length(statements,1)=1)
    OR (version='20261012000400' AND name='fin02_sec38_financial_write_policy' AND
        md5(statements[1])='124805a0c6083970695c90743bcc55ac' AND array_length(statements,1)=1)
), safeguards AS (
  SELECT
  (SELECT count(*) FROM public.contract_lines) AS contract_lines,
  (SELECT count(*) FROM public.client_revenue_history) AS revenue_events,
  (SELECT count(*) FROM pg_class WHERE oid IN (
    'public.clients'::regclass,'public.contracts'::regclass,
    'public.licenses'::regclass,'public.renewals'::regclass
    ) AND relrowsecurity) AS rls_enabled_of_four,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.deals'::regclass AND
     tgname='fin02_initial_sale_on_won' AND tgenabled='O') AS sec37_trigger_active,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.contract_lines'::regclass AND
     tgname='trg_fin02_capture_contract_policy' AND tgenabled='O') AS fin02_trigger_active
)
SELECT
 current_database() AS database_name_not_project_identity,
 (audit.expected_policies=11 AND audit.found_policies=11 AND audit.correct_policies=11) AS all_sec_policy_hashes_match,
 audit.correct_policies AS matching_policies_of_11,
 (dj.journal_rows=3 AND dj.sec35=1 AND dj.sec36=1 AND dj.sec38=1) AS native_drizzle_journal_matches,
 sh.fin02_sec37=2 AS prior_supabase_fin02_sec37_registered,
 sh.sec35_36_38=3 AS sec35_36_38_supabase_versions_registered,
 provenance.originals_archived=3 AS all_three_git_original_sources_archived,
 safeguards.contract_lines, safeguards.revenue_events,
 safeguards.rls_enabled_of_four,
 safeguards.sec37_trigger_active, safeguards.fin02_trigger_active
FROM audit CROSS JOIN dj CROSS JOIN sh CROSS JOIN provenance CROSS JOIN safeguards;
