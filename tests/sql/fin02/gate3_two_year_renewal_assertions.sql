-- Gate3 complete source-based first and second renewals.
-- Original TEST close_renewal_core and revenue trigger. Each period commits.
-- Test record IDs are wholly fictional and local to GitHub Actions.

-- FIRST RENEWAL: Web discount expires, recurring baseline €400 + S&TA €170.
INSERT INTO public.proposals
 (id,client_name,source_type,renewal_id,client_id,contract_id,license_id,
  partner_uuid,product_family,license_model,proposal_mode,status,version,
  total_year_1,total_recurring,discount_amount)
SELECT
 '00000000-0000-4000-8000-000000000512',
 'FIN02 Fictional Renewal 2027','renewal',r.id,r.client_id,r.contract_id,r.license_id,
 r.partner_uuid,'Business','Perpetual','keepit_only','Ready',1,570,570,0
FROM public.renewals r
JOIN public.deals d ON d.client_id=r.client_id
WHERE d.id='00000000-0000-4000-8000-000000000411'
 AND r.status='Upcoming' AND r.previous_renewal_id IS NULL;

INSERT INTO public.proposal_items
 (id,proposal_id,item_name,category,line_type,qty,unit_price,frequency,
 is_recurring,gross_total,discount_amount,net_total,total,apply_discount_to_renewal)
VALUES
 ('00000000-0000-4000-8000-000000000921',
  '00000000-0000-4000-8000-000000000512','Web Access',
  'software','mww_web',1,400,'annual',true,400,0,400,400,true),
 ('00000000-0000-4000-8000-000000000922',
  '00000000-0000-4000-8000-000000000512','S&TA',
  'software','sat',1,170,'annual',true,170,0,170,170,true);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $first$
DECLARE
  _r uuid;
  _client uuid;
  _res jsonb;
  _again jsonb;
  _next uuid;
  _snap jsonb;
BEGIN
 SELECT r.id,r.client_id INTO _r,_client FROM public.renewals r
 JOIN public.deals d ON d.client_id=r.client_id
 WHERE d.id='00000000-0000-4000-8000-000000000411'
 AND r.previous_renewal_id IS NULL;
 IF _r IS NULL THEN RAISE EXCEPTION 'GATE3_FIRST_RENEWAL_NOT_FOUND'; END IF;

 _res:=public.close_renewal_core(_r,'renewed',
    '00000000-0000-4000-8000-000000000512',
    'Gate3 first synthetic renewal',NULL,'2027-11-01',NULL);
 IF _res->>'already_closed' IS DISTINCT FROM 'false'
 OR (_res->>'renewed_recurring_value')::numeric <> 570
 OR (_res->>'previous_recurring_value')::numeric <> 570
 OR (_res->>'one_time_value')::numeric <> 0
 THEN RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_OUTPUT_WRONG: %',_res; END IF;
 _next:=(_res->>'next_renewal_id')::uuid;
 IF _next IS NULL THEN RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_NO_NEXT'; END IF;
 SELECT closure_snapshot INTO _snap FROM public.renewals WHERE id=_r;
 IF (_snap->'revenue'->>'total')::numeric<>570
 OR NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(_snap->'contract_lines') AS cl(obj)
   WHERE cl.obj->>'description'='Web Access'
   AND (cl.obj->>'amount')::numeric=388
   AND (cl.obj->>'renewal_amount')::numeric=400
 ) THEN RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_PREVIOUS_PRICE_SNAPSHOT_LOST'; END IF;

 IF (SELECT COUNT(*) FROM public.client_revenue_history WHERE client_id=_client
   AND revenue_type='renewal' AND renewal_id=_r AND amount=570)<>1
 OR (SELECT COUNT(*) FROM public.client_revenue_history WHERE client_id=_client
   AND revenue_type='implementation' AND renewal_id=_r)<>0 THEN
   RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_LEDGER_DUPLICATE_OR_ONE_TIME_LEAK';
 END IF;
 IF (SELECT COUNT(*) FROM public.renewals WHERE id=_next
     AND previous_renewal_id=_r AND estimated_value=570 AND renewal_date='2028-11-01')<>1
 THEN RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_NEXT_CYCLE_WRONG'; END IF;

 _again:=public.close_renewal_core(_r,'renewed',
    '00000000-0000-4000-8000-000000000512',
    'Idempotent retry',NULL,'2027-11-01',NULL);
 IF _again->>'already_closed'<>'true' THEN
   RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_RETRY_NOT_IDEMPOTENT: %',_again; END IF;
 IF (SELECT COUNT(*) FROM public.renewals WHERE previous_renewal_id=_r)<>1
 OR (SELECT COUNT(*) FROM public.client_revenue_history
     WHERE client_id=_client AND revenue_type='renewal' AND renewal_id=_r)<>1
 THEN RAISE EXCEPTION 'FIN02_FIRST_RENEWAL_RETRY_DOUBLE_BOOKED'; END IF;
 RAISE NOTICE 'Gate3 first renewal actual SQL PASS: €388 Year1 Web becomes €400, recurring €570, implementation €0, one ledger event and exactly one 2028 renewal';
END $first$;
COMMIT;

-- SECOND RENEWAL: preservation of €570 without reinstating temporary discount.
INSERT INTO public.proposals
 (id,client_name,source_type,renewal_id,client_id,contract_id,license_id,
 partner_uuid,product_family,license_model,proposal_mode,status,version,
 total_year_1,total_recurring,discount_amount)
SELECT '00000000-0000-4000-8000-000000000513',
 'FIN02 Fictional Renewal 2028','renewal',r.id,r.client_id,r.contract_id,r.license_id,
 r.partner_uuid,'Business','Perpetual','keepit_only','Ready',1,570,570,0
FROM public.renewals r JOIN public.deals d ON d.client_id=r.client_id
WHERE d.id='00000000-0000-4000-8000-000000000411'
 AND r.previous_renewal_id IS NOT NULL AND r.status='Upcoming';

INSERT INTO public.proposal_items
 (id,proposal_id,item_name,category,line_type,qty,unit_price,frequency,
 is_recurring,gross_total,discount_amount,net_total,total,apply_discount_to_renewal)
VALUES
 ('00000000-0000-4000-8000-000000000923',
  '00000000-0000-4000-8000-000000000513','Web Access',
  'software','mww_web',1,400,'annual',true,400,0,400,400,true),
 ('00000000-0000-4000-8000-000000000924',
  '00000000-0000-4000-8000-000000000513','S&TA',
  'software','sat',1,170,'annual',true,170,0,170,170,true);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $second$
DECLARE
 _r uuid;
 _client uuid;
 _res jsonb;
 _blocked boolean:=false;
 _count integer;
 _next uuid;
BEGIN
 SELECT r.id,r.client_id INTO _r,_client FROM public.renewals r
 JOIN public.deals d ON d.client_id=r.client_id
 WHERE d.id='00000000-0000-4000-8000-000000000411'
 AND r.previous_renewal_id IS NOT NULL AND r.status='Upcoming';
 IF _r IS NULL THEN RAISE EXCEPTION 'FIN02_SECOND_RENEWAL_NOT_FOUND'; END IF;

 -- Wrong-source proposal must fail atomically and leave renewal untouched.
 BEGIN
   PERFORM public.close_renewal_core(_r,'renewed',
      '00000000-0000-4000-8000-000000000512',
      'Bad source',NULL,'2028-11-01',NULL);
 EXCEPTION WHEN others THEN
   _blocked:=SQLERRM LIKE 'PROPOSAL_NOT_LINKED%';
   IF NOT _blocked THEN RAISE EXCEPTION 'FIN02_SECOND_BAD_SOURCE: %',SQLERRM; END IF;
 END;
 IF NOT _blocked OR EXISTS (SELECT 1 FROM public.renewals
   WHERE id=_r AND closed_at IS NOT NULL) THEN
   RAISE EXCEPTION 'FIN02_SECOND_WRONG_PROPOSAL_NOT_ROLLED_BACK'; END IF;

 _res:=public.close_renewal_core(_r,'renewed',
    '00000000-0000-4000-8000-000000000513',
    'Second Gate3 synthetic renewal',NULL,'2028-11-01',NULL);
 IF _res->>'already_closed'<>'false'
  OR (_res->>'previous_recurring_value')::numeric<>570
  OR (_res->>'renewed_recurring_value')::numeric<>570
  OR (_res->>'one_time_value')::numeric<>0 THEN
   RAISE EXCEPTION 'FIN02_SECOND_RENEWAL_TOTAL_WRONG: %',_res; END IF;
 _next:=(_res->>'next_renewal_id')::uuid;
 IF (SELECT COUNT(*) FROM public.renewals WHERE id=_next
  AND previous_renewal_id=_r AND renewal_date='2029-11-01' AND estimated_value=570)<>1
 THEN RAISE EXCEPTION 'FIN02_SECOND_NEXT_CYCLE_MISSING'; END IF;
 IF (SELECT COUNT(*) FROM public.client_revenue_history
  WHERE client_id=_client AND revenue_type='renewal' AND amount=570)<>2
 OR (SELECT COUNT(*) FROM public.client_revenue_history
  WHERE client_id=_client AND revenue_type='initial_sale' AND amount=1608)<>1
 OR (SELECT COUNT(*) FROM public.client_revenue_history
  WHERE client_id=_client AND revenue_type='implementation')<>0 THEN
  RAISE EXCEPTION 'FIN02_TWO_CYCLE_REVENUE_LEDGER_NOT_RECONCILED'; END IF;
 IF (SELECT COUNT(*) FROM public.lifecycle_events
  WHERE client_id=_client AND event_type='renewal_renewed')<>2 THEN
  RAISE EXCEPTION 'FIN02_TWO_RENEWAL_LIFECYCLE_EVENTS_MISSING'; END IF;
 SELECT COUNT(*) INTO _count FROM public.contract_lines
 WHERE contract_id=(SELECT contract_id FROM public.renewals WHERE id=_r)
   AND billing_frequency NOT IN ('one_time','one-time','once')
   AND amount=400 AND renewal_amount=400
   AND source_item_id='00000000-0000-4000-8000-000000000923';
 IF _count<>1 THEN RAISE EXCEPTION 'FIN02_DISCOUNT_WRONGLY_REAPPLIED_ON_SECOND_CYCLE'; END IF;
 RAISE NOTICE 'Gate3 second renewal actual SQL PASS: 2027/2028 recurring €570 each, initial €1608 once, one-time implementation not repeated, history and source preserved';
END $second$;
COMMIT;
