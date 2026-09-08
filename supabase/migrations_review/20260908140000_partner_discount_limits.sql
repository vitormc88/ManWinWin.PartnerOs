-- Configurable proposal discount limits PER PARTNER (production-ready, additive).
-- REVIEW-ONLY: this file is not executed by the Lovable TEST project. It must be
-- reviewed and applied explicitly against the production project
-- qownzparzsaeoyccgwuj. It is NOT applied to the connected TEST database.
--
-- Written against VERIFIED production state (read-only inspection):
--   resolver : private.current_proposal_discount_limits()
--              RETURNS TABLE(software_limit numeric, services_limit numeric)
--              SECURITY DEFINER, search_path = pg_catalog, public
--   guards   : private.enforce_proposal_discount_limits()        -> public.proposals
--              private.enforce_proposal_item_discount_limits()   -> public.proposal_items
--   triggers : enforce_proposal_discount_limits       (BEFORE INSERT OR UPDATE)
--              enforce_proposal_item_discount_limits  (BEFORE INSERT OR UPDATE)
-- Both guards call the resolver, so overriding the resolver is enough: the
-- guards and triggers are intentionally left untouched by this migration.
-- (the older review-only helper name does NOT exist in production and is not
-- referenced here.)
--
-- Semantics (must match src/lib/proposal-discount-policy.ts):
--   * NULL column  => use the default limit.
--   * Explicit 0   => zero, never a fallback.
--   * Valid range  => 0..100 inclusive.
--   * Defaults stay exactly: auth.uid() NULL => 100/100; confirmed HQ
--     (profiles.is_hq AND hq_admin/hq_standard) => 100/100;
--     lower(coalesce(partnership_level,'')) = 'implementer' => 10/100;
--     everything else => 10/10.
--   * HQ users always keep 100/100, even on partner-owned opportunities.
--   * The acting partner is resolved from the authenticated profile
--     (profiles.partner_id for auth.uid()), never from record data.
--
-- Rollout is value-preserving: no rows are created, so every partner keeps
-- exactly its current effective limits until HQ configures an override.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight against the ACTUAL production objects. Fail loudly rather than
-- half-apply: the settings table only means anything if the real resolver,
-- guards and triggers are present.
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

  IF to_regprocedure('private.current_proposal_discount_limits()') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: private.current_proposal_discount_limits() is missing — the discount guard is not installed here';
  END IF;
  IF to_regprocedure('private.enforce_proposal_discount_limits()') IS NULL
     OR to_regprocedure('private.enforce_proposal_item_discount_limits()') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: proposal discount enforcement functions are missing';
  END IF;

  -- The resolver contract this migration replaces: exact output column names.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'current_proposal_discount_limits'
      AND p.proargnames @> ARRAY['software_limit', 'services_limit']
  ) THEN
    RAISE EXCEPTION 'Preflight failed: private.current_proposal_discount_limits() does not expose (software_limit, services_limit)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
      AND n.nspname = 'public' AND c.relname = 'proposal_items'
      AND t.tgname = 'enforce_proposal_item_discount_limits'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: enabled trigger enforce_proposal_item_discount_limits is missing on public.proposal_items — overrides would not be enforced';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
      AND n.nspname = 'public' AND c.relname = 'proposals'
      AND t.tgname = 'enforce_proposal_discount_limits'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: enabled trigger enforce_proposal_discount_limits is missing on public.proposals — overrides would not be enforced';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- Settings table. A small dedicated table keeps HQ-Admin-only writes possible
-- without widening or changing any existing partner permission.
-- ---------------------------------------------------------------------------
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

-- updated_at maintenance. Neither public.update_updated_at_column() nor
-- public.update_updated_at() exists in production, so this migration owns a
-- minimal private helper instead of inventing a public one.
CREATE OR REPLACE FUNCTION private.partner_discount_limits_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.partner_discount_limits_touch() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.partner_discount_limits_touch() FROM anon;
REVOKE ALL ON FUNCTION private.partner_discount_limits_touch() FROM authenticated;

DROP TRIGGER IF EXISTS partner_discount_limits_touch
  ON public.partner_discount_limits;
CREATE TRIGGER partner_discount_limits_touch
BEFORE UPDATE ON public.partner_discount_limits
FOR EACH ROW EXECUTE FUNCTION private.partner_discount_limits_touch();

-- ---------------------------------------------------------------------------
-- Resolve overrides inside the ACTUAL production resolver, preserving its
-- signature, output column names, volatility and security context. The two
-- guard functions and their triggers are deliberately NOT modified, so
-- pricing, commissions, renewal flags and issued proposal data are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.current_proposal_discount_limits()
RETURNS TABLE(software_limit numeric, services_limit numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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
    software_limit := 100;
    services_limit := 100;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coalesce(p.is_hq, false), p.partner_id
    INTO _is_hq, _partner_id
  FROM public.profiles p
  WHERE p.id = _uid;

  _is_hq := coalesce(_is_hq, false) AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.role IN ('hq_admin', 'hq_standard')
  );

  IF _is_hq THEN
    software_limit := 100;
    services_limit := 100;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT pa.partnership_level INTO _level
  FROM public.partners pa
  WHERE pa.id = _partner_id;

  -- Unchanged default semantics.
  software_limit := 10;
  services_limit := CASE
    WHEN lower(coalesce(_level, '')) = 'implementer' THEN 100
    ELSE 10
  END;

  -- Per-partner overrides for the AUTHENTICATED actor's partner only.
  SELECT dl.max_software_discount_pct, dl.max_services_discount_pct
    INTO _ov_sw, _ov_sv
  FROM public.partner_discount_limits dl
  WHERE dl.partner_id = _partner_id;

  IF _ov_sw IS NOT NULL AND _ov_sw >= 0 AND _ov_sw <= 100 THEN
    software_limit := _ov_sw;   -- explicit 0 means zero, never a fallback
  END IF;
  IF _ov_sv IS NOT NULL AND _ov_sv >= 0 AND _ov_sv <= 100 THEN
    services_limit := _ov_sv;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.current_proposal_discount_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_proposal_discount_limits() FROM anon;
REVOKE ALL ON FUNCTION private.current_proposal_discount_limits() FROM authenticated;

COMMIT;
