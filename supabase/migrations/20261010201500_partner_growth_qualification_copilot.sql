-- Partner Growth Sprint 2: Qualification Copilot evidence and assessment.
-- TEST FIRST. Never migrate to PROD without separate sign-off.
BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_prospect_qualifications (
  prospect_id uuid PRIMARY KEY REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  research_summary text NOT NULL DEFAULT '',
  market_fit text NOT NULL DEFAULT 'unknown' CHECK (market_fit IN ('yes','no','unknown')),
  commercial_reach text NOT NULL DEFAULT 'unknown' CHECK (commercial_reach IN ('yes','no','unknown')),
  complementary_value text NOT NULL DEFAULT 'unknown' CHECK (complementary_value IN ('yes','no','unknown')),
  commitment text NOT NULL DEFAULT 'unknown' CHECK (commitment IN ('yes','no','unknown')),
  business_viability text NOT NULL DEFAULT 'unknown' CHECK (business_viability IN ('yes','no','unknown')),
  can_introduce text NOT NULL DEFAULT 'unknown' CHECK (can_introduce IN ('yes','no','unknown')),
  can_sell text NOT NULL DEFAULT 'unknown' CHECK (can_sell IN ('yes','no','unknown')),
  can_implement text NOT NULL DEFAULT 'unknown' CHECK (can_implement IN ('yes','no','unknown')),
  discovery_notes text NOT NULL DEFAULT '',
  risks_and_gaps text NOT NULL DEFAULT '',
  recommended_next_action text NOT NULL DEFAULT '',
  last_reviewed_at timestamptz,
  last_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.partner_prospect_research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 240),
  source_url text CHECK (source_url IS NULL OR (source_url ~* '^https://[^[:space:]]+$' AND length(source_url)<2000)),
  source_kind text NOT NULL DEFAULT 'public_source'
    CHECK (source_kind IN ('website','public_source','meeting','internal')),
  finding text NOT NULL CHECK (char_length(btrim(finding))>=5),
  evidence_state text NOT NULL DEFAULT 'unverified'
    CHECK (evidence_state IN ('unverified','verified_by_hq')),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_research_verification_consistency CHECK (
    (evidence_state='unverified' AND verified_by IS NULL AND verified_at IS NULL)
    OR (evidence_state='verified_by_hq' AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS partner_research_source_prospect_idx
  ON public.partner_prospect_research_sources(prospect_id, created_at DESC);

ALTER TABLE public.partner_prospect_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_prospect_research_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_prospect_qualifications,public.partner_prospect_research_sources FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.partner_prospect_qualifications TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.partner_prospect_research_sources TO authenticated;

DROP POLICY IF EXISTS pg_qualification_read ON public.partner_prospect_qualifications;
DROP POLICY IF EXISTS pg_qualification_insert ON public.partner_prospect_qualifications;
DROP POLICY IF EXISTS pg_qualification_update ON public.partner_prospect_qualifications;
CREATE POLICY pg_qualification_read ON public.partner_prospect_qualifications FOR SELECT TO authenticated
  USING (public.partner_growth_access('view'));
CREATE POLICY pg_qualification_insert ON public.partner_prospect_qualifications FOR INSERT TO authenticated
  WITH CHECK (public.partner_growth_access('edit') AND updated_by=auth.uid());
CREATE POLICY pg_qualification_update ON public.partner_prospect_qualifications FOR UPDATE TO authenticated
  USING (public.partner_growth_access('edit'))
  WITH CHECK (public.partner_growth_access('edit') AND updated_by=auth.uid());

DROP POLICY IF EXISTS pg_research_read ON public.partner_prospect_research_sources;
DROP POLICY IF EXISTS pg_research_insert ON public.partner_prospect_research_sources;
DROP POLICY IF EXISTS pg_research_update ON public.partner_prospect_research_sources;
CREATE POLICY pg_research_read ON public.partner_prospect_research_sources FOR SELECT TO authenticated
  USING (public.partner_growth_access('view'));
CREATE POLICY pg_research_insert ON public.partner_prospect_research_sources FOR INSERT TO authenticated
  WITH CHECK (public.partner_growth_access('edit') AND created_by=auth.uid()
    AND evidence_state='unverified' AND verified_by IS NULL AND verified_at IS NULL);
CREATE POLICY pg_research_update ON public.partner_prospect_research_sources FOR UPDATE TO authenticated
  USING (public.partner_growth_access('edit'))
  WITH CHECK (public.partner_growth_access('edit'));

CREATE OR REPLACE FUNCTION public.pg_qualification_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth edit permission required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.updated_by:=auth.uid();
    IF NEW.last_reviewed_at IS NOT NULL OR NEW.last_reviewed_by IS NOT NULL THEN
      RAISE EXCEPTION 'A newly created qualification cannot claim prior review'
        USING ERRCODE='23514';
    END IF;
  ELSE
    NEW.updated_at:=now();
    NEW.updated_by:=auth.uid();
    IF NEW.prospect_id IS DISTINCT FROM OLD.prospect_id THEN
      RAISE EXCEPTION 'Prospect qualification cannot be reassigned' USING ERRCODE='23514';
    END IF;
    IF NEW.last_reviewed_at IS DISTINCT FROM OLD.last_reviewed_at OR NEW.last_reviewed_by IS DISTINCT FROM OLD.last_reviewed_by THEN
      RAISE EXCEPTION 'Review metadata must be stamped by the review workflow' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS pg_qualification_protect_before ON public.partner_prospect_qualifications;
CREATE TRIGGER pg_qualification_protect_before BEFORE INSERT OR UPDATE ON public.partner_prospect_qualifications
  FOR EACH ROW EXECUTE FUNCTION public.pg_qualification_protect();

CREATE OR REPLACE FUNCTION public.pg_research_source_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth edit permission required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.created_by:=auth.uid();
    IF NEW.evidence_state <> 'unverified' THEN
      RAISE EXCEPTION 'New research evidence must start unverified' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.prospect_id IS DISTINCT FROM OLD.prospect_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Research source identity is immutable' USING ERRCODE='23514';
    END IF;
    NEW.updated_at:=now();
    -- A verification cannot survive an amendment to the supported claim or its source.
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.finding IS DISTINCT FROM OLD.finding
      OR NEW.source_url IS DISTINCT FROM OLD.source_url
      OR NEW.source_kind IS DISTINCT FROM OLD.source_kind THEN
      NEW.evidence_state:='unverified';
    END IF;
    IF NEW.evidence_state='verified_by_hq' AND OLD.evidence_state='unverified' THEN
      NEW.verified_by:=auth.uid();
      NEW.verified_at:=now();
    ELSIF NEW.evidence_state='unverified' AND OLD.evidence_state='verified_by_hq' THEN
      NEW.verified_by:=NULL; NEW.verified_at:=NULL;
    ELSIF NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      RAISE EXCEPTION 'Verification metadata is server managed' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS pg_research_source_protect_before ON public.partner_prospect_research_sources;
CREATE TRIGGER pg_research_source_protect_before BEFORE INSERT OR UPDATE ON public.partner_prospect_research_sources
  FOR EACH ROW EXECUTE FUNCTION public.pg_research_source_protect();

REVOKE ALL ON FUNCTION public.pg_qualification_protect(),public.pg_research_source_protect() FROM PUBLIC,anon,authenticated;

COMMIT;
