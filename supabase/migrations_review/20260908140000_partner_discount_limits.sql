-- Configurable proposal discount limits PER PARTNER (production-ready, additive).
-- REVIEW-ONLY: this file is not executed by the Lovable TEST project. It must be
-- reviewed and applied explicitly against the production project.
--
-- Adds a small dedicated settings table so that HQ Admin is the only role that
-- can write these limits, without widening or changing existing partner
-- permissions. Partner users may read their OWN partner's row.
--
-- Semantics (must match src/lib/proposal-discount-policy.ts):
--   * NULL column  => use the default limit.
--   * Explicit 0   => zero, never a fallback.
--   * Valid range  => 0..100 inclusive.
--   * Defaults stay exactly: HQ 100/100; any partner software 10;
--     Implementer services 100; other/unknown partner level services 10.
--   * HQ users always keep 100/100, even on partner-owned opportunities.
--   * The acting partner is resolved from auth.uid(), never from record data.
--
-- Rollout is value-preserving: no rows are created, so every partner keeps
-- exactly its current effective limits until HQ configures an override.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight. Fail loudly instead of half-applying: the settings table is only
-- meaningful if the existing server-side discount guard (functions + triggers)
-- is actually installed here. Helper signatures are the repository ones:
--   public.is_hq_user(_user_id uuid)
--   public.get_user_partner_id(_user_id uuid)
--   public.has_role(_user_id uuid, _role app_role)
--   public.set_updated_at()   -- the project's updated_at trigger helper
-- ---------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regprocedure('public.is_hq_user(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.is_hq_user(uuid) is missing';
  END IF;
  IF to_regprocedure('public.get_user_partner_id(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.get_user_partner_id(uuid) is missing';
  END IF;
  IF to_regprocedure('public.has_role(uuid, app_role)') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.has_role(uuid, app_role) is missing';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.set_updated_at() is missing';
  END IF;
  IF to_regprocedure('private.proposal_discount_limits()') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: private.proposal_discount_limits() is missing — the discount guard is not installed here';
  END IF;
  IF to_regprocedure('private.enforce_proposal_item_discounts()') IS NULL
     OR to_regprocedure('private.enforce_proposal_business_discounts()') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: proposal discount enforcement functions are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public' AND c.relname = 'proposal_items'
      AND t.tgname = 'trg_enforce_proposal_item_discounts'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: trigger trg_enforce_proposal_item_discounts is missing on public.proposal_items — overrides would not be enforced';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public' AND c.relname = 'proposals'
      AND t.tgname = 'trg_enforce_proposal_business_discounts'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: trigger trg_enforce_proposal_business_discounts is missing on public.proposals — overrides would not be enforced';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.partner_discount_limits (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  max_software_discount_pct numeric,
  max_services_discount_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_discount_limits_software_range
    CHECK (max_software_discount_pct IS NULL
           OR (max_software_discount_pct >= 0 AND max_software_discount_pct <= 100)),
  CONSTRAINT partner_discount_limits_services_range
    CHECK (max_services_discount_pct IS NULL
           OR (max_services_discount_pct >= 0 AND max_services_discount_pct <= 100))
);

COMMENT ON TABLE public.partner_discount_limits IS
  'HQ-Admin-managed per-partner maximum proposal discount percentages. NULL = use default.';

-- Default privileges in this project have previously granted excessive access:
-- strip everything first, then grant the strict minimum.
REVOKE ALL ON public.partner_discount_limits FROM PUBLIC;
REVOKE ALL ON public.partner_discount_limits FROM anon;
REVOKE ALL ON public.partner_discount_limits FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_discount_limits TO authenticated;
GRANT ALL ON public.partner_discount_limits TO service_role;

ALTER TABLE public.partner_discount_limits ENABLE ROW LEVEL SECURITY;

-- Read: HQ users see all; partner users see only their own partner's limits.
DROP POLICY IF EXISTS "discount limits readable by hq and own partner"
  ON public.partner_discount_limits;
CREATE POLICY "discount limits readable by hq and own partner"
ON public.partner_discount_limits
FOR SELECT
TO authenticated
USING (
  public.is_hq_user(auth.uid())
  OR partner_id = public.get_user_partner_id(auth.uid())
);

-- Write: confirmed HQ Admin only, mirroring AuthContext's isAdmin
-- (hq_admin role AND a confirmed HQ profile) — never the role alone.
DROP POLICY IF EXISTS "discount limits writable by hq admin"
  ON public.partner_discount_limits;
CREATE POLICY "discount limits writable by hq admin"
ON public.partner_discount_limits
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'hq_admin') AND public.is_hq_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'hq_admin') AND public.is_hq_user(auth.uid())
);

DROP TRIGGER IF EXISTS trg_partner_discount_limits_updated_at
  ON public.partner_discount_limits;
CREATE TRIGGER trg_partner_discount_limits_updated_at
BEFORE UPDATE ON public.partner_discount_limits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Resolve overrides inside the existing server-side discount guard.
-- Only the limits resolution changes; the triggers, their contracts and every
-- pricing / commission / renewal behaviour stay exactly as they are.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.proposal_discount_limits()
RETURNS TABLE(software_max numeric, services_max numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_hq boolean := false;
  _partner_id uuid;
  _level text;
  _ov_sw numeric;
  _ov_sv numeric;
BEGIN
  IF _uid IS NULL THEN
    software_max := 100; services_max := 100; RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(p.is_hq, false), p.partner_id
    INTO _is_hq, _partner_id
  FROM public.profiles p
  WHERE p.id = _uid;

  _is_hq := COALESCE(_is_hq, false) AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid AND ur.role IN ('hq_admin', 'hq_standard')
  );

  IF _is_hq THEN
    software_max := 100; services_max := 100; RETURN NEXT; RETURN;
  END IF;

  SELECT pa.partnership_level INTO _level
  FROM public.partners pa
  WHERE pa.id = _partner_id;

  software_max := 10;
  services_max := CASE WHEN COALESCE(_level, '') ILIKE '%implement%' THEN 100 ELSE 10 END;

  SELECT dl.max_software_discount_pct, dl.max_services_discount_pct
    INTO _ov_sw, _ov_sv
  FROM public.partner_discount_limits dl
  WHERE dl.partner_id = _partner_id;

  IF _ov_sw IS NOT NULL AND _ov_sw >= 0 AND _ov_sw <= 100 THEN
    software_max := _ov_sw;
  END IF;
  IF _ov_sv IS NOT NULL AND _ov_sv >= 0 AND _ov_sv <= 100 THEN
    services_max := _ov_sv;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.proposal_discount_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.proposal_discount_limits() FROM anon;
REVOKE ALL ON FUNCTION private.proposal_discount_limits() FROM authenticated;

COMMIT;
