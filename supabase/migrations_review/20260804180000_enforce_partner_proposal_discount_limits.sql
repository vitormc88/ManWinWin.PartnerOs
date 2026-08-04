-- Enforce partner proposal discount limits (mirror of the already-installed
-- production protection; recorded here for source control).
--
-- Rules, per proposal line / discount channel:
--   * HQ users: up to 100% software and services.
--   * Any partner user: software max 10%, regardless of partnership level.
--   * Implementer partners: services up to 100%.
--   * Reseller / Strategic Connector / Technologic / unknown or missing level:
--     services max 10%.
--   * Fixed EUR discounts are limited by their effective percentage of the
--     line gross value, so they cannot bypass the percentage limit.
--   * Internal operations without auth.uid() are allowed through.
--
-- All helper functions live in a private, non-exposed schema and are
-- SECURITY DEFINER with PUBLIC/anon/authenticated EXECUTE revoked.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.proposal_discount_limits()
RETURNS TABLE(software_max numeric, services_max numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_hq boolean := false;
  _partner_id uuid;
  _level text;
BEGIN
  IF _uid IS NULL THEN
    software_max := 100; services_max := 100; RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(p.is_hq, false), p.partner_id
    INTO _is_hq, _partner_id
  FROM public.profiles p
  WHERE p.id = _uid;

  _is_hq := COALESCE(_is_hq, false) AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid AND ur.role IN ('hq_admin', 'hq_standard')
  );

  IF _is_hq THEN
    software_max := 100; services_max := 100; RETURN NEXT; RETURN;
  END IF;

  SELECT pa.partnership_level INTO _level
  FROM public.partners pa
  WHERE pa.id = _partner_id;

  software_max := 10;
  services_max := CASE WHEN COALESCE(_level, '') ILIKE '%implement%' THEN 100 ELSE 10 END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.proposal_effective_discount_pct(
  _discount_type text,
  _discount_value numeric,
  _gross numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN _discount_type IS NULL OR _discount_type = 'none' THEN 0
    WHEN COALESCE(_discount_value, 0) <= 0 THEN 0
    WHEN _discount_type = 'percent' THEN _discount_value
    WHEN COALESCE(_gross, 0) <= 0 THEN 100000  -- unverifiable fixed discount => reject
    ELSE (_discount_value / _gross) * 100
  END
$$;

CREATE OR REPLACE FUNCTION private.enforce_proposal_business_discounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _sw numeric; _sv numeric;
  _d jsonb;
  _ch text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT software_max, services_max INTO _sw, _sv FROM private.proposal_discount_limits();

  _d := COALESCE(NEW.business_config -> 'discounts', '{}'::jsonb);

  FOREACH _ch IN ARRAY ARRAY['softwarePct', 'webUsersPct', 'apiPct'] LOOP
    IF COALESCE((_d ->> _ch)::numeric, 0) > _sw + 0.000001 THEN
      RAISE EXCEPTION 'Discount % on channel % exceeds your maximum software discount of %%%',
        (_d ->> _ch), _ch, _sw USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF COALESCE((_d ->> 'servicesPct')::numeric, 0) > _sv + 0.000001 THEN
    RAISE EXCEPTION 'Services discount % exceeds your maximum of %%%',
      (_d ->> 'servicesPct'), _sv USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_proposal_item_discounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _sw numeric; _sv numeric; _max numeric; _pct numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.discount_type IS NULL OR NEW.discount_type = 'none'
     OR COALESCE(NEW.discount_value, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT software_max, services_max INTO _sw, _sv FROM private.proposal_discount_limits();
  _max := CASE WHEN NEW.category = 'service' THEN _sv ELSE _sw END;

  _pct := private.proposal_effective_discount_pct(
    NEW.discount_type,
    NEW.discount_value,
    COALESCE(NEW.gross_total, NEW.total)
  );

  IF _pct > _max + 0.000001 THEN
    RAISE EXCEPTION 'Discount on line "%" is %%% of its value and exceeds your maximum of %%%',
      NEW.item_name, round(_pct, 2), _max USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.proposal_discount_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.proposal_effective_discount_pct(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_proposal_business_discounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_proposal_item_discounts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_proposal_business_discounts ON public.proposals;
CREATE TRIGGER trg_enforce_proposal_business_discounts
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION private.enforce_proposal_business_discounts();

DROP TRIGGER IF EXISTS trg_enforce_proposal_item_discounts ON public.proposal_items;
CREATE TRIGGER trg_enforce_proposal_item_discounts
BEFORE INSERT OR UPDATE ON public.proposal_items
FOR EACH ROW EXECUTE FUNCTION private.enforce_proposal_item_discounts();
