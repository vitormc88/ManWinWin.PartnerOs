-- Commercial award revenue, not invoice/payment recognition.
-- Patch both existing renewal writers while preserving their closure safeguards.
DO $$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('renewal_closure_record_revenue','renewal_revenue_backfill') LOOP
  definition := pg_get_functiondef(f.oid);
  definition := replace(definition, 'coalesce(NEW.renewal_effective_date, NEW.renewal_date, current_date)', '(NEW.closed_at AT TIME ZONE ''Europe/Lisbon'')::date');
  definition := replace(definition, 'coalesce(r.renewal_effective_date, r.renewal_date, r.closed_at::date)', '(r.closed_at AT TIME ZONE ''Europe/Lisbon'')::date');
  definition := replace(definition, 'value billed when', 'value awarded when');
  EXECUTE definition;
 END LOOP;
END $$;

-- The existing updated-at trigger requires the missing audit column.
ALTER TABLE public.client_revenue_history ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.client_revenue_history h
SET revenue_date=(r.closed_at AT TIME ZONE 'Europe/Lisbon')::date,
 notes=replace(h.notes,'value billed when','value awarded when')
FROM public.renewals r WHERE h.renewal_id=r.id AND h.source='renewal_closure'
AND r.outcome='renewed' AND r.closed_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_initial_sale_deal_unique
 ON public.client_revenue_history(source_deal_id)
 WHERE source_deal_id IS NOT NULL AND revenue_type='initial_sale';

CREATE OR REPLACE FUNCTION public.deal_award_record_revenue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE amount_to_record numeric; award_date date; partner uuid; currency_to_record text;
BEGIN
 IF NEW.status IS DISTINCT FROM 'Won' OR NEW.client_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status='Won' AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id THEN RETURN NEW; END IF;
 END IF;
 amount_to_record := coalesce(nullif(NEW.total_value,0),NEW.expected_value,0);
 IF amount_to_record<=0 OR NEW.won_at IS NULL THEN
  RAISE EXCEPTION 'A linked Won deal requires a positive Year 1 value and award date';
 END IF;
 award_date := (NEW.won_at AT TIME ZONE 'Europe/Lisbon')::date;
 SELECT c.partner_uuid INTO partner FROM public.clients c WHERE c.id=NEW.client_id;
 SELECT coalesce(ct.currency,'EUR') INTO currency_to_record FROM public.contracts ct
 WHERE ct.client_id=NEW.client_id ORDER BY ct.created_at DESC LIMIT 1;
 -- Linking an old imported award must not create a second entry.
 IF EXISTS (SELECT 1 FROM public.client_revenue_history h WHERE h.client_id=NEW.client_id
  AND h.revenue_type='initial_sale' AND (h.source_deal_id=NEW.id OR
    (h.source_deal_id IS NULL AND h.revenue_date=award_date AND round(h.amount,2)=round(amount_to_record,2)))) THEN RETURN NEW; END IF;
 INSERT INTO public.client_revenue_history(client_id,partner_id,source_deal_id,revenue_type,amount,currency,revenue_date,source,source_reference,notes)
 VALUES(NEW.client_id,partner,NEW.id,'initial_sale',amount_to_record,coalesce(currency_to_record,'EUR'),award_date,
 'deal_award','deal:'||NEW.id::text||':initial_sale','Year 1 commercial award including recurring and one-time services; not an invoice or payment.')
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.deal_award_record_revenue() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_deal_award_record_revenue AFTER INSERT OR UPDATE OF status,client_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.deal_award_record_revenue();

-- Backfill only where no imported initial sale can already represent the award.
-- Accept the configured licence amount only within 1 EUR of the original deal.
INSERT INTO public.client_revenue_history(client_id,partner_id,source_deal_id,revenue_type,amount,currency,revenue_date,source,source_reference,notes)
SELECT d.client_id,c.partner_uuid,d.id,'initial_sale',
 CASE WHEN l.initial_contract_value>0 AND abs(l.initial_contract_value-coalesce(nullif(d.total_value,0),d.expected_value))<1
 THEN l.initial_contract_value ELSE coalesce(nullif(d.total_value,0),d.expected_value) END,
 'EUR',(d.won_at AT TIME ZONE 'Europe/Lisbon')::date,'deal_award','deal:'||d.id::text||':initial_sale',
 'Reconciled historical Year 1 award; clients with an existing initial sale were preserved to avoid duplicate revenue.'
FROM public.deals d JOIN public.clients c ON c.id=d.client_id
LEFT JOIN LATERAL (SELECT initial_contract_value FROM public.licenses WHERE client_id=c.id ORDER BY created_at DESC LIMIT 1) l ON true
WHERE d.status='Won' AND d.won_at IS NOT NULL AND coalesce(nullif(d.total_value,0),d.expected_value)>0
AND NOT EXISTS (SELECT 1 FROM public.client_revenue_history h WHERE h.client_id=d.client_id AND h.revenue_type='initial_sale')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.v_client_revenue_summary WITH (security_invoker=true) AS
SELECT coalesce(sum(amount),0) AS lifetime_revenue,
 coalesce(sum(amount) FILTER(WHERE revenue_date>=date_trunc('year',current_date)::date AND revenue_date<=current_date),0) AS revenue_ytd,
 count(*) AS revenue_entry_count,count(DISTINCT client_id) AS clients_with_revenue,
 coalesce(sum(amount) FILTER(WHERE revenue_date>=date_trunc('year',current_date)::date AND revenue_date<=current_date AND revenue_type='initial_sale' AND renewal_id IS NULL),0) AS nb_ytd,
 coalesce(sum(amount) FILTER(WHERE revenue_date>=date_trunc('year',current_date)::date AND revenue_date<=current_date AND (renewal_id IS NOT NULL OR revenue_type='renewal')),0) AS renewals_ytd,
 coalesce(sum(amount) FILTER(WHERE revenue_date>=date_trunc('year',current_date)::date AND revenue_date<=current_date AND revenue_type NOT IN ('initial_sale','renewal') AND renewal_id IS NULL),0) AS other_ytd
FROM public.client_revenue_history;

CREATE OR REPLACE VIEW public.v_analytics_revenue_summary WITH (security_invoker=true) AS
SELECT lifetime_revenue::numeric(14,2),revenue_ytd::numeric(14,2),revenue_entry_count::integer,clients_with_revenue::integer,
 nb_ytd::numeric(14,2),renewals_ytd::numeric(14,2),other_ytd::numeric(14,2)
FROM public.v_client_revenue_summary;

-- Retain compatibility column names while aligning the partner scorecard cutoff.
DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_viewdef('public.v_analytics_partner_summary'::regclass,true);
 definition := replace(definition,
  'date_part(''year''::text, h.revenue_date) = date_part(''year''::text, CURRENT_DATE)',
  'date_part(''year''::text, h.revenue_date) = date_part(''year''::text, CURRENT_DATE) AND h.revenue_date <= CURRENT_DATE');
 EXECUTE 'CREATE OR REPLACE VIEW public.v_analytics_partner_summary WITH (security_invoker=true) AS ' || definition;
END $$;
