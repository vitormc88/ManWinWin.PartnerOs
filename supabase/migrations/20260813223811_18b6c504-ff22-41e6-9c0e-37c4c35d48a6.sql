-- ============================================================================
-- Billed revenue recording on renewal closure + analytics separation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_revenue_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  renewal_id uuid REFERENCES public.renewals(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  revenue_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  revenue_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_revenue_history TO authenticated;
GRANT ALL ON public.client_revenue_history TO service_role;

ALTER TABLE public.client_revenue_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_revenue_history' AND policyname='revenue_select') THEN
    CREATE POLICY "revenue_select" ON public.client_revenue_history
      FOR SELECT TO authenticated USING (public.can_view_client(client_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_revenue_history' AND policyname='revenue_insert') THEN
    CREATE POLICY "revenue_insert" ON public.client_revenue_history
      FOR INSERT TO authenticated WITH CHECK (public.is_hq_user(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_revenue_history' AND policyname='revenue_update') THEN
    CREATE POLICY "revenue_update" ON public.client_revenue_history
      FOR UPDATE TO authenticated USING (public.is_hq_user(auth.uid())) WITH CHECK (public.is_hq_user(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_revenue_history' AND policyname='revenue_delete') THEN
    CREATE POLICY "revenue_delete" ON public.client_revenue_history
      FOR DELETE TO authenticated USING (public.is_hq_user(auth.uid()));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_client_revenue_history_source_ref
  ON public.client_revenue_history (source_reference) WHERE source_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_revenue_history_client ON public.client_revenue_history (client_id);
CREATE INDEX IF NOT EXISTS idx_client_revenue_history_partner ON public.client_revenue_history (partner_id);
CREATE INDEX IF NOT EXISTS idx_client_revenue_history_date ON public.client_revenue_history (revenue_date);
CREATE INDEX IF NOT EXISTS idx_client_revenue_history_renewal ON public.client_revenue_history (renewal_id);

DROP TRIGGER IF EXISTS trg_client_revenue_history_updated_at ON public.client_revenue_history;
CREATE TRIGGER trg_client_revenue_history_updated_at
  BEFORE UPDATE ON public.client_revenue_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Reporting views (RLS of the underlying table applies) ───────────────────
CREATE OR REPLACE VIEW public.v_revenue_history_enriched
WITH (security_invoker = true) AS
SELECT h.id,
       h.client_id,
       coalesce(h.partner_id, c.partner_uuid) AS partner_uuid,
       pt.company_name AS partner_name,
       public.normalize_country(c.country) AS country,
       h.amount,
       h.currency,
       h.revenue_type,
       h.revenue_date,
       h.source,
       h.source_reference
  FROM public.client_revenue_history h
  JOIN public.clients c ON c.id = h.client_id
  LEFT JOIN public.partners pt ON pt.id = coalesce(h.partner_id, c.partner_uuid);

CREATE OR REPLACE VIEW public.v_client_revenue_summary
WITH (security_invoker = true) AS
SELECT coalesce(sum(amount), 0)::numeric AS lifetime_revenue,
       coalesce(sum(amount) FILTER (WHERE date_part('year', revenue_date) = date_part('year', current_date)), 0)::numeric AS revenue_ytd,
       count(*)::bigint AS revenue_entry_count,
       count(DISTINCT client_id)::bigint AS clients_with_revenue
  FROM public.client_revenue_history;

GRANT SELECT ON public.v_revenue_history_enriched TO authenticated;
GRANT SELECT ON public.v_client_revenue_summary TO authenticated;

-- ── Partner analytics: billed revenue and won new business are DISTINCT ─────
-- Revenue, deals and clients are aggregated independently and only then joined
-- by partner, so revenue rows are never multiplied by deal rows.
DROP VIEW IF EXISTS public.v_analytics_partner_summary;
CREATE VIEW public.v_analytics_partner_summary
WITH (security_invoker = true) AS
WITH deal_agg AS (
  SELECT d.partner_id::uuid AS partner_uuid,
         coalesce(sum(coalesce(NULLIF(d.total_value, 0), d.expected_value, 0)) FILTER (WHERE d.status = 'Won'), 0) AS won_new_business_value,
         count(DISTINCT d.id) FILTER (WHERE d.status = 'Won')::int AS won_new_business_count,
         coalesce(sum(d.expected_value) FILTER (WHERE d.status = 'Open' AND d.stage <> ALL (ARRAY['Won','Lost'])), 0) AS open_pipeline,
         count(DISTINCT d.id) FILTER (WHERE d.status = 'Open' AND d.stage <> ALL (ARRAY['Won','Lost']))::int AS open_deal_count
    FROM public.deals d
   WHERE d.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   GROUP BY d.partner_id::uuid
), revenue_agg AS (
  SELECT coalesce(h.partner_id, c.partner_uuid) AS partner_uuid,
         coalesce(sum(h.amount), 0) AS billed_revenue_lifetime,
         coalesce(sum(h.amount) FILTER (WHERE date_part('year', h.revenue_date) = date_part('year', current_date)), 0) AS billed_revenue_ytd
    FROM public.client_revenue_history h
    JOIN public.clients c ON c.id = h.client_id
   GROUP BY coalesce(h.partner_id, c.partner_uuid)
), client_agg AS (
  SELECT c.partner_uuid, count(*)::int AS active_client_count
    FROM public.clients c
   WHERE c.status = 'Active' AND c.partner_uuid IS NOT NULL
   GROUP BY c.partner_uuid
)
SELECT pt.id AS partner_id,
       pt.company_name,
       public.normalize_country(pt.country) AS country,
       coalesce(r.billed_revenue_lifetime, 0) AS billed_revenue_lifetime,
       coalesce(r.billed_revenue_ytd, 0) AS billed_revenue_ytd,
       coalesce(dl.won_new_business_value, 0) AS won_new_business_value,
       coalesce(dl.won_new_business_count, 0) AS won_new_business_count,
       coalesce(dl.open_pipeline, 0) AS open_pipeline,
       coalesce(dl.open_deal_count, 0) AS open_deal_count,
       coalesce(cl.active_client_count, 0) AS active_client_count,
       coalesce(dl.open_pipeline, 0) AS pipeline,
       coalesce(dl.won_new_business_count, 0) AS won_deal_count,
       coalesce(cl.active_client_count, 0) AS client_count
  FROM public.partners pt
  LEFT JOIN deal_agg dl ON dl.partner_uuid = pt.id
  LEFT JOIN revenue_agg r ON r.partner_uuid = pt.id
  LEFT JOIN client_agg cl ON cl.partner_uuid = pt.id;

GRANT SELECT ON public.v_analytics_partner_summary TO authenticated;

-- ── Billed revenue is recorded atomically with the renewal closure ──────────
-- Implemented as a BEFORE UPDATE trigger so it runs inside the very same
-- transaction as public.close_renewal: if reconciliation fails, the entire
-- closure is rolled back. Recurring and one-time amounts are always separate
-- entries keyed by a deterministic source_reference, so retries can never
-- duplicate revenue. No Won Deal is ever created.
CREATE OR REPLACE FUNCTION public.renewal_closure_record_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _currency text;
  _partner uuid;
  _recurring numeric := coalesce(NEW.renewed_recurring_value, 0);
  _one_time numeric := coalesce(NEW.one_time_value, 0);
  _eff date := coalesce(NEW.renewal_effective_date, NEW.renewal_date, current_date);
  _rec_ref text := 'renewal:' || NEW.id::text || ':recurring';
  _one_ref text := 'renewal:' || NEW.id::text || ':one_time';
  _rec_id uuid;
  _one_id uuid;
  _total numeric := 0;
BEGIN
  IF coalesce(NEW.outcome, '') <> 'renewed' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(ct.currency, 'EUR') INTO _currency
    FROM public.contracts ct WHERE ct.id = NEW.contract_id;
  _currency := coalesce(_currency, 'EUR');

  _partner := coalesce(NEW.partner_uuid, (SELECT cl.partner_uuid FROM public.clients cl WHERE cl.id = NEW.client_id));

  IF _recurring > 0 THEN
    INSERT INTO public.client_revenue_history (
      client_id, partner_id, contract_id, renewal_id, proposal_id,
      revenue_type, amount, currency, revenue_date, source, source_reference, notes)
    VALUES (NEW.client_id, _partner, NEW.contract_id, NEW.id, NEW.closed_proposal_id,
      'renewal', _recurring, _currency, _eff, 'renewal_closure', _rec_ref,
      'Recurring value billed when the renewal was closed as Renewed.')
    ON CONFLICT (source_reference) DO NOTHING;
  END IF;

  IF _one_time > 0 THEN
    INSERT INTO public.client_revenue_history (
      client_id, partner_id, contract_id, renewal_id, proposal_id,
      revenue_type, amount, currency, revenue_date, source, source_reference, notes)
    VALUES (NEW.client_id, _partner, NEW.contract_id, NEW.id, NEW.closed_proposal_id,
      'implementation', _one_time, _currency, _eff, 'renewal_closure', _one_ref,
      'One-time implementation value billed when the renewal was closed as Renewed.')
    ON CONFLICT (source_reference) DO NOTHING;
  END IF;

  SELECT id INTO _rec_id FROM public.client_revenue_history WHERE source_reference = _rec_ref;
  SELECT id INTO _one_id FROM public.client_revenue_history WHERE source_reference = _one_ref;

  SELECT coalesce(sum(amount), 0) INTO _total FROM public.client_revenue_history
   WHERE renewal_id = NEW.id AND source = 'renewal_closure';

  IF round(_total, 2) <> round(_recurring + _one_time, 2) THEN
    RAISE EXCEPTION 'REVENUE_RECONCILIATION_FAILED: recorded % expected %',
      _total, (_recurring + _one_time);
  END IF;

  NEW.closure_snapshot := coalesce(NEW.closure_snapshot, '{}'::jsonb) || jsonb_build_object(
    'revenue', jsonb_build_object(
      'currency', _currency,
      'total', _total,
      'recurring', jsonb_build_object('id', _rec_id, 'amount', _recurring,
        'revenue_type', 'renewal', 'source_reference', _rec_ref),
      'one_time', jsonb_build_object('id', _one_id, 'amount', _one_time,
        'revenue_type', 'implementation', 'source_reference', _one_ref)));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_renewal_closure_record_revenue ON public.renewals;
CREATE TRIGGER trg_renewal_closure_record_revenue
  BEFORE UPDATE ON public.renewals
  FOR EACH ROW
  WHEN (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
  EXECUTE FUNCTION public.renewal_closure_record_revenue();

-- ── HQ-only, idempotent revenue backfill for renewals closed before this change
-- Dry-run by default; never creates deals and never runs automatically.
CREATE OR REPLACE FUNCTION public.renewal_revenue_backfill(_dry_run boolean DEFAULT true, _renewal_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rows jsonb := '[]'::jsonb;
  _inserted int := 0;
  _total numeric := 0;
  rec record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_hq_user(auth.uid()) THEN RAISE EXCEPTION 'NOT_AUTHORIZED: HQ only'; END IF;

  FOR rec IN
    SELECT r.id AS renewal_id, r.client_id, r.contract_id, r.closed_proposal_id,
           coalesce(r.partner_uuid, c.partner_uuid) AS partner_uuid,
           coalesce(r.renewal_effective_date, r.renewal_date, r.closed_at::date) AS eff,
           coalesce(r.renewed_recurring_value, 0) AS recurring,
           coalesce(r.one_time_value, 0) AS one_time,
           coalesce(ct.currency, 'EUR') AS currency
      FROM public.renewals r
      JOIN public.clients c ON c.id = r.client_id
      LEFT JOIN public.contracts ct ON ct.id = r.contract_id
     WHERE r.outcome = 'renewed' AND r.closed_at IS NOT NULL
       AND (_renewal_id IS NULL OR r.id = _renewal_id)
  LOOP
    IF rec.recurring > 0 AND NOT EXISTS (
      SELECT 1 FROM public.client_revenue_history
       WHERE source_reference = 'renewal:' || rec.renewal_id::text || ':recurring') THEN
      _rows := _rows || jsonb_build_object('renewal_id', rec.renewal_id, 'revenue_type', 'renewal',
        'amount', rec.recurring, 'revenue_date', rec.eff,
        'source_reference', 'renewal:' || rec.renewal_id::text || ':recurring');
      _total := _total + rec.recurring;
      IF NOT _dry_run THEN
        INSERT INTO public.client_revenue_history (client_id, partner_id, contract_id, renewal_id, proposal_id,
          revenue_type, amount, currency, revenue_date, source, source_reference, notes)
        VALUES (rec.client_id, rec.partner_uuid, rec.contract_id, rec.renewal_id, rec.closed_proposal_id,
          'renewal', rec.recurring, rec.currency, rec.eff, 'renewal_closure',
          'renewal:' || rec.renewal_id::text || ':recurring', 'Backfilled from a renewal closed before revenue recording.')
        ON CONFLICT (source_reference) DO NOTHING;
        _inserted := _inserted + 1;
      END IF;
    END IF;

    IF rec.one_time > 0 AND NOT EXISTS (
      SELECT 1 FROM public.client_revenue_history
       WHERE source_reference = 'renewal:' || rec.renewal_id::text || ':one_time') THEN
      _rows := _rows || jsonb_build_object('renewal_id', rec.renewal_id, 'revenue_type', 'implementation',
        'amount', rec.one_time, 'revenue_date', rec.eff,
        'source_reference', 'renewal:' || rec.renewal_id::text || ':one_time');
      _total := _total + rec.one_time;
      IF NOT _dry_run THEN
        INSERT INTO public.client_revenue_history (client_id, partner_id, contract_id, renewal_id, proposal_id,
          revenue_type, amount, currency, revenue_date, source, source_reference, notes)
        VALUES (rec.client_id, rec.partner_uuid, rec.contract_id, rec.renewal_id, rec.closed_proposal_id,
          'implementation', rec.one_time, rec.currency, rec.eff, 'renewal_closure',
          'renewal:' || rec.renewal_id::text || ':one_time', 'Backfilled from a renewal closed before revenue recording.')
        ON CONFLICT (source_reference) DO NOTHING;
        _inserted := _inserted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dry_run', _dry_run, 'missing_count', jsonb_array_length(_rows),
    'missing_total', _total, 'inserted', _inserted, 'entries', _rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.renewal_revenue_backfill(boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renewal_revenue_backfill(boolean, uuid) TO authenticated;