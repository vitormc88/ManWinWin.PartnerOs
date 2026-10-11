-- FIN02 Issue #37 MANUAL/REVIEW-ONLY rollback of automatic first-sale writer.
-- IMPORTANT: DO NOT DELETE historic revenue events; this only disables future
-- automatic posting. Previously posted amounts, source references, currency
-- and accounting provenance remain unchanged and require separate reconciliation.
-- This rollback intentionally restores the original TEST absence of first-sale
-- posting. It can reintroduce an operational history gap. Never use on PROD.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $fin02_guard$
DECLARE f_hash text; f_oid oid;
BEGIN
 SELECT p.oid,md5(pg_get_functiondef(p.oid)) INTO f_oid,f_hash
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='fin02_record_initial_sale'
  AND pg_get_function_identity_arguments(p.oid)='';
 IF f_oid IS NULL OR f_hash <> 'a8bd1059505b4458bf3a107bde3ae010' THEN
  RAISE EXCEPTION 'FIN02_SEC37_ROLLBACK_FUNCTION_SOURCE_DRIFT: %',coalesce(f_hash,'MISSING');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.deals'::regclass
      AND t.tgname='fin02_initial_sale_on_won'
      AND t.tgfoid=f_oid AND NOT t.tgisinternal
      AND t.tgenabled='O' AND t.tgtype=17 AND t.tgqual IS NULL
      AND cardinality(t.tgattr::smallint[])=2
      AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid='public.deals'::regclass AND a.attname='status'
             AND NOT a.attisdropped)=ANY(t.tgattr::smallint[])
      AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid='public.deals'::regclass AND a.attname='client_id'
             AND NOT a.attisdropped)=ANY(t.tgattr::smallint[])) THEN
   RAISE EXCEPTION 'FIN02_SEC37_ROLLBACK_TRIGGER_DRIFT';
 END IF;
END $fin02_guard$;
DROP TRIGGER fin02_initial_sale_on_won ON public.deals;
DROP FUNCTION public.fin02_record_initial_sale();
-- No DELETE/UPDATE executed against client_revenue_history.
DO $fin02_post$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_trigger t
   WHERE t.tgrelid='public.deals'::regclass
    AND t.tgname='fin02_initial_sale_on_won' AND NOT t.tgisinternal)
 OR to_regprocedure('public.fin02_record_initial_sale()') IS NOT NULL THEN
   RAISE EXCEPTION 'FIN02_SEC37_ROLLBACK_DID_NOT_REMOVE_WRITER';
 END IF;
END $fin02_post$;
COMMIT;
