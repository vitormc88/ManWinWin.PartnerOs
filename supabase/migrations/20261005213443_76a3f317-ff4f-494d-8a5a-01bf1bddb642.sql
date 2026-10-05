CREATE OR REPLACE VIEW public.v_analytics_sales_performance WITH (security_invoker=on) AS
SELECT COALESCE(x.uid::text, 'unassigned:' || COALESCE(x.unlinked_name, 'Unassigned')) AS sales_key,
  x.uid AS user_id,
  COALESCE(max(x.full_name), max(x.assigned_salesperson), 'Unassigned') AS sales_name,
  x.uid IS NULL AS is_unlinked,
  count(*) FILTER (WHERE x.status='Open' AND x.stage <> ALL (ARRAY['Won','Lost']))::integer AS open_count,
  count(*) FILTER (WHERE x.status='Won')::integer AS won_count,
  count(*) FILTER (WHERE x.status='Lost')::integer AS lost_count,
  COALESCE(sum(x.v) FILTER (WHERE x.status='Won'),0) AS won_revenue,
  COALESCE(sum(x.v) FILTER (WHERE x.status='Open' AND x.stage <> ALL (ARRAY['Won','Lost'])),0) AS pipeline_value,
  COALESCE(sum(x.v * x.prob::numeric / 100.0) FILTER (WHERE x.status='Open' AND x.stage <> ALL (ARRAY['Won','Lost'])),0) AS weighted_pipeline
FROM (
  SELECT p.id AS uid, p.full_name, d.assigned_salesperson,
    CASE WHEN p.id IS NULL THEN d.assigned_salesperson END AS unlinked_name,
    d.status, d.stage,
    COALESCE(NULLIF(d.total_value,0), d.expected_value, 0) AS v,
    COALESCE(NULLIF(d.probability,0), pipeline_stage_probability(d.stage)) AS prob
  FROM deals d LEFT JOIN profiles p ON p.id = d.assigned_user_id
) x
GROUP BY x.uid, x.unlinked_name;