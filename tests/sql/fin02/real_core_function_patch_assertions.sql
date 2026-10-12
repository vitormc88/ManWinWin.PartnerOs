-- Prove the PR34 dynamic SQL patch runs against the ORIGINAL Supabase
-- PROD/TEST source definitions, not a simplified surrogate.
-- Read-only catalog assertions on disposable PostgreSQL only.
DO $fin02_actual_rpc$
DECLARE
  award_body text;
  renewal_body text;
  n int;
BEGIN
 SELECT pg_get_functiondef(
   'public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer)'::regprocedure)
 INTO award_body;
 SELECT pg_get_functiondef(
   'public.close_renewal_core(uuid,text,uuid,text,text,date,date)'::regprocedure)
 INTO renewal_body;
 IF award_body IS NULL OR renewal_body IS NULL THEN
   RAISE EXCEPTION 'FIN02_ORIGINAL_RPC_NOT_INSTALLED';
 END IF;
 IF position('fin02_assert_business_award' IN award_body)=0
  OR position('public.has_module_access' IN award_body)=0
  OR position('public.can_manage_deal' IN award_body)=0
  OR position('FOR UPDATE' IN award_body)=0 THEN
  RAISE EXCEPTION 'FIN02_ORIGINAL_AWARD_AUTH_OR_LOCK_OR_ITEM_GUARD_LOST';
 END IF;
 IF position('FIN02_RENEWAL_POLICY_V1' IN renewal_body)=0
  OR position('public.can_manage_client' IN renewal_body)=0
  OR position('IF r.closed_at IS NOT NULL THEN' IN renewal_body)=0
  OR position('IF p.product_family = ''Business'' THEN' IN renewal_body)=0 THEN
   RAISE EXCEPTION 'FIN02_ORIGINAL_RENEWAL_AUTH_IDEMPOTENCY_POLICY_MISSING';
 END IF;
 n := (length(renewal_body) - length(replace(renewal_body,
   'sum(coalesce(renewal_amount, amount)) FILTER (',''))) /
   length('sum(coalesce(renewal_amount, amount)) FILTER (');
 IF n <> 3 THEN
  RAISE EXCEPTION 'FIN02_ORIGINAL_RENEWAL_EXPECTED_3_AGGREGATIONS_GOT_%',n;
 END IF;
 IF NOT (SELECT prosecdef FROM pg_proc
    WHERE oid='public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer)'::regprocedure)
 OR NOT (SELECT prosecdef FROM pg_proc
    WHERE oid='public.close_renewal_core(uuid,text,uuid,text,text,date,date)'::regprocedure)
 THEN RAISE EXCEPTION 'FIN02_ORIGINAL_SOURCE_SECURITY_DEFINER_LOST'; END IF;
 RAISE NOTICE 'FIN02 original PROD/TEST award and renewal SQL definitions compiled, migration patched and preserved original auth/locks/idempotence. FUNCTIONAL original RPC and RLS tests remain pending.';
END
$fin02_actual_rpc$;
