-- FIN02 Gate5D: trusted synthetic price-book, actor discount limits and
-- original award integration. All commercial rows ROLLBACK at end.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL partneros.proposal_op='on';
-- This is a MOCK subset of ACTUAL pricing_rules columns; never read prices
-- from a client. Immutable catalog version only exists in this LAB.
INSERT INTO private.fin02_gate5d_catalog_lab
 (code,option,item_code,item_name,line_type,category,unit_price,frequency,
  recurring,discount_channel,sort_order)
VALUES
 ('BUS_KEEPIT_CORE','keepit','CORE','Core License','license','software',1000,'one-time',false,'softwarePct',1),
 ('BUS_WEB_USER','keepit','WEB','Web Access','mww_web','web',400,'annual',true,'webUsersPct',2),
 ('BUS_KEEPIT_SAT','keepit','SAT','S&TA gross base 17%','sat','sat',17,'annual',true,NULL,3),
 ('BUS_IMPLEMENT','keepit','IMPL','Implementation','implementation','services',50,'one-time',false,'servicesPct',4),
 ('BUS_USEIT_ANNUAL','useit','ANNUAL','UseIT annual','license','software',400,'annual',true,'softwarePct',1);
UPDATE public.partners SET partnership_level='Reseller'
 WHERE id='00000000-0000-4000-8000-000000000101';
UPDATE public.partners SET partnership_level='Implementer'
 WHERE id='00000000-0000-4000-8000-000000000102';

INSERT INTO public.deals(id,partner_id,company_name,country,stage,status)
VALUES
 ('00000000-0000-4000-8000-000000000481','00000000-0000-4000-8000-000000000101',
  'G5D Approved Synthetic Prices','PT','Proposal','Open'),
 ('00000000-0000-4000-8000-000000000482','00000000-0000-4000-8000-000000000101',
  'G5D Unauthorized 15%','PT','Proposal','Open'),
 ('00000000-0000-4000-8000-000000000483','00000000-0000-4000-8000-000000000101',
  'G5D Explicit Zero Override','PT','Proposal','Open');
INSERT INTO public.proposals(id,client_name,source_type,deal_id,partner_uuid,
 product_family,proposal_mode,status,version,business_config)
VALUES
 ('00000000-0000-4000-8000-000000000581','G5D Trusted Pair','deal',
  '00000000-0000-4000-8000-000000000481','00000000-0000-4000-8000-000000000101',
  'Business','compare_keepit_useit','Ready',1,
  '{"discounts":{"softwarePct":5,"webUsersPct":3,"webUsersRenews":true,"apiPct":0,"servicesPct":0}}'),
 ('00000000-0000-4000-8000-000000000582','G5D Forbidden Partner 15%','deal',
  '00000000-0000-4000-8000-000000000482','00000000-0000-4000-8000-000000000101',
  'Business','compare_keepit_useit','Ready',1,
  '{"discounts":{"softwarePct":15,"webUsersPct":3,"webUsersRenews":true,"servicesPct":0}}'),
 ('00000000-0000-4000-8000-000000000583','G5D Explicit Zero','deal',
  '00000000-0000-4000-8000-000000000483','00000000-0000-4000-8000-000000000101',
  'Business','compare_keepit_useit','Ready',1,
  '{"discounts":{"softwarePct":5,"webUsersPct":0,"webUsersRenews":false,"servicesPct":0}}');

-- Assert policy matrix (actual profile table + role enum fixture, fake actors).
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $policy$
DECLARE _sw numeric;_sv numeric;
BEGIN
 SELECT software_limit,services_limit INTO _sw,_sv
 FROM private.fin02_gate5d_limits_lab();
 IF _sw<>10 OR _sv<>10 THEN RAISE EXCEPTION 'FIN02_RESELLER_NOT_10_10'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
 SELECT software_limit,services_limit INTO _sw,_sv FROM private.fin02_gate5d_limits_lab();
 IF _sw<>10 OR _sv<>100 THEN RAISE EXCEPTION 'FIN02_IMPLEMENTER_NOT_10_100'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 SELECT software_limit,services_limit INTO _sw,_sv FROM private.fin02_gate5d_limits_lab();
 IF _sw<>100 OR _sv<>100 THEN RAISE EXCEPTION 'FIN02_CONFIRMED_HQ_NOT_100_100'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
END $policy$;
INSERT INTO private.fin02_gate5d_partner_overrides_lab
 (partner_id,software_limit,services_limit)
VALUES('00000000-0000-4000-8000-000000000101',0,NULL);
DO $override$
DECLARE _sw numeric;_sv numeric;
BEGIN
 SELECT software_limit,services_limit INTO _sw,_sv FROM private.fin02_gate5d_limits_lab();
 IF _sw<>0 OR _sv<>10 THEN RAISE EXCEPTION 'FIN02_EXPLICIT_ZERO_OVERRIDE_WAS_IGNORED'; END IF;
END $override$;
DELETE FROM private.fin02_gate5d_partner_overrides_lab
 WHERE partner_id='00000000-0000-4000-8000-000000000101';

SET LOCAL ROLE authenticated;
DO $negative$
DECLARE _failed boolean;
BEGIN
 _failed:=false;
 BEGIN
  PERFORM public.fin02_authorize_and_freeze_lab('00000000-0000-4000-8000-000000000582');
 EXCEPTION WHEN insufficient_privilege THEN
  _failed:=SQLERRM LIKE 'FIN02_AUTHORITY_DISCOUNT_EXCEEDS_ROLE_CAP%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_RESELLER_15_PCT_NOT_BLOCKED'; END IF;
 _failed:=false;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
 BEGIN
  PERFORM public.fin02_authorize_and_freeze_lab('00000000-0000-4000-8000-000000000581');
 EXCEPTION WHEN insufficient_privilege THEN
  _failed:=SQLERRM LIKE 'FIN02_AUTHORITY_PROPOSAL_OR_ROLE_DENIED%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_OTHER_PARTNER_FROZE_QUOTE'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
END $negative$;
RESET ROLE;
DO $assert_none$
BEGIN
 IF EXISTS(SELECT 1 FROM private.fin02_frozen_option_lab
  WHERE comparison_id IN('00000000-0000-4000-8000-000000000582',
                         '00000000-0000-4000-8000-000000000583'))
 OR EXISTS(SELECT 1 FROM private.fin02_verified_quote_lines_lab
  WHERE comparison_id='00000000-0000-4000-8000-000000000582')
 THEN RAISE EXCEPTION 'FIN02_REJECTED_REQUEST_CREATED_ARTIFACT'; END IF;
END $assert_none$;
INSERT INTO private.fin02_gate5d_partner_overrides_lab
 (partner_id,software_limit,services_limit)
VALUES('00000000-0000-4000-8000-000000000101',0,NULL);
SET LOCAL ROLE authenticated;
DO $zero$
DECLARE _failed boolean:=false;
BEGIN
 BEGIN
  PERFORM public.fin02_authorize_and_freeze_lab('00000000-0000-4000-8000-000000000583');
 EXCEPTION WHEN insufficient_privilege THEN
  _failed:=SQLERRM LIKE 'FIN02_AUTHORITY_DISCOUNT_EXCEEDS_ROLE_CAP%'; END;
 IF NOT _failed THEN RAISE EXCEPTION 'FIN02_EXPLICIT_ZERO_DISCOUNT_OVERRIDE_BYPASSED'; END IF;
END $zero$;
RESET ROLE;
DELETE FROM private.fin02_gate5d_partner_overrides_lab
 WHERE partner_id='00000000-0000-4000-8000-000000000101';

-- Authoritative server-priced operation, not browser pre-filled line arrays.
SET LOCAL ROLE authenticated;
SELECT public.fin02_authorize_and_freeze_lab('00000000-0000-4000-8000-000000000581');
RESET ROLE;
DO $frozen$
DECLARE _keep private.fin02_frozen_option_lab%ROWTYPE;
 _use private.fin02_frozen_option_lab%ROWTYPE;
BEGIN
 SELECT * INTO _keep FROM private.fin02_frozen_option_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000581' AND option='keepit';
 SELECT * INTO _use FROM private.fin02_frozen_option_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000581' AND option='useit';
 IF _keep.year1<>1558 OR _keep.renewal<>558 OR _keep.total_discount<>62
 OR _use.year1<>380 OR _use.renewal<>400 OR _use.total_discount<>20
 OR NOT EXISTS(SELECT 1 FROM private.fin02_verified_quote_lines_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000581'
  AND option='keepit' AND item_code='SAT' AND gross_total=170
  AND discount_amount=0 AND net_total=170)
 OR NOT EXISTS(SELECT 1 FROM private.fin02_verified_quote_lines_lab
 WHERE comparison_id='00000000-0000-4000-8000-000000000581'
  AND option='keepit' AND item_code='WEB' AND gross_total=400
  AND discount_amount=12 AND net_total=388 AND discount_renews)
 THEN RAISE EXCEPTION 'FIN02_AUTHORITY_CATALOG_OR_DISCOUNT_DERIVATION_BAD'; END IF;
END $frozen$;

-- Editing a mutable pricing rule AFTER freeze must not re-price either option.
UPDATE private.fin02_gate5d_catalog_lab SET unit_price=900,
 rule_version=2 WHERE code='BUS_USEIT_ANNUAL';
SET LOCAL ROLE authenticated;
SELECT public.fin02_authorize_and_freeze_lab('00000000-0000-4000-8000-000000000581');
RESET ROLE;
DO $check_idempotent$
BEGIN
 IF (SELECT year1 FROM private.fin02_frozen_option_lab
  WHERE comparison_id='00000000-0000-4000-8000-000000000581'
   AND option='useit')<>380
 THEN RAISE EXCEPTION 'FIN02_AUTHORIZED_FREEZE_RECALCULATED_AFTER_CATALOG_DRIFT'; END IF;
END $check_idempotent$;

-- Create a selected priced commercial revision from VERIFIED SERVER SOURCE,
-- not from the browser, then call original award SQL RPC.
INSERT INTO public.proposals(id,client_name,source_type,deal_id,partner_uuid,
 product_family,proposal_mode,license_model,status,version,
 total_year_1,total_recurring,discount_amount,parent_proposal_id)
SELECT '00000000-0000-4000-8000-000000000584',
 'G5D Selected From Server Price Source',c.source_type,c.deal_id,c.partner_uuid,
 'Business','keepit_only','Perpetual','Ready',c.version+1,
 f.year1,f.renewal,f.total_discount,c.id
FROM public.proposals c JOIN private.fin02_frozen_option_lab f
 ON f.comparison_id=c.id AND f.option='keepit'
WHERE c.id='00000000-0000-4000-8000-000000000581';
INSERT INTO public.proposal_items(
 id,proposal_id,item_code,item_name,category,line_type,qty,unit_price,
 frequency,is_recurring,gross_total,discount_amount,net_total,total,
 apply_discount_to_renewal,pricing_rule_code,sort_order)
SELECT gen_random_uuid(),'00000000-0000-4000-8000-000000000584',
  q.item_code,q.item_name,
  CASE WHEN q.item_code='IMPL' THEN 'service' ELSE 'software' END,
  q.line_type,q.qty,q.unit_price,q.frequency,q.recurring,q.gross_total,
  q.discount_amount,q.net_total,q.net_total,q.discount_renews,
  q.pricing_rule_code,q.sort_order
FROM private.fin02_verified_quote_lines_lab q
WHERE q.comparison_id='00000000-0000-4000-8000-000000000581'
 AND q.option='keepit';

SET LOCAL ROLE authenticated;
DO $award$
DECLARE _license jsonb:='{"product_family":"Business","proposal_mode":"KeepIT",
 "license_type":"Business KeepIT","license_model":"Perpetual",
 "hosting":"On-Premise","initial_contract_value":1558,
 "recurring_contract_value":558,"modules":[]}'::jsonb;
 _lines jsonb;_res jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object(
 'source_item_id',id,'description',item_name,'amount',net_total,
 'billing_frequency',CASE WHEN is_recurring THEN 'annual' ELSE 'one-time' END,
 'line_type',line_type) ORDER BY sort_order) INTO _lines
 FROM public.proposal_items
 WHERE proposal_id='00000000-0000-4000-8000-000000000584';
 _res:=public.award_deal_proposal(
 '00000000-0000-4000-8000-000000000481',
 '00000000-0000-4000-8000-000000000584',
 NULL,_license,_lines,'2026-11-01',90);
 IF _res->>'already_awarded' IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'FIN02_AUTHORIZED_CATALOG_TO_AWARD_FAILED'; END IF;
END $award$;
RESET ROLE;
DO $outcome$
DECLARE _contract uuid;
BEGIN
 SELECT contract_id INTO _contract FROM public.licenses
 WHERE deal_id='00000000-0000-4000-8000-000000000481' AND NOT is_draft;
 IF _contract IS NULL OR
 (SELECT count(*) FROM public.renewals WHERE contract_id=_contract
 AND estimated_value=558)<>1 OR
 (SELECT count(*) FROM public.client_revenue_history
  WHERE revenue_type='initial_sale'
  AND client_id=(SELECT client_id FROM public.deals
   WHERE id='00000000-0000-4000-8000-000000000481'))<>1
 THEN RAISE EXCEPTION 'FIN02_AUTHORIZED_SOURCE_TO_CONTRACT_LEDGER_MISMATCH'; END IF;
 RAISE NOTICE 'Gate5D PASS - trusted catalog 1000/400/17 percent SAT/50, partner 10/10, implementer 10/100, HQ 100/100, override zero, frozen options 1558->558 and 380->400, original real award and unique first sale';
END $outcome$;

ROLLBACK;
SELECT 'Gate5D PASS — zero persisted test source/quote/contract rows' AS result;
