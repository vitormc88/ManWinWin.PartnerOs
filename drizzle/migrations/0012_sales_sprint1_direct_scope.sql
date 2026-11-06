-- Sales Sprint 1: explicit commercial scope + Direct (new_business) authorization through the shared deal boundary.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS sales_engine text NULL;
ALTER TABLE public.deals ADD CONSTRAINT deals_sales_engine_check CHECK (sales_engine IS NULL OR sales_engine IN ('new_business','partner','account'));
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS partner_uuid uuid NULL REFERENCES public.partners(id);
COMMENT ON COLUMN public.deals.sales_engine IS 'Explicit commercial engine. NULL = legacy/unclassified (never inferred). account is reserved.';
COMMENT ON COLUMN public.deals.partner_uuid IS 'Verified uuid mapping of legacy text partner_id; derived only from an exact partners.id match.';
CREATE INDEX IF NOT EXISTS deals_sales_engine_idx ON public.deals (sales_engine);
CREATE INDEX IF NOT EXISTS deals_partner_uuid_idx ON public.deals (partner_uuid);

-- Verified mapping only: exact textual match to an existing partner id. Unresolved stay NULL.
UPDATE public.deals d SET partner_uuid = p.id
  FROM public.partners p
 WHERE d.partner_uuid IS NULL AND d.partner_id IS NOT NULL AND p.id::text = lower(btrim(d.partner_id));

-- Internal Sales capability from the existing module permission architecture ('sales' module).
CREATE OR REPLACE FUNCTION public.sales_capability(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN 'none'
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.is_hq IS TRUE
                       AND p.is_active IS NOT FALSE AND p.partner_id IS NULL) THEN 'none'
    WHEN NOT public.is_hq_user(_uid) THEN 'none'
    WHEN public.has_role(_uid, 'hq_admin') THEN 'manager'
    WHEN COALESCE(public.can_admin_module(_uid, 'sales'), false) THEN 'manager'
    WHEN COALESCE(public.can_edit_module(_uid, 'sales'), false) THEN 'edit'
    WHEN COALESCE(public.can_view_module(_uid, 'sales'), false) THEN 'view'
    ELSE 'none'
  END
$$;

-- Single shared row-level deal boundary (used by deals RLS and can_view_deal/can_manage_deal).
CREATE OR REPLACE FUNCTION public.deal_row_access(_uid uuid, _engine text, _partner_id text, _assigned uuid, _mode text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    WHEN _engine = 'new_business' THEN
      CASE public.sales_capability(_uid)
        WHEN 'manager' THEN true
        WHEN 'edit' THEN _assigned = _uid
        WHEN 'view' THEN _mode = 'view' AND _assigned = _uid
        ELSE false END
    WHEN _engine = 'account' THEN public.sales_capability(_uid) = 'manager'
    WHEN _mode = 'view' THEN
      public.is_hq_user(_uid) OR (_partner_id IS NOT NULL AND public.can_view_partner(_partner_id::uuid))
    ELSE
      public.is_hq_user(_uid) OR (_partner_id IS NOT NULL AND _partner_id::uuid = public.get_user_partner_id(_uid))
  END
$$;

CREATE OR REPLACE FUNCTION public.can_view_deal(_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = _deal_id
    AND public.deal_row_access(auth.uid(), d.sales_engine, d.partner_id, d.assigned_user_id, 'view'))
$$;

CREATE OR REPLACE FUNCTION public.can_manage_deal(_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = _deal_id
    AND public.deal_row_access(auth.uid(), d.sales_engine, d.partner_id, d.assigned_user_id, 'manage'))
$$;

CREATE OR REPLACE FUNCTION public.my_sales_capability()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.sales_capability(auth.uid())
$$;

-- Eligible Direct owners: managers see all eligible active HQ Sales users; sellers see only themselves.
CREATE OR REPLACE FUNCTION public.list_direct_sales_owners()
RETURNS TABLE(id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name FROM public.profiles p
   WHERE public.sales_capability(p.id) IN ('edit','manager')
     AND (public.sales_capability(auth.uid()) = 'manager' OR p.id = auth.uid())
   ORDER BY p.full_name
$$;

DROP POLICY IF EXISTS deals_select ON public.deals;
DROP POLICY IF EXISTS deals_insert ON public.deals;
DROP POLICY IF EXISTS deals_update ON public.deals;
CREATE POLICY deals_select ON public.deals FOR SELECT TO authenticated
  USING (public.deal_row_access(auth.uid(), sales_engine, partner_id, assigned_user_id, 'view'));
CREATE POLICY deals_insert ON public.deals FOR INSERT TO authenticated
  WITH CHECK (public.deal_row_access(auth.uid(), sales_engine, partner_id, assigned_user_id, 'manage'));
CREATE POLICY deals_update ON public.deals FOR UPDATE TO authenticated
  USING (public.deal_row_access(auth.uid(), sales_engine, partner_id, assigned_user_id, 'manage'))
  WITH CHECK (public.deal_row_access(auth.uid(), sales_engine, partner_id, assigned_user_id, 'manage'));

-- Scope integrity + Direct closing interlock (validates OLD and NEW).
CREATE OR REPLACE FUNCTION public.guard_deal_commercial_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _cap text;
  _direct boolean := NEW.sales_engine = 'new_business' OR (TG_OP = 'UPDATE' AND OLD.sales_engine = 'new_business');
BEGIN
  -- partner_uuid is always derived from a verified exact match of partner_id (never set independently).
  NEW.partner_uuid := (SELECT p.id FROM public.partners p WHERE NEW.partner_id IS NOT NULL AND p.id::text = lower(btrim(NEW.partner_id)));

  IF NOT _direct THEN RETURN NEW; END IF;

  -- Direct closing is not enabled (server-side interlock; also blocks Award & Convert, which sets Won).
  IF NEW.sales_engine = 'new_business' AND (NEW.stage = 'Won' OR NEW.status = 'Won')
     AND (TG_OP = 'INSERT' OR OLD.stage IS DISTINCT FROM NEW.stage OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'DIRECT_CLOSING_NOT_ENABLED: Direct Sales closing (Won / Award & Convert) is not enabled yet';
  END IF;

  IF NEW.sales_engine = 'new_business' AND NEW.partner_id IS NOT NULL THEN
    RAISE EXCEPTION 'DIRECT_DEAL_HAS_NO_PARTNER: Direct Sales opportunities cannot be linked to a partner';
  END IF;

  IF _actor IS NULL THEN RETURN NEW; END IF; -- privileged maintenance context

  _cap := public.sales_capability(_actor);
  IF _cap <> 'manager' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.assigned_user_id IS NULL THEN NEW.assigned_user_id := _actor; END IF;
      IF NEW.assigned_user_id <> _actor THEN
        RAISE EXCEPTION 'DIRECT_SCOPE_FORBIDDEN: only a Sales Manager can assign Direct opportunities to another seller';
      END IF;
    ELSIF OLD.sales_engine IS DISTINCT FROM NEW.sales_engine
       OR OLD.partner_id IS DISTINCT FROM NEW.partner_id
       OR OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id THEN
      RAISE EXCEPTION 'DIRECT_SCOPE_FORBIDDEN: only a Sales Manager can change the Sales Owner or commercial scope';
    END IF;
  END IF;

  IF NEW.sales_engine = 'new_business'
     AND (TG_OP = 'INSERT' OR OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id OR OLD.sales_engine IS DISTINCT FROM NEW.sales_engine)
     AND (NEW.assigned_user_id IS NULL OR public.sales_capability(NEW.assigned_user_id) NOT IN ('edit','manager')) THEN
    RAISE EXCEPTION 'DIRECT_OWNER_INELIGIBLE: Sales Owner must be an active HQ Sales user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_deal_commercial_scope ON public.deals;
CREATE TRIGGER trg_guard_deal_commercial_scope BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.guard_deal_commercial_scope();

-- Proposal-level interlock: a Direct deal's proposal cannot become Won.
CREATE OR REPLACE FUNCTION public.guard_direct_proposal_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Won' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.deal_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = NEW.deal_id AND d.sales_engine = 'new_business') THEN
    RAISE EXCEPTION 'DIRECT_CLOSING_NOT_ENABLED: Direct Sales closing (Won / Award & Convert) is not enabled yet';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_direct_proposal_won ON public.proposals;
CREATE TRIGGER trg_guard_direct_proposal_won BEFORE INSERT OR UPDATE OF status ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_proposal_won();

REVOKE ALL ON FUNCTION public.sales_capability(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deal_row_access(uuid, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_sales_capability() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_direct_sales_owners() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_deal_commercial_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_direct_proposal_won() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_capability(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deal_row_access(uuid, text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_sales_capability() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_direct_sales_owners() TO authenticated, service_role;