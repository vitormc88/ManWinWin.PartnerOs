-- FIN02 Gate3 lab-only candidate initial-sale ledger trigger for TEST shape.
-- TEST lacks the PROD initial-sale trigger and also has no
-- client_revenue_history.source_deal_id column. This is NOT an approved
-- production migration: only exercise in disposable CI before design signoff.
CREATE OR REPLACE FUNCTION public.fin02_lab_initial_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public AS $initial$
DECLARE
  _value numeric;
  _at date;
  _partner uuid;
  _currency text;
  _ref text := 'deal:' || NEW.id::text || ':initial_sale';
BEGIN
 IF NEW.status IS DISTINCT FROM 'Won' OR NEW.client_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.status = 'Won'
    AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id THEN RETURN NEW; END IF;
 _value := coalesce(nullif(NEW.total_value,0), NEW.expected_value,0);
 IF _value <= 0 OR coalesce(NEW.won_at,NEW.stage_entered_at) IS NULL THEN
  RAISE EXCEPTION 'FIN02_LAB_AWARDED_DEAL_REQUIRES_POSITIVE_YEAR1_AND_DATE';
 END IF;
 _at := (coalesce(NEW.won_at,NEW.stage_entered_at)
         AT TIME ZONE 'Europe/Lisbon')::date;
 SELECT c.partner_uuid INTO _partner FROM public.clients c WHERE c.id=NEW.client_id;
 SELECT coalesce(ct.currency,'EUR') INTO _currency FROM public.contracts ct
 WHERE ct.client_id=NEW.client_id ORDER BY ct.created_at DESC LIMIT 1;
 IF EXISTS (
   SELECT 1 FROM public.client_revenue_history h
   WHERE h.client_id=NEW.client_id AND h.revenue_type='initial_sale'
     AND (h.source_reference=_ref OR (
       h.source_reference IS NULL AND h.revenue_date=_at
       AND round(h.amount,2)=round(_value,2)))
 ) THEN RETURN NEW; END IF;
 INSERT INTO public.client_revenue_history
  (client_id,partner_id,revenue_type,amount,currency,revenue_date,
   source,source_reference,notes)
 VALUES (NEW.client_id,_partner,'initial_sale',_value,coalesce(_currency,'EUR'),
   _at,'deal_award',_ref,
   'First-year award including one-time and recurring; not an invoice')
 ON CONFLICT (client_id,source_reference) DO NOTHING;
 RETURN NEW;
END
$initial$;

CREATE TRIGGER fin02_lab_deal_award_revenue
AFTER UPDATE OF status, client_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.fin02_lab_initial_sale();

-- Original TEST renewal ledger trigger and contract totals hooks.
CREATE TRIGGER trg_renewal_closure_record_revenue
 BEFORE UPDATE ON public.renewals
 FOR EACH ROW
 WHEN (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
 EXECUTE FUNCTION public.renewal_closure_record_revenue();
CREATE TRIGGER trg_contract_lines_refresh_total
 AFTER INSERT OR DELETE OR UPDATE ON public.contract_lines
 FOR EACH ROW EXECUTE FUNCTION public.contract_lines_refresh_total();
CREATE TRIGGER trg_contracts_refresh_total
 AFTER INSERT OR UPDATE OF manual_adjustment_amount ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.contracts_refresh_total();
