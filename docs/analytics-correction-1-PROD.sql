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

-- ================= Part 2: v_analytics_renewals_summary =================
-- Pre-check (expect previous definition: open = status NOT IN ('Won','Lost') only):
SELECT pg_get_viewdef('public.v_analytics_renewals_summary'::regclass, true);
SELECT * FROM public.v_analytics_renewals_summary; -- save "before" numbers

BEGIN;
CREATE OR REPLACE VIEW public.v_analytics_renewals_summary WITH (security_invoker=on) AS
SELECT count(*)::integer AS total,
  count(*) FILTER (WHERE status = 'Won')::integer AS won,
  count(*) FILTER (WHERE status = 'Lost')::integer AS lost,
  count(*) FILTER (WHERE closed_at IS NULL AND COALESCE(btrim(outcome),'') = '' AND status <> ALL (ARRAY['Won','Lost','Completed']) AND renewal_date >= CURRENT_DATE)::integer AS upcoming,
  count(*) FILTER (WHERE closed_at IS NULL AND COALESCE(btrim(outcome),'') = '' AND status <> ALL (ARRAY['Won','Lost','Completed']) AND renewal_date < CURRENT_DATE)::integer AS overdue,
  COALESCE(sum(COALESCE(final_value, estimated_value, 0::numeric)) FILTER (WHERE status = 'Won'), 0::numeric) AS won_value,
  CASE WHEN count(*) FILTER (WHERE status = ANY (ARRAY['Won','Lost'])) = 0 THEN 0::numeric
       ELSE round(100.0 * count(*) FILTER (WHERE status = 'Won')::numeric / count(*) FILTER (WHERE status = ANY (ARRAY['Won','Lost']))::numeric)
  END::integer AS success_rate
FROM renewals;
COMMIT;

-- Verification (v_* must equal raw_*; won/lost/won_value/success_rate unchanged vs "before"):
SELECT v.overdue v_overdue,
  (SELECT count(*) FROM renewals WHERE closed_at IS NULL AND COALESCE(btrim(outcome),'')='' AND status NOT IN ('Won','Lost','Completed') AND renewal_date < CURRENT_DATE) raw_overdue,
  v.upcoming v_upcoming,
  (SELECT count(*) FROM renewals WHERE closed_at IS NULL AND COALESCE(btrim(outcome),'')='' AND status NOT IN ('Won','Lost','Completed') AND renewal_date >= CURRENT_DATE) raw_upcoming,
  (SELECT count(*) FROM renewals WHERE status='Completed') completed_rows, v.won, v.lost, v.won_value, v.success_rate
FROM public.v_analytics_renewals_summary v;
SELECT reloptions FROM pg_class WHERE oid='public.v_analytics_renewals_summary'::regclass; -- {security_invoker=on}

-- ================= Executable rollbacks (previous definitions) =================
-- Rollback renewals summary:
-- CREATE OR REPLACE VIEW public.v_analytics_renewals_summary WITH (security_invoker=on) AS
-- SELECT count(*)::integer AS total,
--   count(*) FILTER (WHERE status = 'Won')::integer AS won,
--   count(*) FILTER (WHERE status = 'Lost')::integer AS lost,
--   count(*) FILTER (WHERE status <> ALL (ARRAY['Won','Lost']) AND renewal_date >= CURRENT_DATE)::integer AS upcoming,
--   count(*) FILTER (WHERE status <> ALL (ARRAY['Won','Lost']) AND renewal_date < CURRENT_DATE)::integer AS overdue,
--   COALESCE(sum(COALESCE(final_value, estimated_value, 0::numeric)) FILTER (WHERE status = 'Won'), 0::numeric) AS won_value,
--   CASE WHEN count(*) FILTER (WHERE status = ANY (ARRAY['Won','Lost'])) = 0 THEN 0::numeric
--        ELSE round(100.0 * count(*) FILTER (WHERE status = 'Won')::numeric / count(*) FILTER (WHERE status = ANY (ARRAY['Won','Lost']))::numeric)
--   END::integer AS success_rate
-- FROM renewals;
--
-- Rollback sales performance:
-- CREATE OR REPLACE VIEW public.v_analytics_sales_performance WITH (security_invoker=on) AS
-- SELECT COALESCE(p.id::text, 'unassigned:' || COALESCE(d.assigned_salesperson, 'Unassigned')) AS sales_key,
--   p.id AS user_id, COALESCE(p.full_name, d.assigned_salesperson, 'Unassigned') AS sales_name, p.id IS NULL AS is_unlinked,
--   count(*) FILTER (WHERE d.status='Open' AND d.stage <> ALL (ARRAY['Won','Lost']))::integer AS open_count,
--   count(*) FILTER (WHERE d.status='Won')::integer AS won_count,
--   count(*) FILTER (WHERE d.status='Lost')::integer AS lost_count,
--   COALESCE(sum(COALESCE(NULLIF(d.total_value,0), d.expected_value, 0)) FILTER (WHERE d.status='Won'),0) AS won_revenue,
--   COALESCE(sum(COALESCE(NULLIF(d.total_value,0), d.expected_value, 0)) FILTER (WHERE d.status='Open' AND d.stage <> ALL (ARRAY['Won','Lost'])),0) AS pipeline_value,
--   COALESCE(sum(COALESCE(NULLIF(d.total_value,0), d.expected_value, 0) * COALESCE(NULLIF(d.probability,0), pipeline_stage_probability(d.stage))::numeric / 100.0) FILTER (WHERE d.status='Open' AND d.stage <> ALL (ARRAY['Won','Lost'])),0) AS weighted_pipeline
-- FROM deals d LEFT JOIN profiles p ON p.id = d.assigned_user_id
-- GROUP BY p.id, p.full_name, d.assigned_salesperson;
