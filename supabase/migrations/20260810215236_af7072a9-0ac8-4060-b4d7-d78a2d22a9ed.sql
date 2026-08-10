-- 1. Deletion semantics: renewal proposals require a non-null renewal_id
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_renewal_id_fkey;
ALTER TABLE public.proposals ADD CONSTRAINT proposals_renewal_id_fkey
  FOREIGN KEY (renewal_id) REFERENCES public.renewals(id) ON DELETE RESTRICT;

-- 2. Relationship-derived, source-aware authorization ------------------------
DROP FUNCTION IF EXISTS public.can_view_proposal_source(text, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_proposal_source(text, uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.renewal_canonical_partner(_renewal_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(r.partner_uuid, c.partner_uuid)
  FROM public.renewals r
  LEFT JOIN public.clients c ON c.id = r.client_id
  WHERE r.id = _renewal_id
$$;

CREATE OR REPLACE FUNCTION public.can_access_renewal_proposal(_renewal_id uuid, _client_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.renewals r
    LEFT JOIN public.clients c ON c.id = r.client_id
    WHERE r.id = _renewal_id
      AND r.client_id = _client_id
      AND (
        public.is_hq_user(auth.uid())
        OR (
          COALESCE(r.partner_uuid, c.partner_uuid) IS NOT NULL
          AND COALESCE(r.partner_uuid, c.partner_uuid) = _partner_uuid
          AND COALESCE(r.partner_uuid, c.partner_uuid) = public.get_user_partner_id(auth.uid())
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_proposal_source(_source_type text, _deal_id uuid, _renewal_id uuid, _client_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_source_type,'deal') = 'deal'
      THEN _deal_id IS NOT NULL AND public.can_view_deal(_deal_id)
    ELSE public.can_access_renewal_proposal(_renewal_id, _client_id, _partner_uuid)
  END
$$;

CREATE OR REPLACE FUNCTION public.can_manage_proposal_source(_source_type text, _deal_id uuid, _renewal_id uuid, _client_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_source_type,'deal') = 'deal'
      THEN _deal_id IS NOT NULL AND public.can_manage_deal(_deal_id)
    ELSE public.can_access_renewal_proposal(_renewal_id, _client_id, _partner_uuid)
  END
$$;

REVOKE ALL ON FUNCTION public.renewal_canonical_partner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_renewal_proposal(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_proposal_source(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_proposal_source(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renewal_canonical_partner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_renewal_proposal(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_proposal_source(text, uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_proposal_source(text, uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- 3. Recreate source-aware policies (dropped by CASCADE) --------------------
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.proposals FROM anon;
REVOKE ALL ON public.proposal_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_items TO authenticated;
GRANT ALL ON public.proposals TO service_role;
GRANT ALL ON public.proposal_items TO service_role;

DROP POLICY IF EXISTS proposals_select ON public.proposals;
DROP POLICY IF EXISTS proposals_insert ON public.proposals;
DROP POLICY IF EXISTS proposals_update ON public.proposals;
DROP POLICY IF EXISTS proposals_delete ON public.proposals;

CREATE POLICY proposals_select ON public.proposals FOR SELECT TO authenticated
  USING (public.can_view_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));
CREATE POLICY proposals_insert ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));
CREATE POLICY proposals_update ON public.proposals FOR UPDATE TO authenticated
  USING (public.can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid))
  WITH CHECK (public.can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));
CREATE POLICY proposals_delete ON public.proposals FOR DELETE TO authenticated
  USING (public.can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid));

DROP POLICY IF EXISTS proposal_items_select ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_insert ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_update ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_delete ON public.proposal_items;

CREATE POLICY proposal_items_select ON public.proposal_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_view_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)));
CREATE POLICY proposal_items_insert ON public.proposal_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)));
CREATE POLICY proposal_items_update ON public.proposal_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)));
CREATE POLICY proposal_items_delete ON public.proposal_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.renewal_id, p.client_id, p.partner_uuid)));

-- 4. Atomic link + activity RPC ---------------------------------------------
CREATE OR REPLACE FUNCTION public.link_renewal_proposal(
  _renewal_id uuid,
  _proposal_id uuid,
  _action text,
  _performed_by text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prop public.proposals%ROWTYPE;
  _linked uuid;
BEGIN
  SELECT * INTO _prop FROM public.proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found', _proposal_id USING ERRCODE = 'no_data_found';
  END IF;
  IF _prop.renewal_id IS DISTINCT FROM _renewal_id THEN
    RAISE EXCEPTION 'Proposal % does not belong to renewal %', _proposal_id, _renewal_id;
  END IF;
  IF NOT public.can_access_renewal_proposal(_prop.renewal_id, _prop.client_id, _prop.partner_uuid) THEN
    RAISE EXCEPTION 'Not authorized for renewal %', _renewal_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _action NOT IN ('proposal_created','proposal_updated') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  -- Link only when unlinked, or when already pointing at this proposal.
  UPDATE public.renewals
     SET source_proposal_id = _proposal_id
   WHERE id = _renewal_id
     AND source_proposal_id IS NULL;

  SELECT source_proposal_id INTO _linked FROM public.renewals WHERE id = _renewal_id;

  INSERT INTO public.renewal_activities (renewal_id, action, performed_by, notes)
  VALUES (_renewal_id, _action, _performed_by, _notes);

  RETURN _linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_renewal_proposal(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_renewal_proposal(uuid, uuid, text, text, text) TO authenticated, service_role;