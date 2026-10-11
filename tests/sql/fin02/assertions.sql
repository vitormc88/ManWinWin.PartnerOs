-- FIN-02 disposable database SQL assertions; exits nonzero on ANY failure.
-- All IDs are synthetic and fixed; no actual PartnerOS customer data.
INSERT INTO public.proposals
(id, product_family, proposal_mode, version, total_year_1, total_recurring, discount_amount)
VALUES ('00000000-0000-4000-8000-000000000001','Business','keepit_only',2,683864.20,403811,30896.80);

INSERT INTO public.proposal_items
(id,proposal_id,item_code,item_name,pricing_rule_code,qty,unit_price,frequency,
 gross_total,discount_amount,net_total,discount_type,discount_value,
 is_recurring,apply_discount_to_renewal)
VALUES
('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001',
 'SOFTWARE','KeepIT software','BUS_KEEPIT_SOFTWARE',1,251300,'one-time',
 251300,20104,231196,'percent',8,false,false),
('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001',
 'WEB','Web/App','BUS_WEB_MOBILE_USER',1499,20,'per-user-month',
 359760,10792.80,348967.20,'percent',3,true,false),
('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001',
 'API','API ManWinWin','BUS_API',1,600,'yearly',
 600,0,600,'none',0,true,false),
('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000001',
 'SAT','S&AT KeepIT','BUS_KEEPIT_SAT',1,43451,'yearly',
 43451,0,43451,'none',0,true,false),
('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000001',
 'IMPLEMENTATION','Implementation','BUS_IMPL',1,59650,'one-time',
 59650,0,59650,'none',0,false,false);

DO $fin02_sql_tests$
DECLARE
  _p uuid := '00000000-0000-4000-8000-000000000001';
  _contract uuid := '00000000-0000-4000-8000-000000000201';
  _client uuid := '00000000-0000-4000-8000-000000000301';
  _web uuid := '00000000-0000-4000-8000-000000000102';
  _license jsonb := '{"proposal_mode":"KeepIT","initial_contract_value":683864.20,"recurring_contract_value":403811}'::jsonb;
  _lines jsonb;
  _bad jsonb;
  _blocked boolean;
  _before numeric;
  _after numeric;
  _future numeric;
  _baseline jsonb;
  _snap jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'source_item_id',id,'description',item_name,'amount',net_total,
    'billing_frequency',CASE WHEN is_recurring THEN 'Annual' ELSE 'One-time' END
  ) ORDER BY item_code) INTO _lines FROM public.proposal_items WHERE proposal_id=_p;
  -- Valid five-line offer should pass both helper and patched RPC.
  PERFORM public.fin02_assert_business_award(_p,_license,_lines);
  PERFORM public.award_deal_proposal(
   '00000000-0000-4000-8000-000000000401', _p, NULL, _license, _lines, current_date, 90);

  -- Swap amounts between two lines: total unchanged but policy violated.
  SELECT jsonb_agg(jsonb_build_object(
    'source_item_id',id,'description',item_name,
    'amount',net_total + CASE WHEN item_code='WEB' THEN 100
                             WHEN item_code='SOFTWARE' THEN -100 ELSE 0 END,
    'billing_frequency',CASE WHEN is_recurring THEN 'Annual' ELSE 'One-time' END
  ) ORDER BY item_code) INTO _bad FROM public.proposal_items WHERE proposal_id=_p;
  _blocked := false;
  BEGIN
    PERFORM public.award_deal_proposal(
      '00000000-0000-4000-8000-000000000401',_p,NULL,_license,_bad,current_date,90);
  EXCEPTION WHEN others THEN
    _blocked := SQLERRM LIKE 'FIN02_CONTRACT_LINE_DIFFERS_FROM_PROPOSAL%';
    IF NOT _blocked THEN RAISE; END IF;
  END;
  IF NOT _blocked THEN RAISE EXCEPTION 'FAILED: swapped contract lines incorrectly accepted'; END IF;

  -- Missing source reference must not pass.
  _blocked := false;
  BEGIN
    PERFORM public.fin02_assert_business_award(_p,_license,_lines - 0);
  EXCEPTION WHEN others THEN
    _blocked := SQLERRM LIKE 'FIN02_CONTRACT_LINE_COUNT_MISMATCH%'
      OR SQLERRM LIKE 'FIN02_MISSING_OR_DUPLICATE_SOURCE_ITEM%';
    IF NOT _blocked THEN RAISE; END IF;
  END;
  IF NOT _blocked THEN RAISE EXCEPTION 'FAILED: missing contract line accepted'; END IF;

  -- Materialize all five sourced contract rows via trigger.
  INSERT INTO public.contract_lines
  (contract_id,client_id,source,source_item_id,amount,description,line_type,billing_frequency)
  SELECT _contract,_client,'proposal',id,net_total,item_name,
    CASE WHEN item_code='SAT' THEN 'sat'
         WHEN item_code='WEB' THEN 'mww_web'
         WHEN item_code='API' THEN 'module'
         WHEN item_code='IMPLEMENTATION' THEN 'implementation'
         ELSE 'license' END,
    CASE WHEN is_recurring THEN 'Annual' ELSE 'One-time' END
  FROM public.proposal_items WHERE proposal_id=_p;

  SELECT renewal_amount, pricing_snapshot INTO _future, _snap
    FROM public.contract_lines WHERE source_item_id=_web;
  IF _future <> 359760 OR (_snap->>'first_period_net')::numeric <> 348967.2 OR
     _snap->>'apply_discount_to_renewal' <> 'false' THEN
    RAISE EXCEPTION 'FAILED: expiring Web discount snapshot wrong: % / %', _future, _snap;
  END IF;
  IF (SELECT renewal_amount FROM public.contract_lines
      WHERE source_item_id='00000000-0000-4000-8000-000000000101') <> 0 THEN
    RAISE EXCEPTION 'FAILED: one-time license leaked into renewal';
  END IF;
  SELECT sum(amount) INTO _before FROM public.contract_lines WHERE contract_id=_contract;
  SELECT sum(renewal_amount) FILTER
    (WHERE billing_frequency='Annual') INTO _after
    FROM public.contract_lines WHERE contract_id=_contract;
  IF _before <> 683864.20 OR _after <> 403811 THEN
    RAISE EXCEPTION 'FAILED: first period % and next cycle %',_before,_after;
  END IF;
  SELECT public.close_renewal_core(
     '00000000-0000-4000-8000-000000000501','renewed',_p)
    INTO _baseline;
  IF (_baseline->>'previous_recurring')::numeric <> 403811 OR
     (_baseline->>'next_cycle')::numeric <> 403811 OR
     (_baseline->>'historical_one_time')::numeric <> 290846 THEN
    RAISE EXCEPTION 'FAILED: core future pricing and historical one-time split: %',_baseline;
  END IF;

  -- An expiring 3% promotion versus a continuing 3% promotion: same Year1,
  -- different next cycle; no extra catalogue price lookup.
  UPDATE public.proposal_items SET apply_discount_to_renewal=true WHERE id=_web;
  UPDATE public.proposals SET total_recurring=393018.20 WHERE id=_p;
  _license := jsonb_set(_license,'{recurring_contract_value}','393018.2'::jsonb);
  PERFORM public.fin02_assert_business_award(_p,_license,_lines);
  UPDATE public.contract_lines SET amount=amount WHERE source_item_id=_web;
  SELECT renewal_amount INTO _future FROM public.contract_lines WHERE source_item_id=_web;
  IF _future <> 348967.20 THEN
    RAISE EXCEPTION 'FAILED: continuing Web discount not retained %',_future;
  END IF;
  SELECT public.close_renewal_core(
    '00000000-0000-4000-8000-000000000501','renewed',_p)
    INTO _baseline;
  IF (_baseline->>'next_cycle')::numeric <> 393018.2 THEN
    RAISE EXCEPTION 'FAILED: continuing discount changed recurrence: %',_baseline;
  END IF;

  -- Legacy rows stay NULL on both new columns, preserving their old amount.
  INSERT INTO public.contract_lines
  (contract_id,client_id,source,source_item_id,amount,description,line_type,billing_frequency)
  VALUES ('00000000-0000-4000-8000-000000000205',_client,'legacy',NULL,700,
          'Old recurring', 'module','Annual');
  IF (SELECT renewal_amount IS NOT NULL OR pricing_snapshot IS NOT NULL
      FROM public.contract_lines WHERE contract_id='00000000-0000-4000-8000-000000000205') THEN
    RAISE EXCEPTION 'FAILED: legacy rows were modified';
  END IF;

  -- Comparison is not silently transformed to one mode at award.
  UPDATE public.proposals SET proposal_mode='compare_keepit_useit' WHERE id=_p;
  _blocked := false;
  BEGIN
    PERFORM public.fin02_assert_business_award(_p,_license,_lines);
  EXCEPTION WHEN others THEN
    _blocked := SQLERRM LIKE 'FIN02_COMPARE_REQUIRES_FROZEN_SELECTED_OPTION%';
    IF NOT _blocked THEN RAISE; END IF;
  END;
  IF NOT _blocked THEN RAISE EXCEPTION 'FAILED: comparison award not blocked'; END IF;
  RAISE NOTICE 'FIN02 disposable PostgreSQL tests OK: source guard, swapped/missing lines, snapshot, Year1, renewals, legacy, compare';
END
$fin02_sql_tests$;

-- Verify security attributes and that no direct SQL grants to authenticated
-- were silently introduced by the new helper functions.
DO $fin02_permission_tests$
BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
       ('fin02_assert_business_award','fin02_capture_contract_line_policy')
      AND (p.prosecdef OR has_function_privilege('anon',p.oid,'EXECUTE')
           OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
 ) THEN RAISE EXCEPTION 'FAILED: FIN02 helper permissions broadened'; END IF;
 IF (SELECT NOT p.prosecdef
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.proname='award_deal_proposal' AND n.nspname='public') THEN
    RAISE EXCEPTION 'FAILED: legacy award definer changed'; END IF;
END
$fin02_permission_tests$;
