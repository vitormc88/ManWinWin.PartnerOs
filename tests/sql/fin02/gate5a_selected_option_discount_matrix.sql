-- FIN02 Gate5A — actual source award RPC tested with two selected modes
-- and both promotion policies. DISPOSABLE PG17 ONLY, fictional rows.
-- Run AFTER Gate3 source-backed migration/ledger assertions, BEFORE rollback.
-- Intentionally bracket ALL local scenarios in one rolled-back transaction,
-- so no extra commercial events contaminate existing Gate3 ledger assertions.
BEGIN;
SET LOCAL partneros.proposal_op='on';

-- Two distinct Deal sources, two unselected comparison proposals, and two
-- independently versioned "chosen option" child proposals.
INSERT INTO public.deals(id,partner_id,company_name,country,stage,status)
VALUES
 ('00000000-0000-4000-8000-000000000421','00000000-0000-4000-8000-000000000101','FIN02 Fictional Permanent-Discount KeepIT','PT','Proposal','Open'),
 ('00000000-0000-4000-8000-000000000422','00000000-0000-4000-8000-000000000101','FIN02 Fictional Temporary-Discount UseIT','PT','Proposal','Open');

-- The compare proposal is a historical commercial proposal, NOT a contract.
-- Preserve its own proposed pricing/config and commercial revision identity.
INSERT INTO public.proposals
(id,client_name,source_type,deal_id,partner_uuid,product_family,
 proposal_mode,license_model,status,version,total_year_1,total_recurring,
 discount_amount,business_config)
VALUES
 ('00000000-0000-4000-8000-000000000521','KeepIT/UseIT Comparison - Fictional','deal',
  '00000000-0000-4000-8000-000000000421','00000000-0000-4000-8000-000000000101',
  'Business','compare_keepit_useit',NULL,'Ready',1,1608,558,12,
  '{"selection_required":true,"comparison_id":"fictional-A","alternatives":["keepit","useit"]}'::jsonb),
 ('00000000-0000-4000-8000-000000000522','KeepIT/UseIT Comparison - Fictional','deal',
  '00000000-0000-4000-8000-000000000422','00000000-0000-4000-8000-000000000101',
  'Business','compare_keepit_useit',NULL,'Ready',1,380,400,20,
  '{"selection_required":true,"comparison_id":"fictional-B","alternatives":["keepit","useit"]}'::jsonb),
 ('00000000-0000-4000-8000-000000000523','Selected KeepIT - Fictional','deal',
  '00000000-0000-4000-8000-000000000421','00000000-0000-4000-8000-000000000101',
  'Business','keepit_only','Perpetual','Ready',2,1608,558,12,
  '{"selected":"keepit","comparison_id":"fictional-A","pricing_frozen":true}'::jsonb),
 ('00000000-0000-4000-8000-000000000524','Selected UseIT - Fictional','deal',
  '00000000-0000-4000-8000-000000000422','00000000-0000-4000-8000-000000000101',
  'Business','useit_only','SaaS','Ready',2,380,400,20,
  '{"selected":"useit","comparison_id":"fictional-B","pricing_frozen":true}'::jsonb);

UPDATE public.proposals SET parent_proposal_id = CASE id
 WHEN '00000000-0000-4000-8000-000000000523'::uuid
  THEN '00000000-0000-4000-8000-000000000521'::uuid
 WHEN '00000000-0000-4000-8000-000000000524'::uuid
  THEN '00000000-0000-4000-8000-000000000522'::uuid END
WHERE id IN ('00000000-0000-4000-8000-000000000523','00000000-0000-4000-8000-000000000524');

-- Store the same four actual priced KeepIT lines on COMPARISON and on its
-- separately frozen, selected KeepIT revision; using distinct item IDs.
INSERT INTO public.proposal_items
(id,proposal_id,item_name,category,line_type,qty,unit_price,frequency,
 is_recurring,gross_total,discount_amount,net_total,total,apply_discount_to_renewal,
 discount_type,discount_value,pricing_rule_code,sort_order)
SELECT
 ('00000000-0000-4000-8000-' || lpad((1500+row_number() OVER (ORDER BY p.id,x.sort_order))::text,12,'0'))::uuid,
 p.id, x.item_name,x.category,x.line_type,1,x.gross,x.frequency,
 x.recurring,x.gross,x.discount,x.gross-x.discount,x.gross-x.discount,
 x.renews,x.discount_type,x.discount_value,x.rule,x.sort_order
FROM (VALUES ('00000000-0000-4000-8000-000000000521'::uuid),
             ('00000000-0000-4000-8000-000000000523'::uuid)) p(id)
CROSS JOIN (VALUES
  ('Core License','software','license',1000::numeric,0::numeric,'one-time',false,false,'none',0::numeric,'KEEPIT_LICENSE',1),
  ('Web Access','software','mww_web',400,12,'annual',true,true,'percent',3,'BUS_WEB',2),
  ('S&TA','software','sat',170,0,'annual',true,true,'none',0,'SAT_GROSS',3),
  ('Implementation','services','implementation',50,0,'one-time',false,false,'none',0,'IMPLEMENTATION',4)
) x(item_name,category,line_type,gross,discount,frequency,recurring,renews,discount_type,discount_value,rule,sort_order);

-- A different *temporary* recurring Web discount on both the Compare
-- headline and the selected UseIT commercial proposal.
INSERT INTO public.proposal_items
(id,proposal_id,item_name,category,line_type,qty,unit_price,frequency,
 is_recurring,gross_total,discount_amount,net_total,total,apply_discount_to_renewal,
 discount_type,discount_value,pricing_rule_code,sort_order)
VALUES
 ('00000000-0000-4000-8000-000000000951','00000000-0000-4000-8000-000000000522',
  'UseIT Web Annual','software','license',1,400,'annual',true,400,20,380,380,false,
  'percent',5,'USEIT_ANNUAL',1),
 ('00000000-0000-4000-8000-000000000952','00000000-0000-4000-8000-000000000524',
  'UseIT Web Annual','software','license',1,400,'annual',true,400,20,380,380,false,
  'percent',5,'USEIT_ANNUAL',1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);

DO $fin02_choice$
DECLARE
 _keepit_license jsonb := '{"product_family":"Business","proposal_mode":"KeepIT",
   "license_type":"Business KeepIT","license_model":"Perpetual",
   "hosting":"On-Premise","initial_contract_value":1608,
   "recurring_contract_value":558,"modules":[]}'::jsonb;
 _useit_license jsonb := '{"product_family":"Business","proposal_mode":"UseIT",
   "license_type":"Business UseIT","license_model":"SaaS",
   "hosting":"SaaS","initial_contract_value":380,
   "recurring_contract_value":400,"modules":[]}'::jsonb;
 _keep_lines jsonb;
 _use_lines jsonb;
 _failed boolean;
 _keep jsonb;
 _use jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object(
  'source_item_id',i.id,'description',i.item_name,
  'amount',i.net_total,'billing_frequency',
  CASE WHEN i.is_recurring THEN 'annual' ELSE 'one-time' END,
  'line_type',i.line_type) ORDER BY i.sort_order)
 INTO _keep_lines
 FROM public.proposal_items i
 WHERE proposal_id='00000000-0000-4000-8000-000000000523';

 SELECT jsonb_agg(jsonb_build_object(
  'source_item_id',i.id,'description',i.item_name,
  'amount',i.net_total,'billing_frequency','annual','line_type',i.line_type))
 INTO _use_lines
 FROM public.proposal_items i
 WHERE proposal_id='00000000-0000-4000-8000-000000000524';

 _failed:=false;
 BEGIN
  PERFORM public.award_deal_proposal(
   '00000000-0000-4000-8000-000000000421',
   '00000000-0000-4000-8000-000000000521',
   NULL,_keepit_license,_keep_lines,'2026-11-01',90);
 EXCEPTION WHEN OTHERS THEN
  _failed:=SQLERRM LIKE 'FIN02_COMPARE_REQUIRES_FROZEN_SELECTED_OPTION%';
  IF NOT _failed THEN RAISE EXCEPTION 'FIN02_COMPARE_GUARD_ERROR: %',SQLERRM; END IF;
 END;
 IF NOT _failed OR EXISTS(SELECT 1 FROM public.clients
    WHERE source_deal_id='00000000-0000-4000-8000-000000000421')
 THEN RAISE EXCEPTION 'FIN02_COMPARE_DIRECT_AWARD_NOT_BLOCKED_AT_SERVER'; END IF;

 -- A correctly priced selected KeepIT proposal must reject a caller's
 -- attempt to choose UseIT at the AWARD dialog rather than in source revision.
 _failed:=false;
 BEGIN
  PERFORM public.award_deal_proposal(
   '00000000-0000-4000-8000-000000000421',
   '00000000-0000-4000-8000-000000000523',
   NULL,_useit_license || jsonb_build_object(
       'initial_contract_value',1608,'recurring_contract_value',558),
       _keep_lines,'2026-11-01',90);
 EXCEPTION WHEN OTHERS THEN
  _failed:=SQLERRM LIKE 'FIN02_AWARDED_OPTION_DIFFERS_FROM_SAVED_PROPOSAL%';
  IF NOT _failed THEN RAISE EXCEPTION 'FIN02_SELECTED_MODE_GUARD_ERROR: %',SQLERRM; END IF;
 END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_SELECTED_OPTION_CHANGED_IN_AWARD_DIALOG'; END IF;

 -- Valid selected KeepIT: Year 1 Web 400-12=388, discount RENEWS.
 _keep:=public.award_deal_proposal(
  '00000000-0000-4000-8000-000000000421',
  '00000000-0000-4000-8000-000000000523',
  NULL,_keepit_license,_keep_lines,'2026-11-01',90);

 -- Valid selected UseIT: Year 1 SaaS 400-20=380, discount EXPIRES.
 _use:=public.award_deal_proposal(
  '00000000-0000-4000-8000-000000000422',
  '00000000-0000-4000-8000-000000000524',
  NULL,_useit_license,_use_lines,'2026-11-01',90);
 IF _keep->>'already_awarded'<>'false' OR _use->>'already_awarded'<>'false'
 THEN RAISE EXCEPTION 'FIN02_SELECTED_OPTIONS_NOT_OPERATIONALIZED_ONCE'; END IF;

 -- Repeating either command must not add a second Client/License/Contract.
 IF (public.award_deal_proposal('00000000-0000-4000-8000-000000000421',
       '00000000-0000-4000-8000-000000000523',
       NULL,_keepit_license,_keep_lines,'2026-11-01',90)->>'already_awarded')<>'true'
 THEN RAISE EXCEPTION 'FIN02_SELECTED_OPTION_RETRY_NOT_IDEMPOTENT'; END IF;
END $fin02_choice$;
RESET ROLE;

DO $fin02_frozen$
DECLARE _keep_contract uuid; _use_contract uuid;
BEGIN
 SELECT l.contract_id INTO _keep_contract
 FROM public.licenses l WHERE l.deal_id='00000000-0000-4000-8000-000000000421' AND NOT l.is_draft;
 SELECT l.contract_id INTO _use_contract
 FROM public.licenses l WHERE l.deal_id='00000000-0000-4000-8000-000000000422' AND NOT l.is_draft;

 IF (SELECT count(*) FROM public.contract_lines
     WHERE contract_id=_keep_contract AND amount=388 AND renewal_amount=388
       AND pricing_snapshot->>'apply_discount_to_renewal'='true'
       AND (pricing_snapshot->>'first_period_gross')::numeric=400
       AND (pricing_snapshot->>'first_period_discount')::numeric=12)<>1
 OR (SELECT count(*) FROM public.contract_lines
     WHERE contract_id=_use_contract AND amount=380 AND renewal_amount=400
       AND pricing_snapshot->>'apply_discount_to_renewal'='false'
       AND (pricing_snapshot->>'first_period_gross')::numeric=400
       AND (pricing_snapshot->>'first_period_discount')::numeric=20)<>1
 THEN RAISE EXCEPTION 'FIN02_KEEPIT_USEIT_DISCOUNT_POLICY_NOT_FROZEN'; END IF;
 IF (SELECT count(*) FROM public.renewals r
   WHERE r.contract_id=_keep_contract AND estimated_value=558)<>1
 OR (SELECT count(*) FROM public.renewals r
   WHERE r.contract_id=_use_contract AND estimated_value=400)<>1
 THEN RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_NOT_SELECTED_RECURRING_VALUE'; END IF;

 IF NOT EXISTS(SELECT 1 FROM public.proposals
  WHERE id='00000000-0000-4000-8000-000000000521'
  AND status='Ready' AND proposal_mode='compare_keepit_useit'
  AND version=1 AND (business_config->>'selection_required')::boolean)
 OR NOT EXISTS(SELECT 1 FROM public.proposals
  WHERE id='00000000-0000-4000-8000-000000000522'
  AND status='Ready' AND proposal_mode='compare_keepit_useit'
  AND version=1 AND (business_config->>'selection_required')::boolean)
 OR NOT EXISTS(SELECT 1 FROM public.proposals
  WHERE id='00000000-0000-4000-8000-000000000523'
  AND status='Won' AND parent_proposal_id='00000000-0000-4000-8000-000000000521')
 OR NOT EXISTS(SELECT 1 FROM public.proposals
  WHERE id='00000000-0000-4000-8000-000000000524'
  AND status='Won' AND parent_proposal_id='00000000-0000-4000-8000-000000000522')
 THEN RAISE EXCEPTION 'FIN02_COMPARISON_AND_SELECTED_REVISION_HISTORY_LOST'; END IF;

 IF (SELECT count(*) FROM public.client_revenue_history
      WHERE revenue_type='initial_sale'
      AND client_id IN (SELECT client_id FROM public.deals
         WHERE id IN ('00000000-0000-4000-8000-000000000421',
                      '00000000-0000-4000-8000-000000000422')))<>2
 THEN RAISE EXCEPTION 'FIN02_SELECTED_OPTIONS_INITIAL_SALE_NOT_UNIQUE'; END IF;
 RAISE NOTICE 'FIN02 Gate5A ORIGINAL backend PASS: compare cannot award, selected KeepIT 388->388, UseIT 380->400, snapshots/first renewal/ledger/history/retry';
END $fin02_frozen$;

-- The complete selected-option fixtures above were real SQL writes
-- ONLY to the disposable lab transaction; remove them before future CI steps.
ROLLBACK;
SELECT 'FIN02 Gate5A PASS — all synthetic selected-option rows rolled back' AS result;
