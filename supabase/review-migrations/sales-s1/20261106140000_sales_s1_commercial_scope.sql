-- =====================================================================
-- Sales Module v1 — Sprint 1: Commercial Scope Foundation
-- REVIEW-ONLY. Not applied anywhere. Kept outside supabase/migrations on
-- purpose so no tooling picks it up automatically. Move into
-- supabase/migrations only after explicit approval for a named target.
--
-- Additive + backwards compatible:
--   * new nullable columns, no defaults, no reclassification of legacy rows
--   * legacy deals.partner_id untouched
--   * deals with sales_engine IS NULL / 'partner' / 'account' keep the
--     exact pre-Sprint-1 authorization expressions (Partner regression)
--   * only sales_engine = 'new_business' rows use the Direct rules
-- Run in ONE transaction. Rollback: 20261106140000_sales_s1_rollback.sql
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Explicit commercial context
-- ---------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS sales_engine text;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_sales_engine_check
  CHECK (sales_engine IS NULL OR sales_engine IN ('new_business', 'partner', 'account'));

COMMENT ON COLUMN public.deals.sales_engine IS
  'Commercial engine. NULL = legacy/unclassified (never inferred from partner_id). '
  'new_business = Direct Sales, partner = Partner Sales, account = reserved.';

-- ---------------------------------------------------------------------
-- 2. Canonical partner UUID bridge (expand phase; legacy partner_id kept)
-- ---------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS partner_uuid uuid REFERENCES public.partners(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS deals_partner_uuid_idx ON public.deals (partner_uuid);
CREATE INDEX IF NOT EXISTS deals_sales_engine_assigned_idx
  ON public.deals (sales_engine, assigned_user_id) WHERE sales_engine IS NOT NULL;

-- Bridge must never contradict the legacy value.
ALTER TABLE public.deals
  ADD CONSTRAINT deals_partner_uuid_matches_legacy
  CHECK (partner_uuid IS NULL OR partner_id IS NULL OR lower(partner_id) = partner_uuid::text);

-- Direct deals carry no partner scope at all.
ALTER TABLE public.deals
  ADD CONSTRAINT deals_direct_has_no_partner
  CHECK (sales_engine IS DISTINCT FROM 'new_business' OR (partner_id IS NULL AND partner_uuid IS NULL));

COMMENT ON COLUMN public.deals.partner_uuid IS
  'Canonical partner FK. Backfill only via reviewed script (unambiguous mappings); unresolved stay NULL.';

-- ---------------------------------------------------------------------
-- 3. Sales capability (reuses role templates + overrides)
--    hq_admin gets governed Sales admin; everyone else no_access.
--    Sellers/managers are granted per-user via user_module_permissions
--    overrides (view/edit = seller, admin = Sales Manager).
-- ---------------------------------------------------------------------
INSERT INTO public.role_permission_templates (role, module_key, access_level)
SELECT r.role::public.app_role, 'sales',
       CASE WHEN r.role = 'hq_admin' THEN 'admin' ELSE 'no_access' END
FROM (SELECT DISTINCT role::text AS role FROM public.role_permission_templates
      UNION SELECT 'hq_admin' UNION SELECT 'hq_standard') r
ON CONFLICT (role, module_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Shared authorization boundary
-- ---------------------------------------------------------------------
-- Active HQ identity (is_hq_user does not check is_active; Direct must).
CREATE OR REPLACE FUNCTION public.is_active_hq_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND public.is_hq_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = _user_id AND COALESCE(p.is_active, true) = true)
$$;

-- Direct row rule. _level: 'view' | 'edit'. Manager = sales admin.
CREATE OR REPLACE FUNCTION public.direct_deal_access(_user_id uuid, _assigned uuid, _level text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_hq_user(_user_id)
     AND (
       COALESCE(public.can_admin_module(_user_id, 'sales'), false)
       OR (
         _assigned IS NOT NULL AND _assigned = _user_id
         AND CASE _level
               WHEN 'edit' THEN COALESCE(public.can_edit_module(_user_id, 'sales'), false)
               ELSE COALESCE(public.can_view_module(_user_id, 'sales'), false)
             END
       )
     )
$$;

-- Single row-level decision used by deals RLS AND can_view/can_manage_deal.
-- Non-Direct branches are the verbatim pre-Sprint-1 expressions.
CREATE OR REPLACE FUNCTION public.deal_row_access(_engine text, _partner_id text, _assigned uuid, _level text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _engine = 'new_business' THEN public.direct_deal_access(auth.uid(), _assigned, _level)
    WHEN _level = 'view' THEN
      public.is_hq_user(auth.uid())
      OR (_partner_id IS NOT NULL AND public.can_view_partner(_partner_id::uuid))
    ELSE
      public.is_hq_user(auth.uid())
      OR (_partner_id IS NOT NULL AND _partner_id::uuid = public.get_user_partner_id(auth.uid()))
  END
$$;

CREATE OR REPLACE FUNCTION public.can_view_deal(_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = _deal_id
      AND public.deal_row_access(d.sales_engine, d.partner_id, d.assigned_user_id, 'view')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_deal(_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = _deal_id
      AND public.deal_row_access(d.sales_engine, d.partner_id, d.assigned_user_id, 'edit')
  )
$$;

-- deals RLS: replace HQ=>ALL bypass with the shared decision.
DROP POLICY IF EXISTS deals_select ON public.deals;
CREATE POLICY deals_select ON public.deals FOR SELECT TO authenticated
  USING (public.deal_row_access(sales_engine, partner_id, assigned_user_id, 'view'));

DROP POLICY IF EXISTS deals_insert ON public.deals;
CREATE POLICY deals_insert ON public.deals FOR INSERT TO authenticated
  WITH CHECK (public.deal_row_access(sales_engine, partner_id, assigned_user_id, 'edit'));

DROP POLICY IF EXISTS deals_update ON public.deals;
CREATE POLICY deals_update ON public.deals FOR UPDATE TO authenticated
  USING (public.deal_row_access(sales_engine, partner_id, assigned_user_id, 'edit'))
  WITH CHECK (public.deal_row_access(sales_engine, partner_id, assigned_user_id, 'edit'));

DROP POLICY IF EXISTS deals_delete ON public.deals;
CREATE POLICY deals_delete ON public.deals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin')
         AND (sales_engine IS DISTINCT FROM 'new_business'
              OR public.direct_deal_access(auth.uid(), assigned_user_id, 'edit')));
-- pg_probationary_denied (RESTRICTIVE) is left untouched.

-- ---------------------------------------------------------------------
-- 5. Scope-defining fields guard (current row AND proposed row)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deals_guard_commercial_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_mgr boolean;
  _touches_direct boolean;
BEGIN
  IF _actor IS NULL THEN RETURN NEW; END IF;  -- service/sync paths

  _touches_direct := NEW.sales_engine = 'new_business'
    OR (TG_OP = 'UPDATE' AND OLD.sales_engine = 'new_business');
  IF NOT _touches_direct THEN RETURN NEW; END IF;

  _is_mgr := public.is_active_hq_user(_actor)
             AND COALESCE(public.can_admin_module(_actor, 'sales'), false);

  IF TG_OP = 'UPDATE' AND NOT _is_mgr AND (
       NEW.sales_engine     IS DISTINCT FROM OLD.sales_engine
    OR NEW.partner_uuid     IS DISTINCT FROM OLD.partner_uuid
    OR NEW.partner_id       IS DISTINCT FROM OLD.partner_id
    OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id) THEN
    RAISE EXCEPTION 'DIRECT_SCOPE_FIELD_LOCKED: only a Sales Manager can change engine, partner or owner of a Direct deal'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NOT _is_mgr AND NEW.assigned_user_id IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'DIRECT_SCOPE_FIELD_LOCKED: a seller can only create Direct deals they own'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.sales_engine = 'new_business' AND NEW.assigned_user_id IS NOT NULL
     AND NOT (public.is_active_hq_user(NEW.assigned_user_id)
              AND COALESCE(public.can_view_module(NEW.assigned_user_id, 'sales'), false)) THEN
    RAISE EXCEPTION 'DIRECT_OWNER_NOT_ELIGIBLE: Direct deals can only be owned by active HQ Sales users'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_guard_commercial_scope ON public.deals;
CREATE TRIGGER trg_deals_guard_commercial_scope
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_guard_commercial_scope();

-- ---------------------------------------------------------------------
-- 6. Child records: deal_* tables, discovery, loss details, next steps,
--    stage gates, proposals, proposal_items and storage already delegate
--    to can_view_deal / can_manage_deal / *_proposal_source and therefore
--    inherit automatically. Analytics/ownership views are security_invoker.
--    manual_tasks has an HQ=>ALL bypass; add a RESTRICTIVE deal guard.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_direct_deal_ref(_related_type text, _entity uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _entity IS NOT NULL
     AND COALESCE(_related_type, '') IN ('deal', 'pipeline', 'opportunity')
     AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = _entity AND d.sales_engine = 'new_business')
$$;

DROP POLICY IF EXISTS manual_tasks_direct_scope_read ON public.manual_tasks;
CREATE POLICY manual_tasks_direct_scope_read ON public.manual_tasks
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.is_direct_deal_ref(related_type, related_entity_id)
         OR public.can_view_deal(related_entity_id));

DROP POLICY IF EXISTS manual_tasks_direct_scope_write ON public.manual_tasks;
CREATE POLICY manual_tasks_direct_scope_write ON public.manual_tasks
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_direct_deal_ref(related_type, related_entity_id)
         OR public.can_manage_deal(related_entity_id))
  WITH CHECK (NOT public.is_direct_deal_ref(related_type, related_entity_id)
              OR public.can_manage_deal(related_entity_id));

-- ---------------------------------------------------------------------
-- 7. Direct closing interlock (server-side, no new award path).
--    award_deal_proposal() is unchanged: it sets the deal to Won and
--    creates client/licence/contract/renewal inside one transaction, so
--    raising here rolls back every downstream insert.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deals_block_direct_closing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sales_engine = 'new_business'
     AND (NEW.stage = 'Won' OR NEW.status = 'Won')
     AND (TG_OP = 'INSERT'
          OR NEW.stage IS DISTINCT FROM OLD.stage
          OR NEW.status IS DISTINCT FROM OLD.status
          OR OLD.sales_engine IS DISTINCT FROM 'new_business') THEN
    RAISE EXCEPTION 'DIRECT_CLOSING_DISABLED: Direct Sales deals cannot be closed as Won yet'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_block_direct_closing ON public.deals;
CREATE TRIGGER trg_deals_block_direct_closing
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_block_direct_closing();

CREATE OR REPLACE FUNCTION public.block_direct_deal_operationalization()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.deal_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.deals d WHERE d.id = NEW.deal_id AND d.sales_engine = 'new_business') THEN
    IF TG_TABLE_NAME = 'proposals' AND NEW.status IS DISTINCT FROM 'Won' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'DIRECT_CLOSING_DISABLED: award/conversion is not available for Direct Sales deals yet'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licenses_block_direct ON public.licenses;
CREATE TRIGGER trg_licenses_block_direct
  BEFORE INSERT OR UPDATE OF deal_id ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.block_direct_deal_operationalization();

DROP TRIGGER IF EXISTS trg_proposals_block_direct_won ON public.proposals;
CREATE TRIGGER trg_proposals_block_direct_won
  BEFORE INSERT OR UPDATE OF status, deal_id ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.block_direct_deal_operationalization();

-- ---------------------------------------------------------------------
-- Grants: helpers are callable only by signed-in users.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_active_hq_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.direct_deal_access(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deal_row_access(text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_direct_deal_ref(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_hq_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.direct_deal_access(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deal_row_access(text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_direct_deal_ref(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.deals_guard_commercial_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deals_block_direct_closing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_direct_deal_operationalization() FROM PUBLIC, anon, authenticated;

COMMIT;
