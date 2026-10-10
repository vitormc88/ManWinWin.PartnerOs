-- Partner Growth Sprint 4A — Agreement Review & Activation Readiness (TEST ONLY).
-- Does not create an operational partner, grant users, certify skills or emit legal agreements.
BEGIN;
CREATE TABLE IF NOT EXISTS public.partner_prospect_activation_plans (
  prospect_id uuid PRIMARY KEY REFERENCES public.partner_prospects(id) ON DELETE RESTRICT,
  target_model text CHECK (target_model IN ('CMSC','CMAR','CMAI','Strategic Alliance')),
  hq_activation_owner uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kickoff_objective text NOT NULL DEFAULT '',
  first_value_milestone text NOT NULL DEFAULT '',
  enablement_plan text NOT NULL DEFAULT '',
  commercial_handoff_notes text NOT NULL DEFAULT '',
  legal_review_status text NOT NULL DEFAULT 'pending'
    CHECK (legal_review_status IN ('pending','approved')),
  legal_review_reference text,
  legal_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  legal_reviewed_at timestamptz,
  readiness_status text NOT NULL DEFAULT 'planning'
    CHECK (readiness_status IN ('planning','ready_for_handoff')),
  handoff_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handoff_approved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pg_legal_review_consistency CHECK (
    (legal_review_status='pending' AND legal_reviewed_by IS NULL AND legal_reviewed_at IS NULL)
    OR (legal_review_status='approved' AND length(btrim(coalesce(legal_review_reference,'')))>=5
      AND legal_reviewed_by IS NOT NULL AND legal_reviewed_at IS NOT NULL)
  ),
  CONSTRAINT pg_activation_handoff_consistency CHECK (
    (readiness_status='planning' AND handoff_approved_by IS NULL AND handoff_approved_at IS NULL)
    OR (readiness_status='ready_for_handoff' AND handoff_approved_by IS NOT NULL AND handoff_approved_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS pg_activation_owner_idx ON public.partner_prospect_activation_plans(hq_activation_owner);

CREATE TABLE IF NOT EXISTS public.partner_prospect_capability_plans (
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE CASCADE,
  pathway text NOT NULL CHECK (pathway IN ('CMSC','CMAR','CMAI')),
  preparation_status text NOT NULL DEFAULT 'not_started'
    CHECK (preparation_status IN ('not_started','planned','learning','assessment_needed')),
  readiness_notes text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prospect_id,pathway)
);
ALTER TABLE public.partner_prospect_activation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_prospect_capability_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_prospect_activation_plans,public.partner_prospect_capability_plans FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.partner_prospect_activation_plans,public.partner_prospect_capability_plans TO authenticated;

DROP POLICY IF EXISTS pg_activation_read ON public.partner_prospect_activation_plans;
DROP POLICY IF EXISTS pg_activation_create ON public.partner_prospect_activation_plans;
DROP POLICY IF EXISTS pg_activation_update ON public.partner_prospect_activation_plans;
CREATE POLICY pg_activation_read ON public.partner_prospect_activation_plans FOR SELECT TO authenticated
USING (public.partner_growth_access('view'));
CREATE POLICY pg_activation_create ON public.partner_prospect_activation_plans FOR INSERT TO authenticated
WITH CHECK (public.partner_growth_access('edit') AND created_by=auth.uid()
  AND legal_review_status='pending' AND readiness_status='planning');
CREATE POLICY pg_activation_update ON public.partner_prospect_activation_plans FOR UPDATE TO authenticated
USING (public.partner_growth_access('edit'))
WITH CHECK (public.partner_growth_access('edit'));

DROP POLICY IF EXISTS pg_capability_read ON public.partner_prospect_capability_plans;
DROP POLICY IF EXISTS pg_capability_insert ON public.partner_prospect_capability_plans;
DROP POLICY IF EXISTS pg_capability_update ON public.partner_prospect_capability_plans;
CREATE POLICY pg_capability_read ON public.partner_prospect_capability_plans FOR SELECT TO authenticated
USING (public.partner_growth_access('view'));
CREATE POLICY pg_capability_insert ON public.partner_prospect_capability_plans FOR INSERT TO authenticated
WITH CHECK (public.partner_growth_access('edit') AND updated_by=auth.uid());
CREATE POLICY pg_capability_update ON public.partner_prospect_capability_plans FOR UPDATE TO authenticated
USING (public.partner_growth_access('edit'))
WITH CHECK (public.partner_growth_access('edit') AND updated_by=auth.uid());

CREATE OR REPLACE FUNCTION public.pg_activation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE signed_record public.partner_prospects%ROWTYPE;
DECLARE is_hq_admin boolean;
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth editing permission required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO signed_record FROM public.partner_prospects
   WHERE id=NEW.prospect_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown recruitment prospect' USING ERRCODE='23514';
  END IF;
  is_hq_admin := public.has_role(auth.uid(),'hq_admin'::public.app_role)
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_hq AND p.is_active);
  NEW.updated_by:=auth.uid();
  NEW.updated_at:=now();
  IF NEW.target_model IS NOT NULL
     AND NEW.target_model IS DISTINCT FROM signed_record.proposed_partner_type THEN
    RAISE EXCEPTION 'Activation model must match proposed recruitment model' USING ERRCODE='23514';
  END IF;
  IF NEW.hq_activation_owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=NEW.hq_activation_owner AND p.is_hq AND p.is_active
      AND (public.has_role(p.id,'hq_admin'::public.app_role) OR
        (public.has_role(p.id,'hq_standard'::public.app_role) AND EXISTS (
          SELECT 1 FROM public.user_module_permissions u WHERE u.user_id=p.id
          AND u.module_key='partner_growth' AND u.is_override
          AND u.access_level IN ('view','edit','admin')
        )))
  ) THEN
    RAISE EXCEPTION 'Activation owner must be authorized HQ' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Creator must be authenticated' USING ERRCODE='42501';
    END IF;
    IF NEW.legal_review_status<>'pending' OR NEW.readiness_status<>'planning'
       OR NEW.legal_reviewed_by IS NOT NULL OR NEW.handoff_approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'Approval metadata must start unset' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.prospect_id IS DISTINCT FROM OLD.prospect_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Activation identity is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.readiness_status='ready_for_handoff' AND NEW.readiness_status <> 'ready_for_handoff' THEN
    RAISE EXCEPTION 'Handoff approval cannot be silently reversed' USING ERRCODE='23514';
  END IF;
  IF OLD.legal_review_status='approved' THEN
    IF NEW.legal_review_status IS DISTINCT FROM OLD.legal_review_status OR
       NEW.legal_review_reference IS DISTINCT FROM OLD.legal_review_reference THEN
      RAISE EXCEPTION 'Approved legal review is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF OLD.readiness_status='ready_for_handoff' THEN
    IF NEW.target_model IS DISTINCT FROM OLD.target_model OR
       NEW.legal_review_reference IS DISTINCT FROM OLD.legal_review_reference OR
       NEW.kickoff_objective IS DISTINCT FROM OLD.kickoff_objective OR
       NEW.first_value_milestone IS DISTINCT FROM OLD.first_value_milestone THEN
      RAISE EXCEPTION 'Approved handoff plan requires a new formal review to change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF OLD.legal_review_status='pending' AND NEW.legal_review_status='approved' THEN
    IF NOT is_hq_admin THEN
      RAISE EXCEPTION 'Legal review can only be approved by HQ Admin' USING ERRCODE='42501';
    END IF;
    IF NEW.legal_review_reference IS NULL OR length(btrim(NEW.legal_review_reference))<5 THEN
      RAISE EXCEPTION 'Approval requires a documented legal review reference' USING ERRCODE='23514';
    END IF;
    NEW.legal_reviewed_by:=auth.uid(); NEW.legal_reviewed_at:=now();
  ELSIF NEW.legal_reviewed_by IS DISTINCT FROM OLD.legal_reviewed_by
     OR NEW.legal_reviewed_at IS DISTINCT FROM OLD.legal_reviewed_at THEN
    RAISE EXCEPTION 'Legal review attribution is server managed' USING ERRCODE='23514';
  END IF;
  IF OLD.readiness_status='planning' AND NEW.readiness_status='ready_for_handoff' THEN
    IF NOT is_hq_admin THEN
      RAISE EXCEPTION 'Handoff approval requires HQ Admin' USING ERRCODE='42501';
    END IF;
    IF signed_record.recruitment_stage <> 'Signed'
       OR signed_record.signed_verified_by IS NULL OR signed_record.signed_verified_at IS NULL
       OR signed_record.agreement_signed_on IS NULL
       OR length(btrim(coalesce(signed_record.agreement_reference,'')))<4
       OR signed_record.converted_partner_id IS NOT NULL THEN
      RAISE EXCEPTION 'Handoff requires a signed, verified, unconverted agreement' USING ERRCODE='23514';
    END IF;
    IF NEW.legal_review_status <> 'approved' OR NEW.legal_reviewed_by IS NULL THEN
      RAISE EXCEPTION 'Handoff requires explicit HQ legal review' USING ERRCODE='23514';
    END IF;
    IF NEW.target_model IS NULL OR NEW.hq_activation_owner IS NULL
       OR length(btrim(NEW.kickoff_objective))<5
       OR length(btrim(NEW.first_value_milestone))<5 THEN
      RAISE EXCEPTION 'Handoff needs a role, HQ owner, kickoff and first-value objective' USING ERRCODE='23514';
    END IF;
    NEW.handoff_approved_by:=auth.uid(); NEW.handoff_approved_at:=now();
  ELSIF NEW.handoff_approved_by IS DISTINCT FROM OLD.handoff_approved_by
     OR NEW.handoff_approved_at IS DISTINCT FROM OLD.handoff_approved_at THEN
    RAISE EXCEPTION 'Handoff approval attribution is server managed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS pg_activation_guard_before ON public.partner_prospect_activation_plans;
CREATE TRIGGER pg_activation_guard_before BEFORE INSERT OR UPDATE ON public.partner_prospect_activation_plans
FOR EACH ROW EXECUTE FUNCTION public.pg_activation_guard();

CREATE OR REPLACE FUNCTION public.pg_capability_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth editing permission required' USING ERRCODE='42501';
  END IF;
  NEW.updated_by:=auth.uid(); NEW.updated_at:=now();
  IF TG_OP='UPDATE' AND (NEW.prospect_id IS DISTINCT FROM OLD.prospect_id
    OR NEW.pathway IS DISTINCT FROM OLD.pathway) THEN
    RAISE EXCEPTION 'Capability path identity cannot change' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS pg_capability_plan_guard_before ON public.partner_prospect_capability_plans;
CREATE TRIGGER pg_capability_plan_guard_before BEFORE INSERT OR UPDATE ON public.partner_prospect_capability_plans
FOR EACH ROW EXECUTE FUNCTION public.pg_capability_plan_guard();
REVOKE ALL ON FUNCTION public.pg_activation_guard(), public.pg_capability_plan_guard() FROM PUBLIC,anon,authenticated;
COMMIT;
