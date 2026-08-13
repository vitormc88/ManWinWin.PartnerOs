-- 1. Allow a client-sourced proposal (existing customer, no deal, no renewal)
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_source_type_check;
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_source_identity_check;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_source_type_check
  CHECK (source_type = ANY (ARRAY['deal'::text, 'renewal'::text, 'client'::text]));

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_source_identity_check
  CHECK (
    (source_type = 'deal'     AND deal_id IS NOT NULL AND renewal_id IS NULL)
    OR (source_type = 'renewal' AND renewal_id IS NOT NULL AND client_id IS NOT NULL AND lead_id IS NULL)
    OR (source_type = 'client'  AND client_id IS NOT NULL AND renewal_id IS NULL AND lead_id IS NULL AND deal_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_proposals_client_id ON public.proposals (client_id);

-- 2. Canonical authorization helper for client-sourced proposals.
CREATE OR REPLACE FUNCTION public.can_access_client_proposal(_client_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = _client_id
      AND (
        public.is_hq_user(auth.uid())
        OR (
          c.partner_id IS NOT NULL
          AND c.partner_id::uuid = public.get_user_partner_id(auth.uid())
          -- a partner user may never label the proposal with another partner
          AND (_partner_uuid IS NULL OR _partner_uuid = c.partner_id::uuid)
        )
      )
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.can_access_client_proposal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_client_proposal(uuid, uuid) TO authenticated, service_role;

-- 3. Extend the canonical proposal-source helpers (reused by proposals + proposal_items RLS).
CREATE OR REPLACE FUNCTION public.can_manage_proposal_source(_source_type text, _deal_id uuid, _renewal_id uuid, _client_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE COALESCE(_source_type,'deal')
    WHEN 'deal'   THEN _deal_id IS NOT NULL AND public.can_manage_deal(_deal_id)
    WHEN 'client' THEN _client_id IS NOT NULL AND public.can_access_client_proposal(_client_id, _partner_uuid)
    ELSE public.can_access_renewal_proposal(_renewal_id, _client_id, _partner_uuid)
  END
$function$;

CREATE OR REPLACE FUNCTION public.can_view_proposal_source(_source_type text, _deal_id uuid, _renewal_id uuid, _client_id uuid, _partner_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE COALESCE(_source_type,'deal')
    WHEN 'deal'   THEN _deal_id IS NOT NULL AND public.can_view_deal(_deal_id)
    WHEN 'client' THEN _client_id IS NOT NULL AND public.can_view_client(_client_id)
    ELSE public.can_access_renewal_proposal(_renewal_id, _client_id, _partner_uuid)
  END
$function$;

-- 4. Authorship is server-derived, never trusted from the client payload.
CREATE OR REPLACE FUNCTION public.proposals_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_proposals_set_created_by ON public.proposals;
CREATE TRIGGER trg_proposals_set_created_by
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.proposals_set_created_by();

-- 5. Re-assert INSERT policy including authorship validation.
DROP POLICY IF EXISTS proposals_insert ON public.proposals;
CREATE POLICY proposals_insert ON public.proposals
FOR INSERT TO authenticated
WITH CHECK (
  can_manage_proposal_source(source_type, deal_id, renewal_id, client_id, partner_uuid)
  AND (created_by IS NULL OR created_by = auth.uid())
);