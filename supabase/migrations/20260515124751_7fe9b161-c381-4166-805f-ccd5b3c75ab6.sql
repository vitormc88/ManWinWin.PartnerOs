
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

ALTER TABLE public.renewals
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.deal_activities
  ADD COLUMN IF NOT EXISTS performed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_assigned_user_id ON public.deals(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_renewals_assigned_user_id ON public.renewals(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_performed_by_user_id ON public.deal_activities(performed_by_user_id);

CREATE OR REPLACE FUNCTION public.resolve_user_by_name(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key text;
  _ids uuid[];
BEGIN
  IF _name IS NULL OR btrim(_name) = '' OR lower(btrim(_name)) IN ('unassigned','n/a','-','none') THEN
    RETURN NULL;
  END IF;

  _key := lower(extensions.unaccent(btrim(_name)));

  SELECT array_agg(id) INTO _ids
  FROM (
    SELECT id FROM public.profiles
    WHERE coalesce(is_active, true) = true
      AND lower(extensions.unaccent(btrim(coalesce(full_name, '')))) = _key
    LIMIT 2
  ) s;

  IF _ids IS NOT NULL AND array_length(_ids, 1) = 1 THEN
    RETURN _ids[1];
  END IF;
  RETURN NULL;
END;
$$;

UPDATE public.deals
SET assigned_user_id = public.resolve_user_by_name(assigned_salesperson)
WHERE assigned_user_id IS NULL
  AND assigned_salesperson IS NOT NULL
  AND public.resolve_user_by_name(assigned_salesperson) IS NOT NULL;

UPDATE public.renewals
SET assigned_user_id = public.resolve_user_by_name(assigned_owner)
WHERE assigned_user_id IS NULL
  AND assigned_owner IS NOT NULL
  AND public.resolve_user_by_name(assigned_owner) IS NOT NULL;

UPDATE public.deal_activities
SET performed_by_user_id = public.resolve_user_by_name(performed_by)
WHERE performed_by_user_id IS NULL
  AND performed_by IS NOT NULL
  AND public.resolve_user_by_name(performed_by) IS NOT NULL;

CREATE OR REPLACE VIEW public.v_deal_ownership_status AS
SELECT
  d.id AS deal_id,
  d.assigned_user_id,
  COALESCE(p.full_name, d.assigned_salesperson) AS owner_display_name,
  CASE
    WHEN d.assigned_user_id IS NOT NULL AND p.id IS NULL THEN 'orphaned'
    WHEN d.assigned_user_id IS NOT NULL AND COALESCE(p.is_active, true) = false THEN 'inactive'
    WHEN d.assigned_user_id IS NOT NULL THEN 'assigned'
    WHEN d.assigned_salesperson IS NOT NULL AND btrim(d.assigned_salesperson) <> ''
         AND lower(btrim(d.assigned_salesperson)) <> 'unassigned' THEN 'needs_review'
    ELSE 'unassigned'
  END AS ownership_status
FROM public.deals d
LEFT JOIN public.profiles p ON p.id = d.assigned_user_id;

DROP VIEW IF EXISTS public.v_analytics_deal_reconciliation;
CREATE VIEW public.v_analytics_deal_reconciliation AS
SELECT
  d.id,
  d.company_name,
  d.status,
  d.stage,
  d.country AS country_raw,
  public.normalize_country(d.country) AS country_normalized,
  d.partner_id,
  d.assigned_user_id,
  COALESCE(p.full_name, d.assigned_salesperson, 'Unassigned') AS owner_display_name,
  CASE
    WHEN d.assigned_user_id IS NOT NULL AND p.id IS NULL THEN 'orphaned'
    WHEN d.assigned_user_id IS NOT NULL AND COALESCE(p.is_active, true) = false THEN 'inactive'
    WHEN d.assigned_user_id IS NOT NULL THEN 'assigned'
    WHEN d.assigned_salesperson IS NOT NULL AND btrim(d.assigned_salesperson) <> ''
         AND lower(btrim(d.assigned_salesperson)) <> 'unassigned' THEN 'needs_review'
    ELSE 'unassigned'
  END AS ownership_status,
  COALESCE(p.full_name, d.assigned_salesperson, 'Unassigned') AS salesperson,
  d.expected_value,
  d.total_value,
  COALESCE(NULLIF(d.total_value, 0), d.expected_value, 0) AS authoritative_value,
  d.probability AS deal_probability,
  COALESCE(NULLIF(d.probability, 0), public.pipeline_stage_probability(d.stage)) AS resolved_probability,
  round(COALESCE(NULLIF(d.total_value, 0), d.expected_value, 0)
        * COALESCE(NULLIF(d.probability, 0), public.pipeline_stage_probability(d.stage))::numeric / 100.0) AS weighted_value,
  d.status = 'Won' AS in_revenue,
  (d.status = 'Open' AND d.stage NOT IN ('Won','Lost')) AS in_pipeline,
  d.won_at,
  d.lost_at,
  d.status_changed_at,
  d.created_at,
  d.updated_at
FROM public.deals d
LEFT JOIN public.profiles p ON p.id = d.assigned_user_id;

CREATE OR REPLACE VIEW public.v_analytics_sales_by_user AS
SELECT
  p.id AS user_id,
  p.full_name AS user_full_name,
  p.email AS user_email,
  p.is_active,
  p.partner_id,
  COUNT(d.id) FILTER (WHERE d.status = 'Open' AND d.stage NOT IN ('Won','Lost'))::int AS open_count,
  COUNT(d.id) FILTER (WHERE d.status = 'Won')::int AS won_count,
  COUNT(d.id) FILTER (WHERE d.status = 'Lost')::int AS lost_count,
  COALESCE(SUM(COALESCE(NULLIF(d.total_value,0), d.expected_value, 0))
           FILTER (WHERE d.status = 'Won'), 0)::numeric AS won_revenue,
  COALESCE(SUM(COALESCE(NULLIF(d.total_value,0), d.expected_value, 0))
           FILTER (WHERE d.status = 'Open' AND d.stage NOT IN ('Won','Lost')), 0)::numeric AS pipeline_value,
  COALESCE(SUM(COALESCE(NULLIF(d.total_value,0), d.expected_value, 0)
               * COALESCE(NULLIF(d.probability,0), public.pipeline_stage_probability(d.stage))::numeric / 100.0)
           FILTER (WHERE d.status = 'Open' AND d.stage NOT IN ('Won','Lost')), 0)::numeric AS weighted_pipeline
FROM public.profiles p
LEFT JOIN public.deals d ON d.assigned_user_id = p.id
GROUP BY p.id, p.full_name, p.email, p.is_active, p.partner_id;

CREATE OR REPLACE FUNCTION public.enforce_deal_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_partner uuid;
  _target_partner uuid;
  _target_is_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_user_id IS NULL OR _actor IS NULL OR public.is_hq_user(_actor) THEN
    RETURN NEW;
  END IF;

  _actor_partner := public.get_user_partner_id(_actor);
  SELECT partner_id, COALESCE(is_active, true)
    INTO _target_partner, _target_is_active
  FROM public.profiles WHERE id = NEW.assigned_user_id;

  IF _target_partner IS NULL THEN
    RAISE EXCEPTION 'Cannot assign deal to a non-partner user';
  END IF;
  IF _actor_partner IS NULL OR _target_partner <> _actor_partner THEN
    RAISE EXCEPTION 'You can only assign deals to users within your partner organisation';
  END IF;
  IF NOT _target_is_active THEN
    RAISE EXCEPTION 'Cannot assign deal to an inactive user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_deal_assignment ON public.deals;
CREATE TRIGGER trg_enforce_deal_assignment
BEFORE INSERT OR UPDATE OF assigned_user_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.enforce_deal_assignment();

CREATE OR REPLACE FUNCTION public.enforce_renewal_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_partner uuid;
  _target_partner uuid;
  _target_is_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_user_id IS NULL OR _actor IS NULL OR public.is_hq_user(_actor) THEN
    RETURN NEW;
  END IF;

  _actor_partner := public.get_user_partner_id(_actor);
  SELECT partner_id, COALESCE(is_active, true)
    INTO _target_partner, _target_is_active
  FROM public.profiles WHERE id = NEW.assigned_user_id;

  IF _target_partner IS NULL OR _actor_partner IS NULL OR _target_partner <> _actor_partner THEN
    RAISE EXCEPTION 'You can only assign renewals to users within your partner organisation';
  END IF;
  IF NOT _target_is_active THEN
    RAISE EXCEPTION 'Cannot assign renewal to an inactive user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_renewal_assignment ON public.renewals;
CREATE TRIGGER trg_enforce_renewal_assignment
BEFORE INSERT OR UPDATE OF assigned_user_id ON public.renewals
FOR EACH ROW EXECUTE FUNCTION public.enforce_renewal_assignment();
