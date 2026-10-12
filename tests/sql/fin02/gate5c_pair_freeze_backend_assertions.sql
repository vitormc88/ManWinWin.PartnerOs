-- FIN02 Gate5C: two alternative server-trusted price snapshots + selected
-- source-exact original award, negative role/tamper/stale/rollback tests.
-- Nothing here lives in TEST/PROD. Everything rolls back together.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL partneros.proposal_op='on';
INSERT INTO public.deals(id,partner_id,company_name,country,stage,status)
VALUES
 ('00000000-0000-4000-8000-000000000471','00000000-0000-4000-8000-000000000101','GATE5C Fictional Verified Options A','PT','Proposal','Open'),
 ('00000000-0000-4000-8000-000000000472','00000000-0000-4000-8000-000000000101','GATE5C Fictional Verified Options B','PT','Proposal','Open');

INSERT INTO public.proposals
(id,client_name,source_type,deal_id,partner_uuid,product_family,
 proposal_mode,license_model,status,version,total_year_1,total_recurring,
 discount_amount,parent_proposal_id,business_config)
VALUES
 ('00000000-0000-4000-8000-000000000571','G5C Fictional Compare A','deal',
 '00000000-0000-4000-8000-000000000471','00000000-0000-4000-8000-000000000101',
 'Business','compare_keepit_useit',NULL,'Ready',1,1608,558,12,NULL,'{"ui_mode":"compare"}'),
 ('00000000-0000-4000-8000-000000000572','G5C Fictional Selected KeepIT','deal',
 '00000000-0000-4000-8000-000000000471','00000000-0000-4000-8000-000000000101',
 'Business','keepit_only','Perpetual','Ready',2,1608,558,12,
 '00000000-0000-4000-8000-000000000571','{"selection":"keepit"}'),
 ('00000000-0000-4000-8000-000000000573','G5C Fictional Compare B','deal',
 '00000000-0000-4000-8000-000000000472','00000000-0000-4000-8000-000000000101',
 'Business','compare_keepit_useit',NULL,'Ready',1,1608,558,12,NULL,'{"ui_mode":"compare"}'),
 ('00000000-0000-4000-8000-000000000574','G5C Fictional Selected UseIT','deal',
 '00000000-0000-4000-8000-000000000472','00000000-0000-4000-8000-000000000101',
 'Business','useit_only','SaaS','Ready',2,380,400,20,
 '00000000-0000-4000-8000-000000000573','{"selection":"useit"}');

-- In LAB these catalog-validated, signed-off economic rows are deliberately
-- inserted under privileged postgres. This models but DOES NOT implement
-- original TEST server-side price rules or approval authorization.
INSERT INTO private.fin02_verified_quote_lines_lab
(comparison_id,option,sort_order,item_code,item_name,line_type,qty,
 unit_price,frequency,gross_total,discount_amount,net_total,
 recurring,discount_renews,pricing_rule_code,pricing_rule_version)
SELECT p.id,v.option,v.pos,v.code,v.label,v.line_type,1,v.gross,v.freq,
 v.gross,v.discount,v.gross-v.discount,v.recurring,v.renews,v.rule,1
FROM (VALUES ('00000000-0000-4000-8000-000000000571'::uuid),
             ('00000000-0000-4000-8000-000000000573'::uuid)) p(id)
CROSS JOIN (VALUES
 ('keepit',1,'CORE','Core License','license',1000::numeric,0::numeric,'one-time',false,false,'KEEPIT_CORE'),
 ('keepit',2,'WEB','Web Access','mww_web',400,12,'annual',true,true,'WEB_RULE'),
 ('keepit',3,'SAT','S&TA','sat',170,0,'annual',true,true,'SAT_GROSS_17'),
 ('keepit',4,'IMPL','Implementation','implementation',50,0,'one-time',false,false,'IMPL_RULE'),
 ('useit',1,'ANNUAL','UseIT Annual','license',400,20,'annual',true,false,'USEIT_ANNUAL')
) v(option,pos,code,label,line_type,gross,discount,freq,recurring,renews,rule);

-- Chosen independent, saved proposal_items. Distinct new source UUIDs,
-- intentionally not the comparison headline source item IDs.
INSERT INTO public.proposal_items(
 id,proposal_id,item_code,item_name,category,line_type,qty,unit_price,frequency,
 is_recurring,gross_total,discount_amount,net_total,total,apply_discount_to_renewal,
 pricing_rule_code,sort_order)
SELECT gen_random_uuid(),_p.id,_v.item_code,_v.item_name,'software',_v.line_type,
 _v.qty,_v.unit_price,_v.frequency,_v.recurring,_v.gross_total,
 _v.discount_amount,_v.net_total,_v.net_total,_v.discount_renews,
 _v.pricing_rule_code,_v.sort_order
FROM (VALUES
 ('00000000-0000-4000-8000-000000000572'::uuid,'00000000-0000-4000-8000-000000000571'::uuid,'keepit'),
 ('00000000-0000-4000-8000-000000000574'::uuid,'00000000-0000-4000-8000-000000000573'::uuid,'useit')
) _p(id,compare_id,option)
JOIN private.fin02_verified_quote_lines_lab _v ON
 _v.comparison_id=_p.compare_id AND _v.option=_p.option;

-- Deliberate missing-UseIT comparison, to prove atomic dual-option freeze
-- does not leave a partial KeepIT row after failing on the second option.
INSERT INTO public.deals(id,partner_id,company_name,country,stage,status)
VALUES('00000000-0000-4000-8000-000000000479',
'00000000-0000-4000-8000-000000000101','Fictitious Missing UseIT Quote','PT','Proposal','Open');
INSERT INTO public.proposals(id,client_name,source_type,deal_id,partner_uuid,product_family,
 proposal_mode,license_model,status,version,total_year_1,total_recurring,discount_amount)
VALUES('00000000-0000-4000-8000-000000000579','Fictitious Incomplete Comparison',
'deal','00000000-0000-4000-8000-000000000479',
'00000000-0000-4000-8000-000000000101','Business','compare_keepit_useit',
NULL,'Ready',1,1608,558,12);
INSERT INTO private.fin02_verified_quote_lines_lab(
comparison_id,option,sort_order,item_code,item_name,line_type,qty,unit_price,
frequency,gross_total,discount_amount,net_total,recurring,discount_renews,
pricing_rule_code,pricing_rule_version,approved_override_id)
SELECT '00000000-0000-4000-8000-000000000579',option,sort_order,item_code,item_name,
line_type,qty,unit_price,frequency,gross_total,discount_amount,net_total,recurring,
discount_renews,pricing_rule_code,pricing_rule_version,approved_override_id
FROM private.fin02_verified_quote_lines_lab
WHERE comparison_id='00000000-0000-4000-8000-000000000571' AND option='keepit';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
RESET ROLE;
-- Privileged lab diagnostics call internal helper; real callers use the award RPC.
DO $before_freeze$
DECLARE _failed boolean:=false;
BEGIN
 BEGIN
  PERFORM public.fin02_assert_frozen_chosen_lab('00000000-0000-4000-8000-000000000572');
 EXCEPTION WHEN check_violation THEN _failed:=SQLERRM LIKE 'FIN02_SELECTED_OPTION_NOT_FROZEN%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_PRE_FREEZE_AWARD_NOT_BLOCKED'; END IF;
END $before_freeze$;
SET LOCAL ROLE authenticated;

-- Wrong partner/actor cannot freeze. On partial price book (missing
-- UseIT), the already-written KeepIT snapshot must be rolled back.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000999',true);
DO $unauthorized$
DECLARE _denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.fin02_freeze_compared_options_lab('00000000-0000-4000-8000-000000000571');
 EXCEPTION WHEN insufficient_privilege THEN _denied:=true; END;
 IF NOT _denied THEN RAISE EXCEPTION 'FIN02_UNRELATED_ACTOR_COULD_FREEZE_PRICES'; END IF;
END $unauthorized$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $missing_second$
DECLARE _failed boolean:=false;
BEGIN
 BEGIN
  PERFORM public.fin02_freeze_compared_options_lab('00000000-0000-4000-8000-000000000579');
 EXCEPTION WHEN check_violation THEN
  _failed:=SQLERRM LIKE 'FIN02_VERIFIED_OPTION_INVALID_OR_MISSING_useit%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_MISSING_SECOND_ALTERNATIVE_WAS_FROZEN'; END IF;
END $missing_second$;
RESET ROLE;
DO $missing_pair_assert$
BEGIN
 IF EXISTS(SELECT 1 FROM private.fin02_frozen_option_lab
           WHERE comparison_id='00000000-0000-4000-8000-000000000579')
 THEN RAISE EXCEPTION 'FIN02_PARTIAL_KEEPIT_PAIR_COMMITTED_AFTER_USEIT_FAILURE'; END IF;
END $missing_pair_assert$;
SET LOCAL ROLE authenticated;

-- One authorized database call freezes BOTH alternatives at same Ready revision.
SELECT public.fin02_freeze_compared_options_lab('00000000-0000-4000-8000-000000000571');
SELECT public.fin02_freeze_compared_options_lab('00000000-0000-4000-8000-000000000573');
RESET ROLE;
DO $check_both$
DECLARE _again jsonb;
BEGIN
 _again:=public.fin02_freeze_compared_options_lab('00000000-0000-4000-8000-000000000571');
 IF (SELECT count(*) FROM private.fin02_frozen_option_lab
      WHERE comparison_id IN('00000000-0000-4000-8000-000000000571',
                             '00000000-0000-4000-8000-000000000573'))<>4
 OR (_again->>'keepit') IS NULL OR (_again->>'useit') IS NULL THEN
  RAISE EXCEPTION 'FIN02_FREEZE_BOTH_OPTIONS_NOT_ATOMIC_OR_IDEMPOTENT'; END IF;
END $check_both$;

-- Privileged synthetic catalog changes AFTER freeze must not rewrite frozen.
UPDATE private.fin02_verified_quote_lines_lab
 SET unit_price=999, gross_total=999,discount_amount=0,net_total=999
 WHERE comparison_id='00000000-0000-4000-8000-000000000571'
 AND option='keepit' AND item_code='WEB';
DO $immutability$
DECLARE _old text;_blocked boolean:=false;
BEGIN
 SELECT fingerprint INTO _old FROM private.fin02_frozen_option_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000571'
 AND option='keepit';
 BEGIN
  UPDATE private.fin02_frozen_option_lab SET year1=999
  WHERE comparison_id='00000000-0000-4000-8000-000000000571';
 EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
 IF NOT _blocked OR
 (SELECT fingerprint FROM private.fin02_frozen_option_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000571'
 AND option='keepit') IS DISTINCT FROM _old
 OR (SELECT year1 FROM private.fin02_frozen_option_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000571'
 AND option='keepit')<>1608 THEN
 RAISE EXCEPTION 'FIN02_FROZEN_VALUES_CHANGED_AFTER_CATALOG_DRIFT'; END IF;
END $immutability$;

-- An altered line but UNCHANGED proposal and contract TOTALS must be denied.
-- Changing label and synchronously changing contract text would pass the
-- old per-line award validation; frozen source fixes this risk.
-- Internal helper intentionally has NO direct authenticated EXECUTE.
-- Privileged fixture tests call it directly; award below tests real actor.
DO $tamper$
DECLARE
 _item uuid;_old text;_failed boolean:=false;
BEGIN
 SELECT id,item_name INTO _item,_old FROM public.proposal_items
 WHERE proposal_id='00000000-0000-4000-8000-000000000572'
 AND item_code='WEB';
 UPDATE public.proposal_items SET item_name='Altered but same amount'
 WHERE id=_item;
 BEGIN
  PERFORM public.fin02_assert_frozen_chosen_lab('00000000-0000-4000-8000-000000000572');
 EXCEPTION WHEN check_violation THEN
   _failed:=SQLERRM LIKE 'FIN02_SELECTED_LINES_DIFFER_FROM_FROZEN_OPTION%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_SELECTED_FROZEN_NAME_SWAP_ACCEPTED'; END IF;
 UPDATE public.proposal_items SET item_name=_old WHERE id=_item;

 -- Caller cannot bypass comparison lock by removing parent_proposal_id.
 UPDATE public.proposals SET parent_proposal_id=NULL
 WHERE id='00000000-0000-4000-8000-000000000572';
 _failed:=false;
 BEGIN
  PERFORM public.fin02_assert_frozen_chosen_lab('00000000-0000-4000-8000-000000000572');
 EXCEPTION WHEN check_violation THEN
   _failed:=SQLERRM LIKE 'FIN02_SELECTED_COMPARE_PARENT_REQUIRED%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_PARENT_NULL_BYPASSED_COMPARISON'; END IF;
 UPDATE public.proposals SET parent_proposal_id='00000000-0000-4000-8000-000000000571'
 WHERE id='00000000-0000-4000-8000-000000000572';
 PERFORM public.fin02_assert_frozen_chosen_lab('00000000-0000-4000-8000-000000000572');
 PERFORM public.fin02_assert_frozen_chosen_lab('00000000-0000-4000-8000-000000000574');
END $tamper$;
SET LOCAL ROLE authenticated;

-- Original REAL RPC now has the new backend freeze assertion injected, in
-- addition to actual license option and FIN02 net/gross source validation.
DO $award_both$
DECLARE
 _license_keep jsonb:='{"product_family":"Business","proposal_mode":"KeepIT",
 "license_type":"Business KeepIT","license_model":"Perpetual","hosting":"On-Premise",
 "initial_contract_value":1608,"recurring_contract_value":558}'::jsonb;
 _license_use jsonb:='{"product_family":"Business","proposal_mode":"UseIT",
 "license_type":"Business UseIT","license_model":"SaaS","hosting":"SaaS",
 "initial_contract_value":380,"recurring_contract_value":400}'::jsonb;
 _keep_lines jsonb;_use_lines jsonb;_out jsonb;_replay jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object(
 'source_item_id',id,'description',item_name,'amount',net_total,
 'billing_frequency',CASE WHEN is_recurring THEN 'annual' ELSE 'one-time' END,
 'line_type',line_type) ORDER BY sort_order)
 INTO _keep_lines FROM public.proposal_items
 WHERE proposal_id='00000000-0000-4000-8000-000000000572';
 SELECT jsonb_agg(jsonb_build_object(
 'source_item_id',id,'description',item_name,'amount',net_total,
 'billing_frequency','annual','line_type',line_type))
 INTO _use_lines FROM public.proposal_items
 WHERE proposal_id='00000000-0000-4000-8000-000000000574';

 _out:=public.award_deal_proposal('00000000-0000-4000-8000-000000000471',
  '00000000-0000-4000-8000-000000000572',NULL,
  _license_keep,_keep_lines,'2026-11-01',90);
 IF _out->>'already_awarded' IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'FIN02_FROZEN_KEEPIT_AWARD_FAILED'; END IF;

 _out:=public.award_deal_proposal('00000000-0000-4000-8000-000000000472',
  '00000000-0000-4000-8000-000000000574',NULL,
  _license_use,_use_lines,'2026-11-01',90);
 IF _out->>'already_awarded' IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'FIN02_FROZEN_USEIT_AWARD_FAILED'; END IF;
 _replay:=public.award_deal_proposal('00000000-0000-4000-8000-000000000471',
  '00000000-0000-4000-8000-000000000572',NULL,
  _license_keep,_keep_lines,'2026-11-01',90);
 IF _replay->>'already_awarded' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'FIN02_SELECTED_AWARD_RETRY_FAILED'; END IF;
END $award_both$;
RESET ROLE;

DO $outcome$
DECLARE _keep_ct uuid;_use_ct uuid;
BEGIN
 SELECT contract_id INTO _keep_ct FROM public.licenses
 WHERE deal_id='00000000-0000-4000-8000-000000000471' AND NOT is_draft;
 SELECT contract_id INTO _use_ct FROM public.licenses
 WHERE deal_id='00000000-0000-4000-8000-000000000472' AND NOT is_draft;
 IF _keep_ct IS NULL OR _use_ct IS NULL
 OR (SELECT count(*) FROM public.contract_lines
 WHERE contract_id=_keep_ct AND amount=388 AND renewal_amount=388)<>1
 OR (SELECT count(*) FROM public.contract_lines
 WHERE contract_id=_use_ct AND amount=380 AND renewal_amount=400)<>1
 OR (SELECT count(*) FROM public.renewals
 WHERE contract_id=_keep_ct AND estimated_value=558)<>1
 OR (SELECT count(*) FROM public.renewals
 WHERE contract_id=_use_ct AND estimated_value=400)<>1
 OR (SELECT count(*) FROM public.client_revenue_history
 WHERE revenue_type='initial_sale' AND client_id IN
  (SELECT client_id FROM public.deals
   WHERE id IN('00000000-0000-4000-8000-000000000471','00000000-0000-4000-8000-000000000472')))<>2
 OR (SELECT count(*) FROM public.proposals
 WHERE id IN('00000000-0000-4000-8000-000000000571','00000000-0000-4000-8000-000000000573')
 AND proposal_mode='compare_keepit_useit' AND status='Ready')<>2
 THEN RAISE EXCEPTION 'FIN02_FROZEN_MODE_TO_CONTRACT_LEDGER_INTEGRATION_FAILED'; END IF;
 RAISE NOTICE 'Gate5C real award RPC + frozen pair PASS: trusted pair, immutable prices, catalog drift, tamper/parent bypass blocked, KeepIT 388->388, UseIT 380->400, one initial revenue each.';
END $outcome$;

-- No persistent extra finance rows for the later original Gate3 rollback tests.
ROLLBACK;
SELECT 'Gate5C PASS — all fictional freezes/proposals/contracts/revenue reverted' AS result;
