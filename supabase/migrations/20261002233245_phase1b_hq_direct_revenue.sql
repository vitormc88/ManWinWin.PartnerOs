-- Phase 1b HQ Direct revenue migration for the production schema.
-- Preflight refuses unexpected schema or function drift.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='clients'
       AND column_name='is_hq_direct'
  ) THEN
    RAISE EXCEPTION 'PHASE1B_ALREADY_PRESENT: review before rerunning';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='client_revenue_history'
       AND column_name='partner_id' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'UNEXPECTED_REVENUE_SCHEMA: partner_id is not NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_revenue_history WHERE partner_id IS NULL) THEN
    RAISE EXCEPTION 'UNEXPECTED_NULL_PARTNER_REVENUE: investigate before rollout';
  END IF;
  IF md5(pg_get_functiondef(
       'public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer)'::regprocedure
     )) <> '1378fed27046f50394e62175ee3cf915' THEN
    RAISE EXCEPTION 'AWARD_FUNCTION_DRIFT: re-review the HQ Direct creation path';
  END IF;
  IF md5(pg_get_functiondef(
       'public.renewal_closure_record_revenue()'::regprocedure
     )) <> 'a5b0d2139033d591bae619f36aa10adc' THEN
    RAISE EXCEPTION 'REVENUE_CLOSURE_FUNCTION_DRIFT: re-review the recording path';
  END IF;
END;
$preflight$;

ALTER TABLE public.clients
  ADD COLUMN is_hq_direct boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clients.is_hq_direct IS
  'Explicit HQ Direct classification. A client with this flag has no partner; only its revenue may have a NULL partner_id.';
ALTER TABLE public.clients
  ADD CONSTRAINT clients_hq_direct_no_partner
  CHECK (NOT is_hq_direct OR (partner_uuid IS NULL AND partner_id IS NULL));

CREATE FUNCTION public.phase1b_guard_client_hq_direct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  _deal_partner text;
BEGIN
  -- The atomic award function creates the client with source_deal_id. Mark
  -- HQ Direct only when that deal has no partner, never from a blank import.
  IF TG_OP = 'INSERT' AND NEW.source_deal_id IS NOT NULL
     AND NEW.partner_uuid IS NULL AND NEW.partner_id IS NULL
     AND NOT NEW.is_hq_direct THEN
    SELECT d.partner_id INTO _deal_partner
      FROM public.deals d WHERE d.id = NEW.source_deal_id;
    IF FOUND AND _deal_partner IS NULL THEN
      NEW.is_hq_direct := true;
    END IF;
  END IF;

  -- A client with booked HQ revenue cannot silently become a partner client.
  IF TG_OP = 'UPDATE' AND OLD.is_hq_direct AND NOT NEW.is_hq_direct
     AND EXISTS (
       SELECT 1 FROM public.client_revenue_history h
        WHERE h.client_id = OLD.id AND h.partner_id IS NULL
     ) THEN
    RAISE EXCEPTION 'HQ_DIRECT_REVENUE_EXISTS: reclassification requires an explicit revenue migration';
  END IF;

  IF NEW.is_hq_direct AND (NEW.partner_uuid IS NOT NULL OR NEW.partner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'HQ_DIRECT_HAS_PARTNER';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER phase1b_guard_client_hq_direct
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.phase1b_guard_client_hq_direct();

CREATE FUNCTION public.phase1b_guard_revenue_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  _hq_direct boolean;
BEGIN
  -- FOR SHARE serializes a revenue write with a concurrent client
  -- reclassification, preserving the invariant across both transactions.
  SELECT c.is_hq_direct INTO _hq_direct
    FROM public.clients c WHERE c.id = NEW.client_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVENUE_CLIENT_NOT_FOUND';
  END IF;
  IF NEW.partner_id IS NULL AND NOT _hq_direct THEN
    RAISE EXCEPTION 'PARTNER_REQUIRED_FOR_NON_HQ_REVENUE';
  END IF;
  IF NEW.partner_id IS NOT NULL AND _hq_direct THEN
    RAISE EXCEPTION 'HQ_DIRECT_REVENUE_MUST_NOT_HAVE_PARTNER';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER phase1b_guard_revenue_partner
BEFORE INSERT OR UPDATE ON public.client_revenue_history
FOR EACH ROW EXECUTE FUNCTION public.phase1b_guard_revenue_partner();

-- The guard is installed in the same transaction before NULL becomes legal.
ALTER TABLE public.client_revenue_history
  ALTER COLUMN partner_id DROP NOT NULL;

-- Booked partner provenance is the revenue row, not today's client owner.
CREATE OR REPLACE VIEW public.v_revenue_history_enriched AS
SELECT h.id, h.client_id, h.partner_id AS partner_uuid,
       CASE WHEN h.partner_id IS NULL THEN 'HQ Direct'
            ELSE pt.company_name END AS partner_name,
       public.normalize_country(c.country) AS country,
       h.amount, h.currency, h.revenue_type, h.revenue_date,
       h.source, h.source_reference
  FROM public.client_revenue_history h
  JOIN public.clients c ON c.id = h.client_id
  LEFT JOIN public.partners pt ON pt.id = h.partner_id;
ALTER VIEW public.v_revenue_history_enriched SET (security_invoker = true);

-- Existing inner join omits all HQ Direct revenue from this SQL report.
CREATE OR REPLACE VIEW public.v_analytics_historical_revenue_by_partner AS
SELECT r.partner_id,
       CASE WHEN r.partner_id IS NULL THEN 'HQ Direct'
            ELSE p.company_name END AS company_name,
       coalesce(sum(r.amount), 0)::numeric(14,2) AS lifetime_revenue,
       coalesce(sum(r.amount) FILTER (
         WHERE extract(year FROM r.revenue_date) = extract(year FROM current_date)
       ), 0)::numeric(14,2) AS revenue_ytd,
       count(r.id)::integer AS revenue_entry_count
  FROM public.client_revenue_history r
  LEFT JOIN public.partners p ON p.id = r.partner_id
 GROUP BY r.partner_id, p.company_name;
ALTER VIEW public.v_analytics_historical_revenue_by_partner SET (security_invoker = true);

-- Internal trigger functions are not application RPCs.
REVOKE ALL ON FUNCTION public.phase1b_guard_client_hq_direct() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1b_guard_revenue_partner() FROM PUBLIC;
