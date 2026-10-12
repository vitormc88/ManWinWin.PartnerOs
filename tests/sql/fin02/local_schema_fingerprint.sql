-- Local-only structure inventory. Ignore precisely the two new FIN02 columns
-- when comparing the pre-migration live TEST column fingerprint.
WITH t AS (
 SELECT table_name,count(*) AS n,
   md5(string_agg(column_name||':'||udt_name||':'||is_nullable,'|' ORDER BY ordinal_position))
     AS column_hash
 FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name IN ('deals','clients','licenses','contracts','contract_lines',
     'proposals','proposal_items','renewals')
   AND NOT (table_name='contract_lines' AND
      column_name IN ('renewal_amount','pricing_snapshot'))
 GROUP BY table_name
), f AS (
 SELECT p.proname AS function_name,
    md5(pg_get_functiondef(p.oid)) AS body_md5,
    p.prosecdef AS definer
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (
    'award_deal_proposal','close_renewal_core','close_renewal',
    'renewal_close_readiness','contract_lines_refresh_total',
    'proposal_contract_recurring','renewal_line_class','renewal_line_type_for')
), r AS (
 SELECT tablename, count(*) AS policy_count,
  md5(string_agg(policyname||':'||cmd||':'||coalesce(qual,'')||':'||
   coalesce(with_check,''),'|' ORDER BY policyname,cmd)) AS fp
 FROM pg_policies WHERE schemaname='public' AND tablename IN
   ('deals','clients','licenses','contracts','contract_lines',
    'proposals','proposal_items','renewals')
 GROUP BY tablename
)
SELECT jsonb_build_object(
 'tables',(SELECT jsonb_object_agg(table_name,jsonb_build_object(
  'columns',n,'column_signature_md5',column_hash)) FROM t),
 'functions',(SELECT jsonb_object_agg(function_name,jsonb_build_object(
  'definition_md5',body_md5,'security_definer',definer)) FROM f),
 'rls_policy_fingerprints',(SELECT jsonb_object_agg(tablename,jsonb_build_object(
  'count',policy_count,'definition_md5',fp)) FROM r)
)::text AS inventory;
