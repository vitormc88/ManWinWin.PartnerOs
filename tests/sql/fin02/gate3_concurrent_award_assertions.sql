-- Gate3 assertions after two truly parallel PostgreSQL RPC connections.
DO $conc$
DECLARE
 c uuid;
BEGIN
 SELECT id INTO c FROM public.clients
  WHERE source_deal_id='00000000-0000-4000-8000-000000000412';
 IF c IS NULL THEN RAISE EXCEPTION 'FIN02_CONCURRENT_AWARD_NO_CLIENT'; END IF;
 IF (SELECT count(*) FROM public.clients
   WHERE source_deal_id='00000000-0000-4000-8000-000000000412')<>1 OR
 (SELECT count(*) FROM public.licenses
   WHERE deal_id='00000000-0000-4000-8000-000000000412')<>1 OR
 (SELECT count(*) FROM public.contracts
   WHERE source_proposal_id='00000000-0000-4000-8000-000000000514')<>1 OR
 (SELECT count(*) FROM public.contract_lines WHERE client_id=c)<>1 OR
 (SELECT count(*) FROM public.renewals WHERE client_id=c AND status='Upcoming')<>1 OR
 (SELECT count(*) FROM public.client_revenue_history
   WHERE client_id=c AND revenue_type='initial_sale' AND amount=200
   AND source_reference='deal:00000000-0000-4000-8000-000000000412:initial_sale')<>1 OR
 (SELECT count(*) FROM public.lifecycle_events
   WHERE client_id=c AND event_type='proposal_won')<>1 THEN
  RAISE EXCEPTION 'FIN02_CONCURRENT_AWARD_DUPLICATED_LIFECYCLE_OR_LEDGER';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.deals WHERE id='00000000-0000-4000-8000-000000000412'
    AND stage='Won' AND status='Won' AND client_id=c AND total_value=200
 ) THEN RAISE EXCEPTION 'FIN02_CONCURRENT_DEAL_FINAL_NOT_WON'; END IF;
 RAISE NOTICE 'Gate3 two simultaneous first-award SQL sessions PASS: one client/license/contract/line/renewal/initial_sale/event; no duplicate commit';
END
$conc$;
