-- FIN-02 — catalogue-only, read-only inventory for PROD/TEST/local parity.
-- SAFETY: SELECT only pg_catalog/information_schema, no user or customer rows.
-- Caller must independently verify exact Supabase PROJECT REF before execution.
-- SQL never reads Auth users, Vault secrets, stored credentials or table contents.
WITH financial_tables(name) AS (
  VALUES ('deals'),('clients'),('licenses'),('contracts'),('contract_lines'),
         ('proposals'),('proposal_items'),('renewals')
),
col_info AS (
  SELECT c.table_name, COUNT(*) AS column_count,
    md5(string_agg(c.column_name||':'||c.udt_name||':'||c.is_nullable,
       '|' ORDER BY c.ordinal_position)) AS column_signature_md5
  FROM information_schema.columns c
  JOIN financial_tables ft ON ft.name=c.table_name
  WHERE c.table_schema='public'
  GROUP BY c.table_name
),
tbl_info AS (
  SELECT x.relname AS table_name,x.relrowsecurity AS rls_enabled,
         x.relforcerowsecurity AS rls_forced
  FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace
  JOIN financial_tables ft ON ft.name=x.relname
  WHERE n.nspname='public' AND x.relkind IN ('r','p')
),
constraints AS (
  SELECT cl.relname AS table_name,COUNT(*) AS constraint_count,
    md5(string_agg(co.conname||':'||pg_get_constraintdef(co.oid),
      '|' ORDER BY co.conname)) AS constraint_signature_md5
  FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid
  JOIN pg_namespace n ON n.oid=cl.relnamespace
  JOIN financial_tables ft ON ft.name=cl.relname
  WHERE n.nspname='public'
  GROUP BY cl.relname
),
triggers AS (
  SELECT cl.relname AS table_name,COUNT(*) AS trigger_count,
    md5(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid),
      '|' ORDER BY t.tgname)) AS trigger_signature_md5
  FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=cl.relnamespace
  JOIN financial_tables ft ON ft.name=cl.relname
  WHERE n.nspname='public' AND NOT t.tgisinternal
  GROUP BY cl.relname
),
policies AS (
  SELECT tablename,COUNT(*) AS policy_count,
    md5(string_agg(policyname||':'||cmd||':'||coalesce(qual,'')||':'||
       coalesce(with_check,''),'|' ORDER BY policyname,cmd))
       AS policy_signature_md5
  FROM pg_policies JOIN financial_tables ft ON ft.name=tablename
  WHERE schemaname='public'
  GROUP BY tablename
),
functions AS (
  SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig,
    md5(pg_get_functiondef(p.oid)) AS body_md5,p.prosecdef AS security_definer,
    md5(coalesce(p.proacl::text,'default')) AS grant_signature_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'award_deal_proposal','close_renewal_core','close_renewal',
    'renewal_close_readiness','contract_lines_refresh_total',
    'proposal_contract_recurring','renewal_line_class',
    'renewal_line_type_for')
)
SELECT jsonb_build_object(
  'scope','FIN02 read-only financial metadata',
  'captured_on',current_date,
  'tables',(SELECT jsonb_object_agg(t.table_name,jsonb_build_object(
    'rls_enabled',t.rls_enabled,'rls_forced',t.rls_forced,
    'columns',coalesce(c.column_count,0),
    'column_signature_md5',c.column_signature_md5,
    'constraints',coalesce(k.constraint_count,0),
    'constraint_signature_md5',k.constraint_signature_md5,
    'triggers',coalesce(tr.trigger_count,0),
    'trigger_signature_md5',tr.trigger_signature_md5,
    'policies',coalesce(pol.policy_count,0),
    'policy_signature_md5',pol.policy_signature_md5))
    FROM tbl_info t LEFT JOIN col_info c USING (table_name)
    LEFT JOIN constraints k USING (table_name)
    LEFT JOIN triggers tr USING (table_name)
    LEFT JOIN policies pol ON pol.tablename=t.table_name),
  'functions',(SELECT coalesce(jsonb_object_agg(sig,jsonb_build_object(
      'body_md5',body_md5,'security_definer',security_definer,
      'grant_signature_md5',grant_signature_md5)),'{}'::jsonb)
    FROM functions),
  'extensions',(SELECT jsonb_object_agg(extname,extversion)
    FROM pg_extension WHERE extname IN
    ('pgcrypto','pg_cron','pg_net','pgmq','supabase_vault','uuid-ossp')),
  'object_counts',jsonb_build_object(
    'public_tables',(SELECT count(*) FROM pg_class cl JOIN pg_namespace n
      ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relkind IN ('r','p')),
    'public_functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n
      ON n.oid=p.pronamespace WHERE n.nspname='public'),
    'public_policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
    'public_triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class cl
      ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal))
) AS financial_metadata;
