DROP VIEW IF EXISTS public.v_analytics_deal_reconciliation;

CREATE VIEW public.v_analytics_deal_reconciliation
WITH (security_invoker = on) AS
SELECT
  d.id,
  d.company_name,
  d.status,
  d.stage,
  d.country AS country_raw,
  public.normalize_country(d.country) AS country_normalized,
  d.partner_id,
  COALESCE(p.full_name, d.assigned_salesperson, 'Unassigned') AS salesperson,
  d.expected_value,
  d.total_value,
  COALESCE(NULLIF(d.total_value, 0), d.expected_value, 0)::numeric AS authoritative_value,
  d.probability AS deal_probability,
  COALESCE(NULLIF(d.probability, 0), public.pipeline_stage_probability(d.stage))::int AS resolved_probability,
  ROUND(
    COALESCE(NULLIF(d.total_value, 0), d.expected_value, 0)
    * COALESCE(NULLIF(d.probability, 0), public.pipeline_stage_probability(d.stage))
    / 100.0
  )::numeric AS weighted_value,
  (d.status = 'Won')::boolean AS in_revenue,
  (d.status = 'Open' AND d.stage NOT IN ('Won','Lost'))::boolean AS in_pipeline,
  d.won_at,
  d.lost_at,
  d.status_changed_at,
  d.created_at,
  d.updated_at
FROM public.deals d
LEFT JOIN public.profiles p ON p.id = d.assigned_user_id;

GRANT SELECT ON public.v_analytics_deal_reconciliation TO authenticated;