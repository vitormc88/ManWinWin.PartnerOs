-- Diagnostic assertions against a database built from ALL Git migrations.
-- Nothing here writes to the application data. No customer records included.
SELECT
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public') AS public_functions,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public') AS public_rls_policies,
  (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal) AS public_noninternal_triggers;

DO $full_schema_test$
DECLARE
  _t text;
  _d text;
  _v integer;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'proposals', 'proposal_items', 'deals', 'contracts',
    'contract_lines', 'clients', 'licenses', 'renewals'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=_t
        AND c.relkind IN ('r','p') AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'FIN02_FULL_SCHEMA_TABLE_OR_RLS_MISSING: %', _t;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO _v
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='contract_lines'
    AND column_name IN ('renewal_amount','pricing_snapshot');
  IF _v <> 2 THEN
    RAISE EXCEPTION 'FIN02_FULL_SCHEMA_POLICY_COLUMNS_NOT_INSTALLED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.contract_lines'::regclass
      AND tgname='trg_fin02_capture_contract_policy') THEN
    RAISE EXCEPTION 'FIN02_FULL_SCHEMA_PRICE_POLICY_TRIGGER_MISSING';
  END IF;

  SELECT pg_get_functiondef(
   'public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer)'::regprocedure)
  INTO _d;
  IF position('fin02_assert_business_award' IN _d) = 0 THEN
    RAISE EXCEPTION 'FIN02_FULL_SCHEMA_AWARD_RPC_GUARD_MISSING';
  END IF;

  SELECT pg_get_functiondef(
   'public.close_renewal_core(uuid,text,uuid,text,text,date,date)'::regprocedure)
  INTO _d;
  IF position('FIN02_RENEWAL_POLICY_V1' IN _d) = 0
    OR position('coalesce(renewal_amount, amount)' IN _d) = 0 THEN
    RAISE EXCEPTION 'FIN02_FULL_SCHEMA_RENEWAL_POLICY_MISSING';
  END IF;
  RAISE NOTICE 'FIN02 local full repository migrations have reconstructed the required financial objects; effective TEST parity is NOT implied';
END
$full_schema_test$;
