-- Create partner_metrics view aggregating revenue/pipeline/clients per partner
CREATE OR REPLACE VIEW public.partner_metrics
WITH (security_invoker=on) AS
SELECT
  p.id AS partner_id,
  COALESCE(d.revenue, 0)::numeric AS revenue,
  COALESCE(d.pipeline, 0)::numeric AS pipeline,
  COALESCE(c.client_count, 0)::integer AS clients,
  (
    CASE WHEN COALESCE(d.revenue, 0) > 0 THEN 30 ELSE 0 END
    + CASE WHEN COALESCE(d.pipeline, 0) > 0 THEN 30 ELSE 0 END
    + CASE WHEN COALESCE(c.client_count, 0) > 0 THEN 40 ELSE 0 END
  )::integer AS health_score
FROM public.partners p
LEFT JOIN (
  SELECT
    partner_id,
    SUM(CASE WHEN status = 'Won' THEN COALESCE(expected_value, 0) ELSE 0 END) AS revenue,
    SUM(CASE WHEN status = 'Open' THEN COALESCE(expected_value, 0) ELSE 0 END) AS pipeline
  FROM public.deals
  WHERE partner_id IS NOT NULL
    AND partner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY partner_id
) d ON d.partner_id::uuid = p.id
LEFT JOIN (
  SELECT partner_id, COUNT(*) AS client_count
  FROM public.clients
  WHERE partner_id IS NOT NULL
    AND partner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY partner_id
) c ON c.partner_id::uuid = p.id;

GRANT SELECT ON public.partner_metrics TO authenticated;