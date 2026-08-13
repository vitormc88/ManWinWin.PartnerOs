-- ── 1. Configured plan/product transition rules ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_transition_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  source_family text,
  target_family text,
  source_plan integer,
  target_plan integer,
  implementation_kind text NOT NULL DEFAULT 'standard',
  pricing_mode text NOT NULL DEFAULT 'fixed',
  hours numeric,
  hourly_rate numeric,
  incremental_gross numeric,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_transition_rules_pricing_mode_chk CHECK (pricing_mode IN ('fixed','hours_rate')),
  CONSTRAINT plan_transition_rules_kind_chk CHECK (implementation_kind IN ('standard','light'))
);

GRANT SELECT ON public.plan_transition_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_transition_rules TO authenticated;
GRANT ALL ON public.plan_transition_rules TO service_role;

ALTER TABLE public.plan_transition_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transition rules readable by authenticated" ON public.plan_transition_rules;
CREATE POLICY "transition rules readable by authenticated"
  ON public.plan_transition_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "transition rules managed by hq admins" ON public.plan_transition_rules;
CREATE POLICY "transition rules managed by hq admins"
  ON public.plan_transition_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'hq_admin'));

DROP TRIGGER IF EXISTS plan_transition_rules_set_updated_at ON public.plan_transition_rules;
CREATE TRIGGER plan_transition_rules_set_updated_at
  BEFORE UPDATE ON public.plan_transition_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Proposal-level entitlement + implementation provenance ───────────────
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS entitlements jsonb,
  ADD COLUMN IF NOT EXISTS target_product_family text,
  ADD COLUMN IF NOT EXISTS implementation_source text,
  ADD COLUMN IF NOT EXISTS implementation_transition_rule_id uuid REFERENCES public.plan_transition_rules(id),
  ADD COLUMN IF NOT EXISTS implementation_transition_rule_code text,
  ADD COLUMN IF NOT EXISTS implementation_hours numeric,
  ADD COLUMN IF NOT EXISTS implementation_hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS implementation_gross numeric,
  ADD COLUMN IF NOT EXISTS implementation_discount_amount numeric,
  ADD COLUMN IF NOT EXISTS implementation_net numeric,
  ADD COLUMN IF NOT EXISTS implementation_justification text,
  ADD COLUMN IF NOT EXISTS implementation_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS implementation_confirmed_at timestamptz;

-- ── 3. Line-level licensed / included / billable breakdown ──────────────────
ALTER TABLE public.proposal_items
  ADD COLUMN IF NOT EXISTS access_type text,
  ADD COLUMN IF NOT EXISTS total_licensed_qty numeric,
  ADD COLUMN IF NOT EXISTS included_qty numeric,
  ADD COLUMN IF NOT EXISTS billable_qty numeric,
  ADD COLUMN IF NOT EXISTS implementation_source text,
  ADD COLUMN IF NOT EXISTS transition_rule_code text,
  ADD COLUMN IF NOT EXISTS implementation_hours numeric,
  ADD COLUMN IF NOT EXISTS implementation_hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS justification text;

-- ── 4. License entitlement breakdown (total capacity is never overwritten) ──
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS included_backoffice_users numeric,
  ADD COLUMN IF NOT EXISTS included_web_accesses numeric,
  ADD COLUMN IF NOT EXISTS billable_backoffice_users numeric,
  ADD COLUMN IF NOT EXISTS billable_web_accesses numeric,
  ADD COLUMN IF NOT EXISTS entitlement_provenance jsonb;

-- ── 5. close_renewal: record the entitlement breakdown on the license ───────
DO $mig$
DECLARE
  _def text;
  _old text;
  _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def
    FROM pg_proc
   WHERE proname = 'close_renewal'
     AND pronamespace = 'public'::regnamespace
   LIMIT 1;
  IF _def IS NULL THEN RAISE EXCEPTION 'close_renewal not found'; END IF;

  _old := '  IF _plan_change AND _license_id IS NOT NULL THEN
    UPDATE public.licenses SET
      product = ''Professional '' || p.target_plan::text,
      edition = ''Professional '' || p.target_plan::text,
      updated_at = now()
    WHERE id = _license_id;
  END IF;';

  _new := '  IF _license_id IS NOT NULL AND (_plan_change OR p.entitlements IS NOT NULL) THEN
    UPDATE public.licenses SET
      product = CASE WHEN _plan_change THEN ''Professional '' || p.target_plan::text ELSE product END,
      edition = CASE WHEN _plan_change THEN ''Professional '' || p.target_plan::text ELSE edition END,
      included_backoffice_users = coalesce((p.entitlements->''backoffice''->>''included'')::numeric, included_backoffice_users),
      included_web_accesses     = coalesce((p.entitlements->''web''->>''included'')::numeric, included_web_accesses),
      billable_backoffice_users = coalesce((p.entitlements->''backoffice''->>''billable'')::numeric, billable_backoffice_users),
      billable_web_accesses     = coalesce((p.entitlements->''web''->>''billable'')::numeric, billable_web_accesses),
      entitlement_provenance    = coalesce(p.entitlements, entitlement_provenance),
      updated_at = now()
    WHERE id = _license_id;
  END IF;';

  IF position(_old in _def) = 0 THEN
    IF position('entitlement_provenance' in _def) > 0 THEN
      RETURN; -- already patched
    END IF;
    RAISE EXCEPTION 'close_renewal license block not found — aborting to avoid an unsafe rewrite';
  END IF;

  EXECUTE replace(_def, _old, _new);
END
$mig$;