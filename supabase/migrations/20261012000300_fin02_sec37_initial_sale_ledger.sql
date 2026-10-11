-- FIN02 R1 FIN-ledger / Issue #37. REVIEW-ONLY TEST-targeted migration.
-- This writes a COMMERCIAL INITIAL SALE EVENT on a coherent atomic award,
-- NOT an invoice/payment/cash receipt. No historical backfill.
-- PROD schema differs (source_deal_id); do NOT apply there.
-- Deployment to live TEST REQUIRES separate explicit user approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $fin02_preflight$
DECLARE required_name text;
BEGIN
  FOREACH required_name IN ARRAY ARRAY[
    'source_reference','client_id','partner_id','proposal_id','contract_id',
    'revenue_type','revenue_date','source','amount','currency'
  ] LOOP
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='client_revenue_history'
        AND column_name=required_name) THEN
      RAISE EXCEPTION 'FIN02_SEC37_UNSUPPORTED_REVENUE_COLUMN: %',required_name;
    END IF;
  END LOOP;
  -- PROD has a different ledger schema and its own initial-sale trigger.
  -- Block installation on that shape even if the repository is later merged.
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='client_revenue_history'
        AND column_name='source_deal_id')
    OR EXISTS (SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.deals'::regclass
        AND t.tgname='zz_deal_award_record_revenue' AND NOT t.tgisinternal)
  THEN RAISE EXCEPTION 'FIN02_SEC37_PROD_SCHEMA_OR_EXISTING_LEDGER_TRIGGER_NO_GO'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
    WHERE rel.oid='public.client_revenue_history'::regclass
      AND con.conname='client_revenue_history_client_source_reference_key'
      AND con.contype='u'
  ) THEN RAISE EXCEPTION 'FIN02_SEC37_UNIQUE_SOURCE_CONSTRAINT_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.deals'::regclass
    AND t.tgname='fin02_initial_sale_on_won' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'FIN02_SEC37_ALREADY_INSTALLED'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin02_record_initial_sale') THEN
    RAISE EXCEPTION 'FIN02_SEC37_FUNCTION_NAME_COLLISION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.client_revenue_history'::regclass
    AND t.tgname='phase1b_guard_revenue_partner') THEN
    RAISE EXCEPTION 'FIN02_SEC37_MISSING_PARTNER_GUARD'; END IF;
END $fin02_preflight$;

CREATE FUNCTION public.fin02_record_initial_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fin02_initial$
DECLARE
  v_client public.clients%ROWTYPE;
  v_proposal uuid;
  v_contract uuid;
  v_currency text;
  v_amount numeric;
  v_source text := 'deal:'||NEW.id::text||':initial_sale';
  v_day date;
  v_matches integer;
  v_prior public.client_revenue_history%ROWTYPE;
BEGIN
  IF NEW.status IS DISTINCT FROM 'Won'
    OR NEW.stage IS DISTINCT FROM 'Won'
    OR NEW.client_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'Won'
    AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id THEN RETURN NEW; END IF;

  -- Only a real Deal -> Client conversion; do not reclassify generic
  -- manually-Won Deals or imports as new financial awards.
  SELECT * INTO v_client FROM public.clients c
    WHERE c.id=NEW.client_id AND c.source_deal_id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_amount := round(NEW.total_value,2);
  IF v_amount IS NULL OR v_amount<=0 OR NEW.won_at IS NULL THEN
    RAISE EXCEPTION 'FIN02_SEC37_INVALID_AWARD_VALUE_OR_WON_DATE';
  END IF;
  v_day := (NEW.won_at AT TIME ZONE 'Europe/Lisbon')::date;

  -- Reference the one proposal, its real contract and the linked license.
  SELECT p.id, ct.id, coalesce(ct.currency,'EUR'), count(*) OVER ()
    INTO v_proposal,v_contract,v_currency,v_matches
  FROM public.proposals p
  JOIN public.contracts ct ON ct.source_proposal_id=p.id AND ct.client_id=v_client.id
  JOIN public.licenses l ON l.contract_id=ct.id
    AND l.client_id=v_client.id AND l.deal_id=NEW.id
  WHERE p.deal_id=NEW.id AND p.source_type='deal'
    AND p.product_family IN ('Business','Professional','Express')
    AND p.status IN ('Ready','Won')
    AND round(coalesce(p.total_year_1,0),2)=v_amount
  ORDER BY ct.created_at DESC LIMIT 1;
  IF v_proposal IS NULL OR v_matches<>1 THEN
    RAISE EXCEPTION 'FIN02_SEC37_AWARD_ORIGINAL_SOURCE_NOT_UNIQUE_OR_RECONCILED';
  END IF;
  IF (SELECT round(coalesce(sum(cl.amount),0),2) FROM public.contract_lines cl
       WHERE cl.contract_id=v_contract)<>v_amount THEN
    RAISE EXCEPTION 'FIN02_SEC37_CONTRACT_LINES_NOT_RECONCILED';
  END IF;
  IF v_client.is_hq_direct AND v_client.partner_uuid IS NOT NULL
     OR NOT v_client.is_hq_direct AND v_client.partner_uuid IS NULL THEN
    RAISE EXCEPTION 'FIN02_SEC37_PARTNER_OWNERSHIP_UNRESOLVED';
  END IF;

  -- Historic imported, unlinked source events must be manually reconciled.
  -- Do not silently treat a same-date/same-amount movement as this award,
  -- nor create an indistinguishable duplicate automatically.
  IF EXISTS (
    SELECT 1 FROM public.client_revenue_history h WHERE h.client_id=v_client.id
       AND h.revenue_type='initial_sale' AND h.source_reference IS NULL
       AND h.revenue_date=v_day AND round(h.amount,2)=v_amount
  ) THEN RAISE EXCEPTION 'FIN02_SEC37_AMBIGUOUS_LEGACY_INITIAL_SALE'; END IF;

  INSERT INTO public.client_revenue_history (
    client_id,partner_id,proposal_id,contract_id,revenue_type,
    amount,currency,revenue_date,source,source_reference,notes
  ) VALUES (
    v_client.id,v_client.partner_uuid,v_proposal,v_contract,'initial_sale',
    v_amount,v_currency,v_day,'deal_award',v_source,
    'Commercial first-year award: not invoice, payment or cash receipt'
  )
  ON CONFLICT ON CONSTRAINT client_revenue_history_client_source_reference_key
  DO NOTHING;

  SELECT * INTO v_prior FROM public.client_revenue_history
    WHERE client_id=v_client.id AND source_reference=v_source;
  IF NOT FOUND OR v_prior.revenue_type<>'initial_sale'
      OR round(v_prior.amount,2)<>v_amount
      OR v_prior.partner_id IS DISTINCT FROM v_client.partner_uuid
      OR v_prior.contract_id IS DISTINCT FROM v_contract
      OR v_prior.proposal_id IS DISTINCT FROM v_proposal
      OR v_prior.currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'FIN02_SEC37_DUPLICATE_SOURCE_CONFLICT_OR_LEDGER_MISMATCH';
  END IF;
  RETURN NEW;
END
$fin02_initial$;
REVOKE ALL ON FUNCTION public.fin02_record_initial_sale() FROM PUBLIC;

CREATE TRIGGER fin02_initial_sale_on_won AFTER UPDATE OF status, client_id
ON public.deals FOR EACH ROW
EXECUTE FUNCTION public.fin02_record_initial_sale();
COMMIT;
