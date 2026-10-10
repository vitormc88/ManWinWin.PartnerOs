-- Partner Growth Sprint 3 / Document Studio: auditable strategic proposal drafts.
-- TEST first. Legal agreements and NDA emission require future approved templates.
BEGIN;
CREATE TABLE IF NOT EXISTS public.partner_prospect_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE RESTRICT,
  document_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  document_type text NOT NULL DEFAULT 'strategic_proposal'
    CHECK (document_type IN ('strategic_proposal')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 240),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','pt')),
  content_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(content_snapshot)='object' AND jsonb_typeof(content_snapshot->'sections')='array'
    AND jsonb_array_length(content_snapshot->'sections')>=4
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  CONSTRAINT partner_prospect_documents_version_unique UNIQUE (document_group_id,version),
  CONSTRAINT partner_prospect_document_approval_consistency CHECK (
    (status='draft' AND approved_by IS NULL AND approved_at IS NULL) OR
    (status='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS partner_prospect_documents_prospect_idx
  ON public.partner_prospect_documents(prospect_id,created_at DESC);
ALTER TABLE public.partner_prospect_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_prospect_documents FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.partner_prospect_documents TO authenticated;
DROP POLICY IF EXISTS pg_documents_select ON public.partner_prospect_documents;
DROP POLICY IF EXISTS pg_documents_insert ON public.partner_prospect_documents;
DROP POLICY IF EXISTS pg_documents_update ON public.partner_prospect_documents;
CREATE POLICY pg_documents_select ON public.partner_prospect_documents
 FOR SELECT TO authenticated USING (public.partner_growth_access('view'));
CREATE POLICY pg_documents_insert ON public.partner_prospect_documents
 FOR INSERT TO authenticated WITH CHECK (
   public.partner_growth_access('edit') AND created_by=auth.uid() AND status='draft'
 );
CREATE POLICY pg_documents_update ON public.partner_prospect_documents
 FOR UPDATE TO authenticated USING (
   public.partner_growth_access('edit')
 ) WITH CHECK (public.partner_growth_access('edit'));
CREATE OR REPLACE FUNCTION public.pg_document_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth edit permission required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
    END IF;
    NEW.created_by:=auth.uid();
    IF NEW.status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'New documents must be reviewable drafts' USING ERRCODE='23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.partner_prospect_documents d
      WHERE d.document_group_id=NEW.document_group_id AND
      (d.prospect_id<>NEW.prospect_id OR d.document_type<>NEW.document_type)
    ) THEN RAISE EXCEPTION 'Document group belongs to another prospect or type' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  -- Once created, every snapshot/version is immutable; revisions create a new row/version.
  IF NEW.id IS DISTINCT FROM OLD.id OR
     NEW.prospect_id IS DISTINCT FROM OLD.prospect_id OR
     NEW.document_group_id IS DISTINCT FROM OLD.document_group_id OR
     NEW.version IS DISTINCT FROM OLD.version OR
     NEW.document_type IS DISTINCT FROM OLD.document_type OR
     NEW.title IS DISTINCT FROM OLD.title OR
     NEW.language IS DISTINCT FROM OLD.language OR
     NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot OR
     NEW.created_by IS DISTINCT FROM OLD.created_by OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Document snapshots and version history are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status='approved' THEN
    RAISE EXCEPTION 'Approved documents are immutable. Create a new revision.' USING ERRCODE='23514';
  END IF;
  IF NEW.status='approved' AND OLD.status='draft' THEN
    IF NOT (
      public.has_role(auth.uid(),'hq_admin'::public.app_role) AND
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_hq AND p.is_active)
    ) THEN RAISE EXCEPTION 'Only an active HQ Admin can approve a proposal' USING ERRCODE='42501'; END IF;
    NEW.approved_by:=auth.uid(); NEW.approved_at:=now();
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Approval metadata is server managed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS pg_document_guard_before ON public.partner_prospect_documents;
CREATE TRIGGER pg_document_guard_before
 BEFORE INSERT OR UPDATE ON public.partner_prospect_documents FOR EACH ROW
 EXECUTE FUNCTION public.pg_document_guard();
REVOKE ALL ON FUNCTION public.pg_document_guard() FROM PUBLIC,anon,authenticated;
COMMIT;
