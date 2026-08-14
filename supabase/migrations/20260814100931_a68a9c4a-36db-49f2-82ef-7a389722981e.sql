
-- Authorization helpers for proposal document objects.
-- Object key layout: {source_anchor_id}/{proposal_id}/{file}.docx
CREATE OR REPLACE FUNCTION public.can_view_proposal_document(_proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposals p
    WHERE p.id = _proposal_id
      AND (
        CASE
          WHEN p.source_type = 'deal' OR p.source_type IS NULL
            THEN public.can_view_deal(COALESCE(p.deal_id, p.lead_id))
          ELSE public.can_access_client_proposal(p.client_id, p.partner_uuid)
        END
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_proposal_document(_proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposals p
    WHERE p.id = _proposal_id
      AND (
        CASE
          WHEN p.source_type = 'deal' OR p.source_type IS NULL
            THEN public.can_manage_deal(COALESCE(p.deal_id, p.lead_id))
          ELSE public.can_access_client_proposal(p.client_id, p.partner_uuid)
        END
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_proposal_document(uuid) FROM public;
REVOKE ALL ON FUNCTION public.can_manage_proposal_document(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_view_proposal_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_proposal_document(uuid) TO authenticated;

-- Replace the deal-only storage policies with proposal-scoped ones.
DROP POLICY IF EXISTS proposals_storage_select ON storage.objects;
DROP POLICY IF EXISTS proposals_storage_insert ON storage.objects;
DROP POLICY IF EXISTS proposals_storage_update ON storage.objects;
DROP POLICY IF EXISTS proposals_storage_delete ON storage.objects;

CREATE POLICY proposals_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_view_proposal_document(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY proposals_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_proposal_document(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY proposals_storage_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_proposal_document(((storage.foldername(name))[2])::uuid)
)
WITH CHECK (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_proposal_document(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY proposals_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_manage_proposal_document(((storage.foldername(name))[2])::uuid)
);
