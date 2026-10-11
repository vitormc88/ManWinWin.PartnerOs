-- Gate2B: actual TEST/PROD award_deal_proposal and close_renewal_core
-- routines executed ONLY through DENIED / deterministic early-fail paths.
-- Uses exact TEST permission helpers + TEST RLS and synthetic roles.
-- This is not a successful award/renewal E2E (more dependencies pending).

CREATE OR REPLACE FUNCTION public.fin02_assert_unauthorized(
  _expected text, _actor uuid, _deal uuid, _proposal uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE _blocked boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',
    coalesce(_actor::text,''),true);
 BEGIN
   PERFORM public.award_deal_proposal(_deal,_proposal,NULL,
     '{}'::jsonb,'[]'::jsonb,current_date,90);
 EXCEPTION WHEN others THEN
   _blocked := SQLERRM LIKE _expected||'%';
   IF NOT _blocked THEN
     RAISE EXCEPTION 'FIN02_AWARD_ACTUAL_RPC_UNEXPECTED_ERROR: expected %, got %',
       _expected,SQLERRM;
   END IF;
 END;
 IF NOT _blocked THEN
   RAISE EXCEPTION 'FIN02_AWARD_ACTUAL_RPC_ACCEPTED_WHEN_EXPECTED_%',_expected;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin02_assert_renewal_unauthorized(
  _expected text, _actor uuid, _renewal uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE _blocked boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',
    coalesce(_actor::text,''),true);
 BEGIN
   PERFORM public.close_renewal_core(_renewal,'renewed',NULL,NULL,NULL,NULL,NULL);
 EXCEPTION WHEN others THEN
   _blocked := SQLERRM LIKE _expected||'%';
   IF NOT _blocked THEN
     RAISE EXCEPTION 'FIN02_RENEWAL_ACTUAL_RPC_UNEXPECTED_ERROR: expected %, got %',
       _expected,SQLERRM;
   END IF;
 END;
 IF NOT _blocked THEN
   RAISE EXCEPTION 'FIN02_RENEWAL_ACTUAL_RPC_ACCEPTED_WHEN_EXPECTED_%',_expected;
 END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.fin02_assert_unauthorized(text,uuid,uuid,uuid) TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.fin02_assert_renewal_unauthorized(text,uuid,uuid) TO authenticated;

BEGIN;
SET LOCAL ROLE anon;
SELECT public.fin02_assert_unauthorized('AWARD_NOT_AUTHORIZED',NULL,
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000501');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
-- Partner Sales (clients VIEW, not EDIT) must be rejected from award.
SELECT public.fin02_assert_unauthorized('AWARD_NOT_AUTHORIZED',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000501');
-- HQ Standard with explicit clients:view override is also denied,
-- even though TEST's clients table RLS currently allows direct UPDATE.
SELECT public.fin02_assert_unauthorized('AWARD_NOT_AUTHORIZED',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000501');
-- Partner B admin cannot award Partner A's deal.
SELECT public.fin02_assert_unauthorized('AWARD_NOT_AUTHORIZED',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000501');
-- HQ Admin IS authorized to enter the RPC: deliberately fail next
-- commercial source pairing before ANY contract/client mutation.
SELECT public.fin02_assert_unauthorized('PROPOSAL_NOT_FROM_DEAL',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000502');
-- Partner A admin likewise passes entry authorization on own deal only.
SELECT public.fin02_assert_unauthorized('PROPOSAL_NOT_FROM_DEAL',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000502');
-- Partner B admin cannot renew Partner A client's renewal.
SELECT public.fin02_assert_renewal_unauthorized('NOT_AUTHORIZED',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000601');
-- HQ Standard with explicit clients:view override is similarly denied.
SELECT public.fin02_assert_renewal_unauthorized('NOT_AUTHORIZED',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000601');
-- Partner Sales A is clients VIEW; close requires edit and is denied.
SELECT public.fin02_assert_renewal_unauthorized('NOT_AUTHORIZED',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000601');
ROLLBACK;

DO $no_side_effects$
BEGIN
 IF (SELECT count(*) FROM public.clients) <> 2
    OR (SELECT count(*) FROM public.contract_lines) <> 2
    OR (SELECT count(*) FROM public.licenses) <> 2
    OR (SELECT count(*) FROM public.renewals) <> 2 THEN
   RAISE EXCEPTION 'FIN02_DENIED_PATH_LEFT_FINANCIAL_SIDE_EFFECTS';
 END IF;
 RAISE NOTICE 'FIN02 exact TEST financial RPC negative/early-fail authorization matrix PASS. No approved award/renewal path executed yet.';
END
$no_side_effects$;
