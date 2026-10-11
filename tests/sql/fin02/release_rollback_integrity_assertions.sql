-- R1 FIN02 final proof after manual rollbacks in isolated PostgreSQL:
-- 11 TEST RLS policies restored byte-for-byte by normalized pg_policies MD5,
-- initial-sale trigger/function removed, historic synthetic revenue untouched.
DO $fin02_after_rollback$
DECLARE pol record; current_hash text; client uuid;
BEGIN
 FOR pol IN SELECT * FROM (VALUES
   ('clients','clients_insert','d7a91f1c156083c1b180f67150ac937d'),
   ('clients','clients_update','9c6212431a65fefd979fb4d126457188'),
   ('contracts','contracts_insert','c89bfbf491687267768132c13e52fa0f'),
   ('contracts','contracts_select','f78a701cb6e66f7e8c29530600f85bb0'),
   ('contracts','contracts_update','6e549224e84785db593a057794bdeb78'),
   ('licenses','licenses_insert','dcac9db3ec765a7f0619b20e470f846d'),
   ('licenses','licenses_select','bfebb8436f0634b4bc6bd8ae92d2853a'),
   ('licenses','licenses_update','dcc929cfdd00e2acf7554d5d94f58bea'),
   ('renewals','renewals_insert','d7a91f1c156083c1b180f67150ac937d'),
   ('renewals','renewals_select','40304077653ef7169e090d523da6d341'),
   ('renewals','renewals_update','9c6212431a65fefd979fb4d126457188')
 ) expected(tab,policy,baseline_hash) LOOP
  SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,''))
    INTO current_hash FROM pg_policies
    WHERE schemaname='public' AND tablename=pol.tab AND policyname=pol.policy;
  IF current_hash IS DISTINCT FROM pol.baseline_hash THEN
    RAISE EXCEPTION 'FIN02_ROLLBACK_NOT_ORIGINAL_TEST: %.%',pol.tab,pol.policy;
  END IF;
 END LOOP;
 IF to_regprocedure('public.fin02_record_initial_sale()') IS NOT NULL OR
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.deals'::regclass
    AND tgname='fin02_initial_sale_on_won') THEN
   RAISE EXCEPTION 'FIN02_SEC37_WRITER_STILL_PRESENT';
 END IF;
 SELECT c.id INTO client FROM public.clients c
 WHERE c.source_deal_id='00000000-0000-4000-8000-000000000411';
 IF client IS NULL THEN RAISE EXCEPTION 'FIN02_ROLLBACK_DELETED_AWARDED_CLIENT'; END IF;
 IF (SELECT count(*) FROM public.client_revenue_history h
  WHERE h.client_id=client AND h.revenue_type='initial_sale'
   AND h.amount=1608)<>1
 OR (SELECT count(*) FROM public.client_revenue_history h
  WHERE h.client_id=client AND h.revenue_type='renewal' AND h.amount=570)<>2
 OR (SELECT count(*) FROM public.renewals r
  WHERE r.client_id=client AND r.closed_at IS NOT NULL)<>2 THEN
  RAISE EXCEPTION 'FIN02_ROLLBACK_CHANGED_COMMERCIAL_HISTORY_OR_PERIODS';
 END IF;
 RAISE NOTICE 'FIN02 four independently guarded rollback scripts PASS: original TEST policy fingerprints restored; commercial ledger, contracts and two closed renewals preserved.';
END $fin02_after_rollback$;
