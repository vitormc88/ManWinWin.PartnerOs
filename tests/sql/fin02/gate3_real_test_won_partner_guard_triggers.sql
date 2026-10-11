-- FIN02 Gate3 exact additional TEST ownership and Won date triggers.
-- Read-only metadata from TEST, no client/customer or authorization records.
-- LAB ONLY; no TEST/PROD DDL.

CREATE OR REPLACE FUNCTION public.deals_track_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := now();
    IF NEW.status = 'Won' AND NEW.won_at IS NULL THEN NEW.won_at := now(); END IF;
    IF NEW.status = 'Lost' AND NEW.lost_at IS NULL THEN NEW.lost_at := now(); END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    IF NEW.status = 'Won' THEN NEW.won_at := COALESCE(NEW.won_at, now()); END IF;
    IF NEW.status = 'Lost' THEN NEW.lost_at := COALESCE(NEW.lost_at, now()); END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1b_guard_client_hq_direct()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _deal_partner text;
BEGIN
  -- The atomic award function creates a client from a deal. Set the explicit
  -- flag at that controlled entry point; do not infer HQ Direct for imports.
  IF TG_OP = 'INSERT' AND NEW.source_deal_id IS NOT NULL
     AND NEW.partner_uuid IS NULL AND NEW.partner_id IS NULL
     AND NOT NEW.is_hq_direct THEN
    SELECT d.partner_id INTO _deal_partner
      FROM public.deals d WHERE d.id = NEW.source_deal_id;
    IF FOUND AND _deal_partner IS NULL THEN
      NEW.is_hq_direct := true;
    END IF;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.phase1b_guard_revenue_partner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _hq_direct boolean;
BEGIN
  SELECT c.is_hq_direct INTO _hq_direct
    FROM public.clients c WHERE c.id = NEW.client_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVENUE_CLIENT_NOT_FOUND'; END IF;
  IF NEW.partner_id IS NULL AND NOT _hq_direct THEN
    RAISE EXCEPTION 'PARTNER_REQUIRED_FOR_NON_HQ_REVENUE';
  END IF;
  IF NEW.partner_id IS NOT NULL AND _hq_direct THEN
    RAISE EXCEPTION 'HQ_DIRECT_REVENUE_MUST_NOT_HAVE_PARTNER';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_deals_track_status_change
 BEFORE INSERT OR UPDATE ON public.deals
 FOR EACH ROW EXECUTE FUNCTION public.deals_track_status_change();
CREATE TRIGGER phase1b_guard_client_hq_direct
 BEFORE INSERT OR UPDATE ON public.clients
 FOR EACH ROW EXECUTE FUNCTION public.phase1b_guard_client_hq_direct();
CREATE TRIGGER phase1b_guard_revenue_partner
 BEFORE INSERT OR UPDATE ON public.client_revenue_history
 FOR EACH ROW EXECUTE FUNCTION public.phase1b_guard_revenue_partner();
