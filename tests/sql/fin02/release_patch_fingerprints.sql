-- Gate FIN02 migration fingerprints for creating exact fail-closed rollback guards.
-- This SQL is run in disposable PostgreSQL CI only; NO user/client data.
SELECT 'FIN02_POLICY_HASH|'||tablename||'.'||policyname||'|'||
 md5(coalesce(qual,'')||'|'||coalesce(with_check,''))
FROM pg_policies WHERE schemaname='public' AND (
 (tablename='clients' AND policyname IN ('clients_insert','clients_update'))
 OR (tablename='licenses' AND policyname IN ('licenses_select','licenses_insert','licenses_update'))
 OR (tablename='contracts' AND policyname IN ('contracts_select','contracts_insert','contracts_update'))
 OR (tablename='renewals' AND policyname IN ('renewals_select','renewals_insert','renewals_update'))
) ORDER BY tablename,policyname;
SELECT 'FIN02_FUNCTION_HASH|'||md5(pg_get_functiondef('public.fin02_record_initial_sale()'::regprocedure));
SELECT 'FIN02_TRIGGER_PRESENT|'||t.tgname
FROM pg_trigger t WHERE t.tgrelid='public.deals'::regclass
 AND t.tgname='fin02_initial_sale_on_won';
