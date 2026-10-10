-- Partner Growth S4B.1: isolated TEST conversion. No user invitations or Academy grants.
BEGIN;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS activation_phase text NOT NULL DEFAULT 'legacy_untracked';
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS pg_partner_activation_phase_check;
ALTER TABLE public.partners ADD CONSTRAINT pg_partner_activation_phase_check
  CHECK (activation_phase IN ('legacy_untracked','invitation_pending','activating','commercially_active'));

-- Make CMSC an explicit operational level; never map it to Reseller or Strategic Partner.
INSERT INTO public.partnership_levels(name,code,sort_order,is_active)
SELECT 'Strategic Connector','STRATEGIC_CONNECTOR',5,true
WHERE NOT EXISTS(SELECT 1 FROM public.partnership_levels WHERE code='STRATEGIC_CONNECTOR');

CREATE TABLE IF NOT EXISTS public.partner_prospect_conversion_receipts (
  prospect_id uuid PRIMARY KEY REFERENCES public.partner_prospects(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL UNIQUE REFERENCES public.partners(id) ON DELETE RESTRICT,
  converted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  converted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  partnership_model text NOT NULL CHECK(partnership_model IN ('CMSC','CMAR','CMAI')),
  company_name text NOT NULL,
  legal_name text NOT NULL,
  registration_number text NOT NULL,
  registered_address text NOT NULL,
  signatory_name text NOT NULL,
  country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
  agreement_reference text NOT NULL,
  agreement_signed_on date NOT NULL,
  legal_review_reference text NOT NULL,
  hq_activation_owner uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  primary_contact_name text NOT NULL,
  primary_contact_email text,
  CONSTRAINT pg_receipt_legal_identity_minimum CHECK (
    length(btrim(legal_name))>=3 AND length(btrim(registration_number))>=3
    AND length(btrim(registered_address))>=8 AND length(btrim(signatory_name))>=3
  )
);
ALTER TABLE public.partner_prospect_conversion_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pg_conversion_receipts_hq_read ON public.partner_prospect_conversion_receipts;
CREATE POLICY pg_conversion_receipts_hq_read ON public.partner_prospect_conversion_receipts
 FOR SELECT TO authenticated USING(public.partner_growth_access('view'));
REVOKE ALL ON public.partner_prospect_conversion_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.partner_prospect_conversion_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.pg_conversion_receipt_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 RAISE EXCEPTION 'Conversion receipt is immutable' USING ERRCODE='23514';
END
$fn$;
DROP TRIGGER IF EXISTS pg_conversion_receipt_immutable_before ON public.partner_prospect_conversion_receipts;
CREATE TRIGGER pg_conversion_receipt_immutable_before BEFORE UPDATE OR DELETE
 ON public.partner_prospect_conversion_receipts FOR EACH ROW
 EXECUTE FUNCTION public.pg_conversion_receipt_immutable();
REVOKE ALL ON FUNCTION public.pg_conversion_receipt_immutable() FROM PUBLIC, anon, authenticated;

-- Preserve existing recruitment and signature safeguards; authorize only an
-- immutable receipt-backed one-time conversion.
CREATE OR REPLACE FUNCTION public.pg_prospect_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE contact_found boolean;
BEGIN
  IF NOT public.partner_growth_access('edit') THEN
    RAISE EXCEPTION 'Partner Growth edit permission required' USING ERRCODE='42501';
  END IF;
  NEW.company_name:=btrim(NEW.company_name);
  NEW.country:=upper(btrim(NEW.country));
  NEW.updated_at:=now();
  IF NEW.hq_owner_user_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=NEW.hq_owner_user_id
    AND p.is_hq IS TRUE AND p.is_active IS TRUE
    AND (
      public.has_role(p.id,'hq_admin'::public.app_role)
      OR (public.has_role(p.id,'hq_standard'::public.app_role) AND EXISTS(
        SELECT 1 FROM public.user_module_permissions u WHERE u.user_id=p.id
        AND u.module_key='partner_growth' AND u.is_override IS TRUE AND u.access_level IN ('view','edit','admin')
      ))
    )
  ) THEN RAISE EXCEPTION 'Owner must be an active, authorized HQ member' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Creator must be authenticated' USING ERRCODE='42501'; END IF;
    IF NEW.recruitment_stage <> 'Identified' THEN
      RAISE EXCEPTION 'New prospects must start in Identified' USING ERRCODE='23514'; END IF;
    IF NEW.qualified_by IS NOT NULL OR NEW.qualified_at IS NOT NULL
       OR NEW.signed_verified_by IS NOT NULL OR NEW.signed_verified_at IS NOT NULL
       OR NEW.converted_partner_id IS NOT NULL OR NEW.converted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Approval and conversion cannot be set at creation' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable prospect identity' USING ERRCODE='23514'; END IF;
  IF NEW.converted_partner_id IS DISTINCT FROM OLD.converted_partner_id
     OR NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
    IF OLD.converted_partner_id IS NOT NULL OR OLD.converted_at IS NOT NULL
       OR NEW.converted_partner_id IS NULL OR NEW.converted_at IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.partner_prospect_conversion_receipts c
         WHERE c.prospect_id=OLD.id AND c.partner_id=NEW.converted_partner_id
           AND c.converted_at=NEW.converted_at AND c.converted_by=auth.uid()
       ) THEN
      RAISE EXCEPTION 'Conversion link requires an immutable authorized receipt' USING ERRCODE='42501';
    END IF;
  END IF;
  IF OLD.converted_partner_id IS NOT NULL AND
     (NEW.company_name IS DISTINCT FROM OLD.company_name OR
      NEW.country IS DISTINCT FROM OLD.country) THEN
    RAISE EXCEPTION 'Converted legal identity requires an explicit amendment workflow' USING ERRCODE='23514';
  END IF;
  IF OLD.recruitment_stage='Signed' THEN
    IF NEW.recruitment_stage <> 'Signed' THEN
      RAISE EXCEPTION 'Signed prospects cannot be reopened' USING ERRCODE='23514';
    END IF;
    IF NEW.agreement_reference IS DISTINCT FROM OLD.agreement_reference
      OR NEW.agreement_signed_on IS DISTINCT FROM OLD.agreement_signed_on THEN
      RAISE EXCEPTION 'Signed agreement references and execution dates are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.recruitment_stage='Qualified' AND OLD.recruitment_stage IS DISTINCT FROM 'Qualified' THEN
    IF NEW.qualification_decision IS DISTINCT FROM 'Proceed' THEN
      RAISE EXCEPTION 'Qualified requires an explicit Proceed decision' USING ERRCODE='23514'; END IF;
    NEW.qualified_by:=auth.uid(); NEW.qualified_at:=now();
  ELSIF NEW.qualified_by IS DISTINCT FROM OLD.qualified_by OR NEW.qualified_at IS DISTINCT FROM OLD.qualified_at THEN
    RAISE EXCEPTION 'Qualification approval is server managed' USING ERRCODE='23514'; END IF;
  IF NEW.recruitment_stage='Agreement Pending'
     AND OLD.recruitment_stage IS DISTINCT FROM 'Agreement Pending'
     AND (OLD.recruitment_stage <> 'Qualified' OR OLD.qualified_by IS NULL) THEN
    RAISE EXCEPTION 'Agreement Pending requires a Qualified prospect' USING ERRCODE='23514'; END IF;
  IF NEW.recruitment_stage='Signed' AND OLD.recruitment_stage IS DISTINCT FROM 'Signed' THEN
    IF OLD.recruitment_stage <> 'Agreement Pending' THEN
      RAISE EXCEPTION 'Signed requires Agreement Pending' USING ERRCODE='23514'; END IF;
    IF NOT(public.has_role(auth.uid(),'hq_admin'::public.app_role)
      AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_hq IS TRUE AND p.is_active IS TRUE)) THEN
      RAISE EXCEPTION 'Signed requires HQ Admin verification' USING ERRCODE='42501'; END IF;
    IF NEW.agreement_reference IS NULL OR length(btrim(NEW.agreement_reference))<4 OR
       NEW.agreement_signed_on IS NULL OR NEW.agreement_signed_on>current_date THEN
      RAISE EXCEPTION 'Signed requires a valid agreement reference/date' USING ERRCODE='23514'; END IF;
    NEW.signed_verified_by:=auth.uid(); NEW.signed_verified_at:=now();
  ELSIF NEW.signed_verified_by IS DISTINCT FROM OLD.signed_verified_by OR NEW.signed_verified_at IS DISTINCT FROM OLD.signed_verified_at THEN
    RAISE EXCEPTION 'Signature verification is server managed' USING ERRCODE='23514'; END IF;
  IF NEW.recruitment_stage IN ('Qualified','Agreement Pending','Signed') THEN
    IF NEW.qualification_decision IS DISTINCT FROM 'Proceed' OR NEW.qualified_by IS NULL
       OR NEW.qualified_at IS NULL OR NEW.proposed_partner_type IS NULL
       OR NEW.fit_summary IS NULL OR length(btrim(NEW.fit_summary))<5
       OR NEW.interest_evidence IS NULL OR length(btrim(NEW.interest_evidence))<5 THEN
      RAISE EXCEPTION 'Qualified stages require fit, interest, model, and HQ decision' USING ERRCODE='23514'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.partner_prospect_contacts c WHERE c.prospect_id=NEW.id
      AND length(btrim(c.name))>=2) INTO contact_found;
    IF NOT contact_found THEN
      RAISE EXCEPTION 'Qualified requires an identified contact' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.recruitment_stage='Signed' AND (NEW.agreement_reference IS NULL
    OR length(btrim(NEW.agreement_reference))<4 OR NEW.agreement_signed_on IS NULL
    OR NEW.signed_verified_by IS NULL OR NEW.signed_verified_at IS NULL) THEN
    RAISE EXCEPTION 'Signed requires verified agreement' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pg_prospect_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pg_convert_prospect(
 p_prospect_id uuid,
 p_legal_name text,
 p_registration_number text,
 p_registered_address text,
 p_signatory_name text,
 p_confirmed boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_prospect public.partner_prospects%ROWTYPE;
 v_plan public.partner_prospect_activation_plans%ROWTYPE;
 v_existing public.partner_prospect_conversion_receipts%ROWTYPE;
 v_partner_id uuid;
 v_partner_type text;
 v_partner_level text;
 v_contact record;
 v_legal_name text:=btrim(coalesce(p_legal_name,''));
 v_registration text:=btrim(coalesce(p_registration_number,''));
 v_address text:=btrim(coalesce(p_registered_address,''));
 v_signatory text:=btrim(coalesce(p_signatory_name,''));
 v_converted_at timestamptz;
BEGIN
 -- Must explicitly be HQ Admin, even when SECURITY DEFINER bypasses RLS.
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'hq_admin'::public.app_role)
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_hq AND is_active)
 THEN RAISE EXCEPTION 'Only an active HQ Admin can convert prospects' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_prospect FROM public.partner_prospects
 WHERE id=p_prospect_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prospect not found' USING ERRCODE='23514'; END IF;

 -- Idempotency precedes input validation: a retry can supply the original id alone.
 IF v_prospect.converted_partner_id IS NOT NULL THEN
   SELECT * INTO v_existing FROM public.partner_prospect_conversion_receipts
      WHERE prospect_id=v_prospect.id AND partner_id=v_prospect.converted_partner_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Inconsistent conversion; requires HQ review' USING ERRCODE='23514'; END IF;
   RETURN v_existing.partner_id;
 END IF;

 SELECT * INTO v_plan FROM public.partner_prospect_activation_plans
 WHERE prospect_id=v_prospect.id FOR UPDATE;
 IF NOT FOUND OR v_prospect.recruitment_stage<>'Signed'
    OR v_prospect.signed_verified_by IS NULL OR v_prospect.signed_verified_at IS NULL
    OR v_prospect.agreement_signed_on IS NULL OR
       length(btrim(coalesce(v_prospect.agreement_reference,'')))<4
    OR v_prospect.agreement_signed_on>current_date
    OR v_plan.legal_review_status<>'approved'
    OR v_plan.legal_reviewed_by IS NULL OR v_plan.legal_reviewed_at IS NULL
    OR length(btrim(coalesce(v_plan.legal_review_reference,'')))<5
    OR v_plan.readiness_status<>'ready_for_handoff'
    OR v_plan.handoff_approved_by IS NULL OR v_plan.handoff_approved_at IS NULL
    OR v_plan.hq_activation_owner IS NULL
    OR v_plan.target_model IS DISTINCT FROM v_prospect.proposed_partner_type
    OR length(btrim(v_plan.kickoff_objective))<5
    OR length(btrim(v_plan.first_value_milestone))<5
 THEN RAISE EXCEPTION 'Verified Signed agreement, approved legal review and HQ handoff are required'
   USING ERRCODE='23514'; END IF;

 IF NOT p_confirmed OR length(v_legal_name)<3 OR length(v_registration)<3
    OR length(v_address)<8 OR length(v_signatory)<3
 THEN RAISE EXCEPTION 'Verify legal name, registration, address and authorized signatory before conversion'
  USING ERRCODE='23514'; END IF;

 IF v_prospect.proposed_partner_type='CMSC' THEN
  v_partner_type:='Strategic Connector'; v_partner_level:='Strategic Connector';
 ELSIF v_prospect.proposed_partner_type='CMAR' THEN
  v_partner_type:='Reseller'; v_partner_level:='Reseller';
 ELSIF v_prospect.proposed_partner_type='CMAI' THEN
  v_partner_type:='Implementer'; v_partner_level:='Implementer';
 ELSE RAISE EXCEPTION 'Strategic Alliances require a separately approved conversion' USING ERRCODE='23514'; END IF;

 IF EXISTS(
 SELECT 1 FROM public.partners p
 WHERE lower(btrim(p.company_name))=lower(btrim(v_prospect.company_name))
   OR lower(btrim(coalesce(p.legal_name,'')))=lower(v_legal_name)
   OR lower(btrim(coalesce(p.company_name,'')))=lower(v_legal_name)
 ) THEN
   RAISE EXCEPTION 'An operational partner with the same company or legal name already exists; HQ must resolve it'
     USING ERRCODE='23505';
 END IF;

 SELECT c.name,c.email INTO v_contact FROM public.partner_prospect_contacts c
 WHERE c.prospect_id=v_prospect.id AND length(btrim(c.name))>=2
 ORDER BY c.is_primary DESC,c.created_at ASC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'An identified primary contact is required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_plan.hq_activation_owner AND p.is_hq AND p.is_active)
 THEN RAISE EXCEPTION 'HQ activation owner must still be active' USING ERRCODE='23514'; END IF;

 INSERT INTO public.partners(
  company_name,legal_name,country,website,partner_type,partnership_level,
  status,is_active,activation_phase,onboarding_status,
  primary_contact_name,primary_contact_email,assigned_manager_id,
  created_by,updated_by,start_date
 ) VALUES (
  v_prospect.company_name,v_legal_name,v_prospect.country,v_prospect.website,
  v_partner_type,v_partner_level,'Active',true,'invitation_pending','Not Started',
  v_contact.name,v_contact.email,v_plan.hq_activation_owner,
  auth.uid(),auth.uid(),v_prospect.agreement_signed_on
 ) RETURNING id INTO v_partner_id;
 v_converted_at:=clock_timestamp();

 INSERT INTO public.partner_prospect_conversion_receipts(
  prospect_id,partner_id,converted_by,converted_at,partnership_model,
  company_name,legal_name,registration_number,registered_address,signatory_name,
  country,agreement_reference,agreement_signed_on,legal_review_reference,
  hq_activation_owner,primary_contact_name,primary_contact_email
 ) VALUES (
  v_prospect.id,v_partner_id,auth.uid(),v_converted_at,v_prospect.proposed_partner_type,
  v_prospect.company_name,v_legal_name,v_registration,v_address,v_signatory,
  v_prospect.country,v_prospect.agreement_reference,v_prospect.agreement_signed_on,
  v_plan.legal_review_reference,v_plan.hq_activation_owner,v_contact.name,v_contact.email
 );

 UPDATE public.partner_prospects
 SET converted_partner_id=v_partner_id,converted_at=v_converted_at
 WHERE id=v_prospect.id;
 INSERT INTO public.partner_prospect_activities(prospect_id,kind,content,created_by)
 VALUES(v_prospect.id,'decision','Converted to official PartnerOS partner by HQ Admin (no invitation or commercial activation)',auth.uid());

 RETURN v_partner_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.pg_convert_prospect(uuid,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pg_convert_prospect(uuid,text,text,text,text,boolean) TO authenticated;
COMMIT;
