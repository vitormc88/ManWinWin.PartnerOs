-- Gate3 original RPC successful Business award + source-level rollback.
-- Requires all synthetic TEST schemas/functions and explicit LAB-ONLY
-- initial-sale candidate trigger installed, not live TEST/PROD.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000003',true);

DO $bad_source_rolls_back$
DECLARE
  _failed boolean:=false;
  _license jsonb:='{"product_family":"Business","proposal_mode":"KeepIT",
      "license_type":"Business KeepIT","license_model":"Perpetual",
      "hosting":"On-Premise","initial_contract_value":1608,
      "recurring_contract_value":570}'::jsonb;
  _bad jsonb:='[
    {"source_item_id":"00000000-0000-4000-8000-000000000911","description":"Core License","amount":900,"billing_frequency":"one_time","line_type":"license"},
    {"source_item_id":"00000000-0000-4000-8000-000000000912","description":"Web Access","amount":488,"billing_frequency":"annual","line_type":"mww_web"},
    {"source_item_id":"00000000-0000-4000-8000-000000000913","description":"S&TA","amount":170,"billing_frequency":"annual","line_type":"sat"},
    {"source_item_id":"00000000-0000-4000-8000-000000000914","description":"Implementation","amount":50,"billing_frequency":"one_time","line_type":"implementation"}
  ]'::jsonb;
BEGIN
  BEGIN
    PERFORM public.award_deal_proposal(
      '00000000-0000-4000-8000-000000000411',
      '00000000-0000-4000-8000-000000000511',
      NULL,_license,_bad,'2026-11-01',90);
  EXCEPTION WHEN others THEN
    _failed := SQLERRM LIKE 'FIN02_CONTRACT_LINE_DIFFERS_FROM_PROPOSAL%';
    IF NOT _failed THEN RAISE EXCEPTION 'BAD_SOURCE_UNEXPECTED: %',SQLERRM; END IF;
  END;
  IF NOT _failed THEN RAISE EXCEPTION 'FIN02_BAD_SOURCE_AWARD_NOT_REJECTED'; END IF;
  IF EXISTS(SELECT 1 FROM public.clients WHERE source_deal_id='00000000-0000-4000-8000-000000000411')
     OR EXISTS(SELECT 1 FROM public.licenses WHERE deal_id='00000000-0000-4000-8000-000000000411')
     OR EXISTS(SELECT 1 FROM public.client_revenue_history WHERE source_reference='deal:00000000-0000-4000-8000-000000000411:initial_sale') THEN
    RAISE EXCEPTION 'FIN02_FAILED_AWARD_LEFT_ORPHANS_OR_REVENUE';
  END IF;
  RAISE NOTICE 'Gate3 bad award rejected after client creation; all intermediate operations rolled back';
END $bad_source_rolls_back$;

DO $successful_original_award$
DECLARE
  _license jsonb:='{"product_family":"Business","proposal_mode":"KeepIT",
      "license_type":"Business KeepIT","license_model":"Perpetual",
      "hosting":"On-Premise","initial_contract_value":1608,
      "recurring_contract_value":570,
      "included_backoffice":2,"additional_web":3,"modules":[]}'::jsonb;
  _lines jsonb:='[
    {"source_item_id":"00000000-0000-4000-8000-000000000911","description":"Core License","amount":1000,"billing_frequency":"one_time","line_type":"license"},
    {"source_item_id":"00000000-0000-4000-8000-000000000912","description":"Web Access","amount":388,"billing_frequency":"annual","line_type":"mww_web"},
    {"source_item_id":"00000000-0000-4000-8000-000000000913","description":"S&TA","amount":170,"billing_frequency":"annual","line_type":"sat"},
    {"source_item_id":"00000000-0000-4000-8000-000000000914","description":"Implementation","amount":50,"billing_frequency":"one_time","line_type":"implementation"}
  ]'::jsonb;
  _result jsonb;
  _again jsonb;
  _client uuid;
  _contract uuid;
  _license_id uuid;
  _renewal uuid;
  _line_count int;
  _sum numeric;
BEGIN
  _result:=public.award_deal_proposal(
    '00000000-0000-4000-8000-000000000411',
    '00000000-0000-4000-8000-000000000511',
    NULL,_license,_lines,'2026-11-01',90);
  IF _result->>'already_awarded' <> 'false' THEN
     RAISE EXCEPTION 'FIN02_SUCCESSFUL_AWARD_NOT_FIRST_EXECUTION: %',_result; END IF;
  _client:=(_result->>'client_id')::uuid;
  _contract:=(_result->>'contract_id')::uuid;
  _license_id:=(_result->>'license_id')::uuid;
  _renewal:=(_result->>'renewal_id')::uuid;
  IF _client IS NULL OR _contract IS NULL OR _license_id IS NULL OR _renewal IS NULL THEN
    RAISE EXCEPTION 'FIN02_AWARD_MISSING_FINANCIAL_OUTPUTS: %',_result; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.deals WHERE id='00000000-0000-4000-8000-000000000411'
    AND stage='Won' AND status='Won' AND client_id=_client AND total_value=1608
  ) OR NOT EXISTS (
    SELECT 1 FROM public.licenses WHERE id=_license_id AND contract_id=_contract
    AND client_id=_client AND initial_contract_value=1608
    AND recurring_contract_value=570 AND license_model='Perpetual'
  ) THEN RAISE EXCEPTION 'FIN02_DEAL_OR_LICENSE_AWARD_STATE_INVALID'; END IF;

  SELECT COUNT(*),SUM(amount) INTO _line_count,_sum FROM public.contract_lines
    WHERE contract_id=_contract;
  IF _line_count<>4 OR _sum<>1608
    OR (SELECT calculated_total FROM public.contracts WHERE id=_contract)<>1608 THEN
    RAISE EXCEPTION 'FIN02_AWARD_CONTRACT_TOTAL_RECONCILIATION_FAILED';
  END IF;
  IF (SELECT amount FROM public.contract_lines WHERE contract_id=_contract
      AND source_item_id='00000000-0000-4000-8000-000000000912')<>388
    OR (SELECT renewal_amount FROM public.contract_lines WHERE contract_id=_contract
      AND source_item_id='00000000-0000-4000-8000-000000000912')<>400
    OR (SELECT renewal_amount FROM public.contract_lines WHERE contract_id=_contract
      AND source_item_id='00000000-0000-4000-8000-000000000913')<>170
    OR (SELECT renewal_amount FROM public.contract_lines WHERE contract_id=_contract
      AND source_item_id='00000000-0000-4000-8000-000000000914')<>0 THEN
    RAISE EXCEPTION 'FIN02_AWARD_FIRST_YEAR_VS_NEXT_CYCLE_POLICY_FAILED';
  END IF;
  IF (SELECT COUNT(*) FROM public.client_revenue_history
      WHERE client_id=_client AND revenue_type='initial_sale'
      AND source_reference='deal:00000000-0000-4000-8000-000000000411:initial_sale'
      AND amount=1608)<>1 THEN
    RAISE EXCEPTION 'FIN02_INITIAL_SALE_MISSING_OR_DUPLICATED';
  END IF;
  IF (SELECT COUNT(*) FROM public.renewals
      WHERE id=_renewal AND contract_id=_contract
       AND estimated_value=570 AND status='Upcoming')<>1 THEN
    RAISE EXCEPTION 'FIN02_EXPECTED_570_RENEWAL_NOT_CREATED';
  END IF;
  IF (SELECT COUNT(*) FROM public.lifecycle_events
       WHERE client_id=_client AND event_type='proposal_won')<>1 THEN
    RAISE EXCEPTION 'FIN02_EXPECTED_AWARD_LIFECYCLE_EVENT_MISSING';
  END IF;
  _again:=public.award_deal_proposal(
    '00000000-0000-4000-8000-000000000411',
    '00000000-0000-4000-8000-000000000511',
    NULL,_license,_lines,'2026-11-01',90);
  IF _again->>'already_awarded'<>'true' THEN
    RAISE EXCEPTION 'FIN02_RETRY_AWARD_NOT_IDEMPOTENT: %',_again; END IF;
  IF (SELECT COUNT(*) FROM public.client_revenue_history
      WHERE client_id=_client AND revenue_type='initial_sale')<>1 OR
     (SELECT COUNT(*) FROM public.licenses WHERE deal_id='00000000-0000-4000-8000-000000000411')<>1 THEN
    RAISE EXCEPTION 'FIN02_RETRY_DUPLICATED_SALE_OR_LICENSE';
  END IF;
  RAISE NOTICE 'Gate3 original award and repeat PASS: €1608 Y1, €570 recurring, one initial_sale (LAB-ONLY candidate), 4 source-linked contract lines';
END $successful_original_award$;
COMMIT;
