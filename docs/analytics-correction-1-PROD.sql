-- Analytics correction package 1 — PROD rollout (DO NOT run on TEST; run manually on qownzparzsaeoyccgwuj).
-- Pre-check: confirm current definition (save output for rollback).
SELECT pg_get_viewdef('public.v_analytics_sales_performance'::regclass, true);

BEGIN;
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
COMMIT;

-- Verification
-- 1) Linked users appear once (expect 0 rows):
SELECT user_id, count(*) FROM public.v_analytics_sales_performance WHERE user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- 2) security_invoker preserved (expect {security_invoker=on}):
SELECT reloptions FROM pg_class WHERE oid = 'public.v_analytics_sales_performance'::regclass;
-- 3) Totals unchanged vs deals (won/lost/open counts must match):
SELECT (SELECT sum(won_count) FROM public.v_analytics_sales_performance) v_won, (SELECT count(*) FROM deals WHERE status='Won') d_won,
       (SELECT sum(lost_count) FROM public.v_analytics_sales_performance) v_lost, (SELECT count(*) FROM deals WHERE status='Lost') d_lost;

-- Rollback: re-run the original definition saved from the pre-check above
-- (previous version grouped by p.id, p.full_name, d.assigned_salesperson).
