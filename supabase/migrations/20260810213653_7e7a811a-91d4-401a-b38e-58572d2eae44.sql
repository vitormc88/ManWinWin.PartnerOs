
-- 1. Additive columns -------------------------------------------------------
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'deal',
  ADD COLUMN IF NOT EXISTS deal_id uuid,
  ADD COLUMN IF NOT EXISTS renewal_id uuid,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS partner_uuid uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS license_id uuid;

-- lead_id must be nullable for renewal-sourced proposals
ALTER TABLE public.proposals ALTER COLUMN lead_id DROP NOT NULL;

-- 2. Backfill existing rows as deal-sourced ---------------------------------
UPDATE public.proposals SET source_type = 'deal' WHERE source_type IS NULL;
UPDATE public.proposals SET deal_id = lead_id WHERE deal_id IS NULL AND lead_id IS NOT NULL;

-- 3. Constraints ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_source_type_check') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_source_type_check
      CHECK (source_type IN ('deal','renewal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_source_identity_check') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_source_identity_check
      CHECK (
        (source_type = 'deal' AND deal_id IS NOT NULL AND renewal_id IS NULL)
        OR (source_type = 'renewal' AND renewal_id IS NOT NULL AND client_id IS NOT NULL AND lead_id IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_deal_id_fkey') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_renewal_id_fkey') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_renewal_id_fkey
      FOREIGN KEY (renewal_id) REFERENCES public.renewals(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_client_id_fkey') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_partner_uuid_fkey') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_partner_uuid_fkey
      FOREIGN KEY (partner_uuid) REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposals_deal_id ON public.proposals(deal_id);
CREATE INDEX IF NOT EXISTS idx_proposals_renewal_id ON public.proposals(renewal_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client_id ON public.proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_partner_uuid ON public.proposals(partner_uuid);
CREATE INDEX IF NOT EXISTS idx_proposals_source_type ON public.proposals(source_type);

-- 4. Source-aware authorization helpers -------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_proposal_source(_source_type text, _deal_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_source_type,'deal') = 'deal'
      THEN _deal_id IS NOT NULL AND public.can_view_deal(_deal_id)
    ELSE public.is_hq_user(auth.uid())
      OR (_partner_uuid IS NOT NULL AND public.can_view_partner(_partner_uuid))
  END
$$;

CREATE OR REPLACE FUNCTION public.can_manage_proposal_source(_source_type text, _deal_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_source_type,'deal') = 'deal'
      THEN _deal_id IS NOT NULL AND public.can_manage_deal(_deal_id)
    ELSE public.is_hq_user(auth.uid())
      OR (_partner_uuid IS NOT NULL AND _partner_uuid = public.get_user_partner_id(auth.uid()))
  END
$$;

REVOKE ALL ON FUNCTION public.can_view_proposal_source(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_proposal_source(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_proposal_source(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_proposal_source(text, uuid, uuid) TO authenticated, service_role;

-- 5. Grants (explicit, authenticated + service_role only) -------------------
REVOKE ALL ON public.proposals FROM anon;
REVOKE ALL ON public.proposal_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_items TO authenticated;
GRANT ALL ON public.proposals TO service_role;
GRANT ALL ON public.proposal_items TO service_role;

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

-- 6. Source-aware policies ---------------------------------------------------
DROP POLICY IF EXISTS proposals_select ON public.proposals;
DROP POLICY IF EXISTS proposals_insert ON public.proposals;
DROP POLICY IF EXISTS proposals_update ON public.proposals;
DROP POLICY IF EXISTS proposals_delete ON public.proposals;

CREATE POLICY proposals_select ON public.proposals FOR SELECT TO authenticated
  USING (public.can_view_proposal_source(source_type, deal_id, partner_uuid));
CREATE POLICY proposals_insert ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_proposal_source(source_type, deal_id, partner_uuid));
CREATE POLICY proposals_update ON public.proposals FOR UPDATE TO authenticated
  USING (public.can_manage_proposal_source(source_type, deal_id, partner_uuid))
  WITH CHECK (public.can_manage_proposal_source(source_type, deal_id, partner_uuid));
CREATE POLICY proposals_delete ON public.proposals FOR DELETE TO authenticated
  USING (public.can_manage_proposal_source(source_type, deal_id, partner_uuid));

DROP POLICY IF EXISTS proposal_items_select ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_insert ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_update ON public.proposal_items;
DROP POLICY IF EXISTS proposal_items_delete ON public.proposal_items;

CREATE POLICY proposal_items_select ON public.proposal_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_view_proposal_source(p.source_type, p.deal_id, p.partner_uuid)));
CREATE POLICY proposal_items_insert ON public.proposal_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.partner_uuid)));
CREATE POLICY proposal_items_update ON public.proposal_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.partner_uuid)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.partner_uuid)));
CREATE POLICY proposal_items_delete ON public.proposal_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id
    AND public.can_manage_proposal_source(p.source_type, p.deal_id, p.partner_uuid)));
