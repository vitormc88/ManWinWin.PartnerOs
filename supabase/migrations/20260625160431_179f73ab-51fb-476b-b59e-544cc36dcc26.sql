
-- Partner Health Engine v2 — replace partner_metrics view with multi-dimensional scoring.
-- Dimensions: Relationship (40%), Business Momentum (35%), Operational Engagement (25%).
-- Backward compatible: keeps revenue, pipeline, clients, health_score columns.
-- Adds: relationship_score, momentum_score, engagement_score, positive_factors, negative_factors.

DROP VIEW IF EXISTS public.partner_metrics;

CREATE VIEW public.partner_metrics
WITH (security_invoker=on) AS
WITH d AS (
  SELECT
    partner_id::uuid AS partner_id,
    SUM(CASE WHEN status = 'Won'  THEN COALESCE(expected_value, 0) ELSE 0 END) AS revenue,
    SUM(CASE WHEN status = 'Open' THEN COALESCE(expected_value, 0) ELSE 0 END) AS pipeline,
    COUNT(*) FILTER (WHERE status = 'Open')                                    AS open_deals,
    COUNT(*) FILTER (WHERE created_at > now() - interval '90 days')            AS recent_deals,
    COUNT(*) FILTER (WHERE status = 'Won' AND won_at > now() - interval '180 days') AS recent_wins,
    MAX(created_at) AS last_deal_at
  FROM public.deals
  WHERE partner_id IS NOT NULL
    AND partner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY partner_id
),
c AS (
  SELECT partner_id::uuid AS partner_id, COUNT(*) AS client_count
  FROM public.clients
  WHERE partner_id IS NOT NULL
    AND partner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY partner_id
),
n AS (
  SELECT
    partner_id,
    MAX(created_at) AS last_note_at,
    COUNT(*) FILTER (WHERE created_at > now() - interval '90 days') AS notes_90d
  FROM public.partner_notes
  GROUP BY partner_id
),
ob AS (
  SELECT
    partner_id::uuid AS partner_id,
    MAX(progress_pct) AS onboarding_pct,
    bool_or(completed_at IS NOT NULL) AS onboarding_done
  FROM public.partner_onboarding
  WHERE partner_id IS NOT NULL
    AND partner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY partner_id
),
u AS (
  SELECT partner_id, COUNT(*) FILTER (WHERE COALESCE(is_active, true)) AS user_count
  FROM public.profiles
  WHERE partner_id IS NOT NULL
  GROUP BY partner_id
),
base AS (
  SELECT
    p.id AS partner_id,
    COALESCE(d.revenue, 0)::numeric    AS revenue,
    COALESCE(d.pipeline, 0)::numeric   AS pipeline,
    COALESCE(c.client_count, 0)::integer AS clients,

    -- Days since last relationship signal (note OR recorded meeting). NULL when none.
    LEAST(
      COALESCE(EXTRACT(EPOCH FROM (now() - n.last_note_at)) / 86400, 1e9),
      COALESCE((CURRENT_DATE - p.last_meeting_date)::numeric, 1e9)
    ) AS days_since_contact,

    p.account_owner_id,
    p.assigned_manager_id,
    p.next_meeting_date,
    p.last_meeting_date,
    p.country, p.primary_contact_email, p.website, p.partnership_level,

    COALESCE(n.notes_90d, 0)        AS notes_90d,
    n.last_note_at,
    COALESCE(d.open_deals, 0)       AS open_deals,
    COALESCE(d.recent_deals, 0)     AS recent_deals,
    COALESCE(d.recent_wins, 0)      AS recent_wins,
    d.last_deal_at,
    COALESCE(ob.onboarding_pct, 0)  AS onboarding_pct,
    COALESCE(ob.onboarding_done, false) AS onboarding_done,
    COALESCE(u.user_count, 0)       AS user_count
  FROM public.partners p
  LEFT JOIN d  ON d.partner_id  = p.id
  LEFT JOIN c  ON c.partner_id  = p.id
  LEFT JOIN n  ON n.partner_id  = p.id
  LEFT JOIN ob ON ob.partner_id = p.id
  LEFT JOIN u  ON u.partner_id  = p.id
),
scored AS (
  SELECT
    b.*,
    -- ── Relationship (0-100) ──────────────────────────────────────────
    LEAST(100, GREATEST(0,
      (CASE WHEN b.account_owner_id IS NOT NULL OR b.assigned_manager_id IS NOT NULL THEN 25 ELSE 0 END)
      + (CASE
          WHEN b.days_since_contact <= 30  THEN 35
          WHEN b.days_since_contact <= 60  THEN 22
          WHEN b.days_since_contact <= 120 THEN 10
          ELSE 0
         END)
      + LEAST(25, b.notes_90d * 8)
      + (CASE WHEN b.next_meeting_date IS NOT NULL AND b.next_meeting_date >= CURRENT_DATE THEN 15 ELSE 0 END)
    ))::integer AS relationship_score,

    -- ── Business Momentum (0-100) — counts, not size ──────────────────
    LEAST(100, GREATEST(0,
      LEAST(40, b.open_deals   * 12)
      + LEAST(30, b.recent_deals * 10)
      + LEAST(20, b.recent_wins  * 10)
      + (CASE WHEN b.last_deal_at IS NOT NULL AND b.last_deal_at > now() - interval '60 days' THEN 10 ELSE 0 END)
    ))::integer AS momentum_score,

    -- ── Operational Engagement (0-100) — extensible ───────────────────
    LEAST(100, GREATEST(0,
      (b.onboarding_pct / 2)                                -- up to 50
      + (CASE WHEN b.onboarding_done THEN 15 ELSE 0 END)
      + LEAST(20, b.user_count * 7)
      + (CASE WHEN b.country               IS NOT NULL THEN 3 ELSE 0 END)
      + (CASE WHEN b.primary_contact_email IS NOT NULL THEN 4 ELSE 0 END)
      + (CASE WHEN b.website                IS NOT NULL THEN 3 ELSE 0 END)
      + (CASE WHEN b.partnership_level      IS NOT NULL THEN 5 ELSE 0 END)
    ))::integer AS engagement_score
  FROM base b
)
SELECT
  s.partner_id,
  s.revenue,
  s.pipeline,
  s.clients,
  s.relationship_score,
  s.momentum_score,
  s.engagement_score,
  -- ── Composite Health (40/35/25) ─────────────────────────────────────
  LEAST(100, GREATEST(0,
    ROUND(
      s.relationship_score * 0.40
      + s.momentum_score    * 0.35
      + s.engagement_score  * 0.25
    )
  ))::integer AS health_score,

  ARRAY_REMOVE(ARRAY[
    CASE WHEN s.account_owner_id IS NOT NULL OR s.assigned_manager_id IS NOT NULL THEN 'Account owner assigned' END,
    CASE WHEN s.days_since_contact <= 30  THEN 'Recent partner interaction' END,
    CASE WHEN s.notes_90d > 1             THEN 'Regular touchpoints (90d)' END,
    CASE WHEN s.next_meeting_date IS NOT NULL AND s.next_meeting_date >= CURRENT_DATE THEN 'Upcoming meeting scheduled' END,
    CASE WHEN s.open_deals  > 0           THEN 'Active opportunities in pipeline' END,
    CASE WHEN s.recent_deals > 0          THEN 'New opportunities created recently' END,
    CASE WHEN s.recent_wins  > 0          THEN 'Recent wins (180d)' END,
    CASE WHEN s.onboarding_done           THEN 'Onboarding completed' END,
    CASE WHEN NOT s.onboarding_done AND s.onboarding_pct >= 50 THEN 'Onboarding in progress' END,
    CASE WHEN s.user_count   > 0          THEN 'Active platform users' END
  ], NULL) AS positive_factors,

  ARRAY_REMOVE(ARRAY[
    CASE WHEN s.account_owner_id IS NULL AND s.assigned_manager_id IS NULL THEN 'No account owner assigned' END,
    CASE WHEN s.days_since_contact > 120  THEN 'No recent interactions (>120d)' END,
    CASE WHEN s.days_since_contact > 60 AND s.days_since_contact <= 120 THEN 'Communication slowing down (>60d)' END,
    CASE WHEN s.next_meeting_date IS NULL OR s.next_meeting_date < CURRENT_DATE THEN 'No upcoming meeting scheduled' END,
    CASE WHEN s.open_deals  = 0           THEN 'No active opportunities' END,
    CASE WHEN s.last_deal_at IS NULL OR s.last_deal_at < now() - interval '180 days' THEN 'No commercial activity (>180d)' END,
    CASE WHEN NOT s.onboarding_done AND s.onboarding_pct < 50 THEN 'Onboarding incomplete' END,
    CASE WHEN s.user_count = 0            THEN 'No platform users provisioned' END
  ], NULL) AS negative_factors
FROM scored s;

GRANT SELECT ON public.partner_metrics TO authenticated;
