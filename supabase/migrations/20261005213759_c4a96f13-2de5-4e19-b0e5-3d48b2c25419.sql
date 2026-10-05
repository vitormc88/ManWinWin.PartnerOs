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