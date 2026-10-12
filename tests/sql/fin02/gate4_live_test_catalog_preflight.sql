-- FIN02 GATE 4A: DATA-FREE LIVE TEST READ-ONLY CATALOG PREFLIGHT.
-- Only SELECT over pg_catalog, information_schema and migration ledger metadata.
-- No customer rows, secrets, data fixes, deploy, trigger execution or DDL.
-- Fail closed on *unexpected signatures*: investigate drift, NEVER update
-- expected hashes automatically. Source: TEST Lovable-backed project, 12 Oct.
WITH
col_shapes AS (
 SELECT 'column:'||c.relname AS check_key,
  count(*)::text||'|'||md5(string_agg(a.attname||':'||
      pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||
      a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),
       '|' ORDER BY a.attname)) AS actual
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
 AND c.relname IN ('clients','contract_lines','contracts','deals','licenses','proposal_items','proposals','renewals')
 GROUP BY c.relname
),
policy_checks AS (
 SELECT 'rls:'||tablename||'.'||policyname AS check_key,
 permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||
 md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) AS actual
 FROM pg_policies WHERE schemaname='public' AND
 ((tablename='clients' AND policyname IN ('clients_insert','clients_update'))
 OR (tablename IN ('contracts','licenses','renewals')
     AND policyname IN (tablename||'_select',tablename||'_insert',tablename||'_update')))
),
function_checks AS (
 SELECT 'function:'||p.proname AS check_key,
 md5(pg_get_functiondef(p.oid)) AS actual
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('award_deal_proposal','close_renewal','close_renewal_core','contract_lines_refresh_total','proposal_contract_recurring','renewal_close_readiness','renewal_line_class','renewal_line_type_for')
),
other_checks AS (
 SELECT 'inventory:public_tables' AS check_key,count(*)::text AS actual
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 UNION ALL SELECT 'inventory:policies',count(*)::text
 FROM pg_policies WHERE schemaname='public'
 UNION ALL SELECT 'inventory:triggers',count(*)::text
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
 UNION ALL SELECT 'inventory:functions',count(*)::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 UNION ALL SELECT 'migration:ledger_count',count(*)::text FROM supabase_migrations.schema_migrations
 UNION ALL SELECT 'migration:fin02_changes',count(*)::text
 FROM supabase_migrations.schema_migrations
 WHERE version LIKE '20261012%' OR name ILIKE '%fin02%'
 UNION ALL SELECT 'fin02:deal_initial_sale_trigger',count(*)::text
 FROM pg_trigger t WHERE t.tgrelid='public.deals'::regclass
 AND t.tgname='fin02_initial_sale_on_won' AND NOT t.tgisinternal
 UNION ALL SELECT 'fin02:prod_initial_sale_trigger',count(*)::text
 FROM pg_trigger t WHERE t.tgrelid='public.deals'::regclass
 AND t.tgname='zz_deal_award_record_revenue' AND NOT t.tgisinternal
 UNION ALL SELECT 'fin02:prod_source_deal_id',count(*)::text
 FROM information_schema.columns WHERE table_schema='public'
 AND table_name='client_revenue_history' AND column_name='source_deal_id'
 UNION ALL SELECT 'fin02:source_ref_unique',count(*)::text
 FROM pg_constraint x WHERE x.conrelid='public.client_revenue_history'::regclass
 AND x.conname='client_revenue_history_client_source_reference_key' AND x.contype='u'
 UNION ALL SELECT 'integration:customer_explorer_client_sync',
 coalesce((SELECT md5(pg_get_functiondef(t.tgfoid)) FROM pg_trigger t
   WHERE t.tgrelid='public.clients'::regclass
   AND t.tgname='customer_explorer_clients_sync'),'MISSING')
),
observed AS (
 SELECT * FROM col_shapes UNION ALL SELECT * FROM policy_checks
 UNION ALL SELECT * FROM function_checks UNION ALL SELECT * FROM other_checks
),
expected(check_key,expected) AS (VALUES
 ('column:clients','40|b844c757faf3d2c5dac2882ad2a58ad6'),
 ('column:contract_lines','18|2f979070e995d4411475b8a30b69ab66'),
 ('column:contracts','26|ccba6c74c9cc88d3aa74d3b0dcae620b'),
 ('column:deals','43|88e03960190990d7f1e30dba2303419b'),
 ('column:licenses','44|f42b11164b26f843f2bfbd1a59445807'),
 ('column:proposal_items','36|96a285969e77bbeb574a3e461e2e3fe6'),
 ('column:proposals','80|0ebeaa2d53ea23d8893080d0c58defc4'),
 ('column:renewals','40|6337a71d4608fb8428e4201d58691e2a'),
 ('rls:clients.clients_insert','PERMISSIVE|INSERT|authenticated|d7a91f1c156083c1b180f67150ac937d'),
 ('rls:clients.clients_update','PERMISSIVE|UPDATE|authenticated|9c6212431a65fefd979fb4d126457188'),
 ('rls:contracts.contracts_insert','PERMISSIVE|INSERT|authenticated|c89bfbf491687267768132c13e52fa0f'),
 ('rls:contracts.contracts_select','PERMISSIVE|SELECT|authenticated|f78a701cb6e66f7e8c29530600f85bb0'),
 ('rls:contracts.contracts_update','PERMISSIVE|UPDATE|authenticated|6e549224e84785db593a057794bdeb78'),
 ('rls:licenses.licenses_insert','PERMISSIVE|INSERT|authenticated|dcac9db3ec765a7f0619b20e470f846d'),
 ('rls:licenses.licenses_select','PERMISSIVE|SELECT|authenticated|bfebb8436f0634b4bc6bd8ae92d2853a'),
 ('rls:licenses.licenses_update','PERMISSIVE|UPDATE|authenticated|dcc929cfdd00e2acf7554d5d94f58bea'),
 ('rls:renewals.renewals_insert','PERMISSIVE|INSERT|authenticated|d7a91f1c156083c1b180f67150ac937d'),
 ('rls:renewals.renewals_select','PERMISSIVE|SELECT|authenticated|40304077653ef7169e090d523da6d341'),
 ('rls:renewals.renewals_update','PERMISSIVE|UPDATE|authenticated|9c6212431a65fefd979fb4d126457188'),
 ('function:award_deal_proposal','1378fed27046f50394e62175ee3cf915'),
 ('function:close_renewal','7a1b8b7108ace4366b09e750a0df0742'),
 ('function:close_renewal_core','bf1a0fb67af994be49f47acb55e56ae1'),
 ('function:contract_lines_refresh_total','ff282e9a4e4fed3f9d0437d05ae62901'),
 ('function:proposal_contract_recurring','cc3bede8bc0be977ec3a121c0eb43b44'),
 ('function:renewal_close_readiness','50796db32eb1654f3208083c77415e2b'),
 ('function:renewal_line_class','a85d089a1eedd657c18b9b8e1039ac89'),
 ('function:renewal_line_type_for','c80bdb761956381867e721a769ffcd9a'),
 ('inventory:public_tables','107'),
 ('inventory:policies','344'),
 ('inventory:triggers','94'),
 ('inventory:functions','175'),
 ('migration:ledger_count','176'),
 ('migration:fin02_changes','0'),
 ('fin02:deal_initial_sale_trigger','0'),
 ('fin02:prod_initial_sale_trigger','0'),
 ('fin02:prod_source_deal_id','0'),
 ('fin02:source_ref_unique','1'),
 ('integration:customer_explorer_client_sync','167e9d52c43c7e871729ff90ad1a6a05')
)
SELECT e.check_key,e.expected,coalesce(o.actual,'MISSING') AS actual,
 CASE WHEN o.actual=e.expected THEN 'PASS' ELSE 'DRIFT_NO_GO' END AS verdict
FROM expected e LEFT JOIN observed o USING (check_key)
ORDER BY CASE WHEN o.actual=e.expected THEN 1 ELSE 0 END,e.check_key;
