-- FIN01->FIN02 Gate4D: SQL transaction/security regression against the LAB candidate.
\set ON_ERROR_STOP on
DO $$
BEGIN
 IF has_function_privilege('anon','public.save_business_draft_atomic_candidate(uuid,timestamptz,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','public.save_business_draft_atomic_candidate(uuid,timestamptz,jsonb,jsonb)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.save_business_draft_atomic_candidate(uuid,timestamptz,jsonb,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Unexpected invocation grants'; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
SELECT public.save_business_draft_atomic_candidate(
 '00000000-0000-4000-8000-000000000901',NULL,
 public.gate4d_payload(),public.gate4d_items(false));
DO $$
BEGIN
 IF (SELECT count(*) FROM public.proposal_items WHERE proposal_id='00000000-0000-4000-8000-000000000901')<>4
 OR (SELECT total_year_1 FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000901')<>1608
 OR (SELECT total_recurring FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000901')<>570
 OR NOT EXISTS (SELECT 1 FROM public.proposal_items WHERE proposal_id='00000000-0000-4000-8000-000000000901'
                  AND item_code='WEB' AND NOT apply_discount_to_renewal)
 THEN RAISE EXCEPTION 'Atomic create first-period and renewal baseline incorrect'; END IF;
END $$;

-- Stable client-generated proposal UUID: a repeated create request is
-- explicitly REJECTED, not silently duplicated. Caller must re-fetch.
DO $$
DECLARE _seen boolean := false;
BEGIN
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000901',NULL,
   public.gate4d_payload(),public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '40001' THEN _seen:=true;
 END;
 IF NOT _seen OR (SELECT count(*) FROM public.proposals)<>1 OR
  (SELECT count(*) FROM public.proposal_items)<>4 THEN
  RAISE EXCEPTION 'Duplicate retry generated a second proposal or lines'; END IF;
END $$;

-- Change ONLY renewal discount policy; create different next-cycle amount.
DO $$
DECLARE _t timestamptz;
BEGIN
 SELECT updated_at INTO _t FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000901';
 PERFORM public.save_business_draft_atomic_candidate(
  '00000000-0000-4000-8000-000000000901',_t,
  public.gate4d_payload('deal','00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000201','Fictional Updated',558),
  public.gate4d_items(true));
 IF (SELECT total_recurring FROM public.proposals
   WHERE id='00000000-0000-4000-8000-000000000901')<>558
 OR (SELECT count(*) FROM public.proposal_items
   WHERE proposal_id='00000000-0000-4000-8000-000000000901')<>4
 OR NOT EXISTS(SELECT 1 FROM public.proposal_items
   WHERE item_code='WEB' AND apply_discount_to_renewal)
 THEN RAISE EXCEPTION 'Continuing discount not persisted atomically'; END IF;
 -- Second writer with the stale timestamp must fail, even with permissions.
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000901',_t,
   public.gate4d_payload(),public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '40001' THEN RETURN;
 END;
 RAISE EXCEPTION 'Stale writer overrode newer Draft';
END $$;

-- Injected trigger AFTER HEADER UPDATE + DELETE previous items: entire RPC
-- transaction must roll back without losing any saved line or header data.
DO $$
DECLARE _t timestamptz; _before jsonb; _after jsonb; _failed boolean:=false;
BEGIN
 SELECT updated_at INTO _t FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000901';
 SELECT jsonb_build_object(
  'header',(SELECT to_jsonb(p) FROM public.proposals p WHERE id='00000000-0000-4000-8000-000000000901'),
  'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY sort_order) FROM public.proposal_items i
    WHERE i.proposal_id='00000000-0000-4000-8000-000000000901'))
 INTO _before;
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000901',_t,
   public.gate4d_payload('deal','00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201','CORRUPTED IF LEFT SAVED'),
   public.gate4d_items(false,true));
 EXCEPTION WHEN SQLSTATE '23514' THEN _failed:=true;
 END;
 SELECT jsonb_build_object(
  'header',(SELECT to_jsonb(p) FROM public.proposals p WHERE id='00000000-0000-4000-8000-000000000901'),
  'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY sort_order) FROM public.proposal_items i
    WHERE i.proposal_id='00000000-0000-4000-8000-000000000901'))
 INTO _after;
 IF NOT _failed OR _before IS DISTINCT FROM _after THEN
  RAISE EXCEPTION 'ATOMIC ROLLBACK FAILURE: header or prior item rows changed after line insert error'; END IF;
END $$;

-- Header mismatch, line-cent mismatch and extra forbidden API keys rejected.
DO $$
DECLARE _failed boolean;
BEGIN
 _failed:=false;
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000903',NULL,
   public.gate4d_payload() || '{"total_recurring":999}'::jsonb,public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '22023' THEN _failed:=true; END;
 IF NOT _failed THEN RAISE EXCEPTION 'Invalid recurring total accepted'; END IF;
 _failed:=false;
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000903',NULL,
   public.gate4d_payload(),jsonb_set(public.gate4d_items(false),'{1,net_total}','389'::jsonb));
 EXCEPTION WHEN SQLSTATE '22023' THEN _failed:=true; END;
 IF NOT _failed THEN RAISE EXCEPTION 'Incorrect per-line net/gross accepted'; END IF;
 _failed:=false;
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000903',NULL,
   public.gate4d_payload() || '{"status":"Won"}'::jsonb,public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '22023' THEN _failed:=true; END;
 IF NOT _failed THEN RAISE EXCEPTION 'Caller forged privileged status'; END IF;
 _failed:=false;
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000903',NULL,
   public.gate4d_payload() || '{"proposal_mode":"compare_keepit_useit"}'::jsonb,
   public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _failed:=true; END;
 IF NOT _failed THEN RAISE EXCEPTION 'Unsupported unsnapshotted compare mode accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000903')
 THEN RAISE EXCEPTION 'Invalid insert left proposal'; END IF;
END $$;

-- Client-source Business Draft is supported without touching source Deal.
SELECT public.save_business_draft_atomic_candidate(
 '00000000-0000-4000-8000-000000000904',NULL,
 public.gate4d_payload('client','00000000-0000-4000-8000-000000000111',
  '00000000-0000-4000-8000-000000000201'),public.gate4d_items(false));
DO $$
BEGIN
 IF (SELECT source_type FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000904')<>'client'
 THEN RAISE EXCEPTION 'Client proposal incorrectly converted to Deal'; END IF;
END $$;
RESET ROLE;

-- Actor B cannot invoke another partner's source; authenticated role alone
-- must not allow unauthorized writes by forged partner_uuid.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
DO $$
DECLARE _failed boolean:=false;
BEGIN
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000905',NULL,
   public.gate4d_payload(),public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _failed:=true; END;
 IF NOT _failed THEN RAISE EXCEPTION 'Cross-partner actor created deal proposal'; END IF;
 IF EXISTS(SELECT 1 FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000905')
 THEN RAISE EXCEPTION 'Unauthorized row inserted'; END IF;
END $$;
-- Actor B can save its own source.
SELECT public.save_business_draft_atomic_candidate(
 '00000000-0000-4000-8000-000000000906',NULL,
 public.gate4d_payload('deal','00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000202'),public.gate4d_items(false));
RESET ROLE;

-- Status transition protection (already Ready) must be respected even if a
-- Business save caller supplies a stale Draft payload.
UPDATE public.proposals SET status='Ready'
 WHERE id='00000000-0000-4000-8000-000000000901';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
DO $$
DECLARE _stamp timestamptz; _failed boolean:=false;
BEGIN
 SELECT updated_at INTO _stamp FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000901';
 BEGIN
  PERFORM public.save_business_draft_atomic_candidate(
   '00000000-0000-4000-8000-000000000901',_stamp,
   public.gate4d_payload(),public.gate4d_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _failed:=true; END;
 IF NOT _failed OR (SELECT status FROM public.proposals
  WHERE id='00000000-0000-4000-8000-000000000901')<>'Ready'
 THEN RAISE EXCEPTION 'Immutable Ready proposal mutated'; END IF;
END $$;
RESET ROLE;
SELECT 'Gate4D PASS — atomic create/replace, source scoped RLS, temporary discount, stale writer, forced post-delete failure, no invalid/forged saves' AS result;
