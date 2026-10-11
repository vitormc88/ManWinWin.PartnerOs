-- Gate3 late AFTER-WON failure injection on a second isolated synthetic deal.
-- Trigger sorts AFTER fin02_lab_deal_award_revenue so revenue has been
-- inserted before the deliberate exception; all must roll back together.
CREATE OR REPLACE FUNCTION public.fin02_lab_forced_late_failure()
RETURNS trigger LANGUAGE plpgsql AS $forced$
BEGIN
 IF NEW.id='00000000-0000-4000-8000-000000000413'
   AND NEW.status='Won' THEN
   RAISE EXCEPTION 'FIN02_FORCED_FAILURE_AFTER_FINAL_AWARD_AND_LEDGER';
 END IF;
 RETURN NEW;
END
$forced$;

CREATE TRIGGER zz_fin02_lab_forced_after_sale
AFTER UPDATE OF status ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.fin02_lab_forced_late_failure();

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000003',true);
DO $late_rollback$
DECLARE
 _blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.award_deal_proposal(
   '00000000-0000-4000-8000-000000000413',
   '00000000-0000-4000-8000-000000000515',
   NULL,
   '{"product_family":"Business","proposal_mode":"UseIT",
     "license_type":"Business UseIT","license_model":"SaaS",
     "hosting":"SaaS","initial_contract_value":200,
     "recurring_contract_value":200,"modules":[]}'::jsonb,
   '[{"source_item_id":"00000000-0000-4000-8000-000000000916",
      "description":"UseIT SaaS Annual","amount":200,
      "billing_frequency":"annual","line_type":"license"}]'::jsonb,
   '2026-11-01',90
  );
 EXCEPTION WHEN others THEN
  _blocked := SQLERRM LIKE 'FIN02_FORCED_FAILURE_AFTER_FINAL_AWARD_AND_LEDGER%';
  IF NOT _blocked THEN
    RAISE EXCEPTION 'FIN02_UNEXPECTED_LATE_FAILURE: %',SQLERRM;
  END IF;
 END;
 IF NOT _blocked THEN
  RAISE EXCEPTION 'FIN02_LATE_AFTER_LEDGER_FAILURE_NOT_PROPAGATED';
 END IF;
 IF EXISTS (SELECT 1 FROM public.clients
     WHERE source_deal_id='00000000-0000-4000-8000-000000000413')
   OR EXISTS (SELECT 1 FROM public.licenses
     WHERE deal_id='00000000-0000-4000-8000-000000000413')
   OR EXISTS (SELECT 1 FROM public.contracts
     WHERE source_proposal_id='00000000-0000-4000-8000-000000000515')
   OR EXISTS (SELECT 1 FROM public.proposals
     WHERE id='00000000-0000-4000-8000-000000000515' AND status='Won')
   OR EXISTS (SELECT 1 FROM public.client_revenue_history
     WHERE source_reference='deal:00000000-0000-4000-8000-000000000413:initial_sale')
   OR EXISTS (SELECT 1 FROM public.deals
     WHERE id='00000000-0000-4000-8000-000000000413' AND status='Won')
   OR EXISTS (SELECT 1 FROM public.lifecycle_events
     WHERE source_proposal_id='00000000-0000-4000-8000-000000000515')
 THEN RAISE EXCEPTION 'FIN02_PARTIAL_AWARD_SURVIVED_FORCED_LATE_ROLLBACK'; END IF;
 RAISE NOTICE 'Gate3 late-stage rollback PASS: after ledger trigger wrote sale, forced exception reverted client/license/contract/renewal/deal/proposal/event/ledger as one transaction';
END $late_rollback$;
COMMIT;
