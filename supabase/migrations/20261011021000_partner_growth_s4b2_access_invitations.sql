-- Sprint 4B.2 / 02 — scoped invitations, Academy visibility and referral submission.
-- Requires committed 20261011020000 partner roles migration.
-- TEST only. No auth.users or users are created by this migration.
BEGIN;

-- Fail closed for brand-new roles: no inherited legacy partner dashboard/client/pipeline rights.
INSERT INTO public.role_permission_templates(role,module_key,access_level)
SELECT r.role::public.app_role,m.module_key,'no_access'
FROM (VALUES ('partner_connector'),('partner_reseller_trainee'),('partner_implementer_trainee')) r(role)
CROSS JOIN (SELECT DISTINCT module_key FROM public.role_permission_templates) m
ON CONFLICT (role,module_key) DO UPDATE SET access_level='no_access';
UPDATE public.role_permission_templates SET access_level='view'
WHERE role::text IN ('partner_connector','partner_reseller_trainee','partner_implementer_trainee')
AND module_key IN ('onboarding','knowledge_base','announcements','notifications','incoming_leads');

-- Prevent a probationary partner from manipulating their own HQ-owned incoming leads.
-- The existing partner SELECT policy already restricts reads to linked_partner_id.
DROP POLICY IF EXISTS pg_probationary_leads_no_update ON public.incoming_leads;
CREATE POLICY pg_probationary_leads_no_update ON public.incoming_leads
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT EXISTS(
    SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
      AND r.role::text IN ('partner_connector','partner_reseller_trainee','partner_implementer_trainee')
  ))
  WITH CHECK (NOT EXISTS(
    SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
      AND r.role::text IN ('partner_connector','partner_reseller_trainee','partner_implementer_trainee')
  ));

CREATE TABLE IF NOT EXISTS public.partner_growth_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.partner_prospects(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL UNIQUE REFERENCES public.partner_prospect_contacts(id) ON DELETE RESTRICT,
  email text NOT NULL,
  full_name text NOT NULL,
  invited_role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK(status IN ('reserved','sent','failed')),
  reservation_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  invited_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason_code text,
  CONSTRAINT pg_invitation_status CHECK (
    (status='reserved' AND invited_user_id IS NULL AND sent_at IS NULL)
    OR (status='sent' AND invited_user_id IS NOT NULL AND sent_at IS NOT NULL)
    OR (status='failed' AND invited_user_id IS NULL AND sent_at IS NULL)
  ),
  CONSTRAINT pg_invitation_role CHECK (invited_role::text IN
    ('partner_connector','partner_reseller_trainee','partner_implementer_trainee'))
);
ALTER TABLE public.partner_growth_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_growth_invitations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.partner_growth_invitations TO authenticated;
DROP POLICY IF EXISTS pg_invitations_hq_read ON public.partner_growth_invitations;
CREATE POLICY pg_invitations_hq_read ON public.partner_growth_invitations
  FOR SELECT TO authenticated USING(public.partner_growth_access('view'));

-- Reservation is invoked via the requesting HQ administrator's JWT.
CREATE OR REPLACE FUNCTION public.pg_reserve_partner_invitation(p_prospect_id uuid,p_contact_id uuid)
RETURNS TABLE(reservation_token uuid,contact_email text,contact_name text,partner_id uuid,role_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_prospect public.partner_prospects%ROWTYPE;
DECLARE v_contact public.partner_prospect_contacts%ROWTYPE;
DECLARE v_receipt public.partner_prospect_conversion_receipts%ROWTYPE;
DECLARE v_role public.app_role;
DECLARE v_inv public.partner_growth_invitations%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'hq_admin'::public.app_role)
    OR NOT EXISTS (SELECT 1 FROM public.profiles
                   WHERE id=auth.uid() AND is_hq AND is_active) THEN
  RAISE EXCEPTION 'Only active HQ Admin may invite partner contacts' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_prospect FROM public.partner_prospects WHERE id=p_prospect_id FOR UPDATE;
 IF NOT FOUND OR v_prospect.converted_partner_id IS NULL THEN
  RAISE EXCEPTION 'Official partner conversion required before invitations' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_receipt FROM public.partner_prospect_conversion_receipts cr
 WHERE cr.prospect_id=p_prospect_id AND cr.partner_id=v_prospect.converted_partner_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.partners
  WHERE id=v_receipt.partner_id AND status='Onboarding' AND activation_phase='invitation_pending') THEN
  RAISE EXCEPTION 'Conversion record or invitation lifecycle is not valid' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_contact FROM public.partner_prospect_contacts
 WHERE id=p_contact_id AND prospect_id=p_prospect_id;
 IF NOT FOUND OR length(btrim(coalesce(v_contact.name,'')))<2 OR
    btrim(coalesce(v_contact.email,'')) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'A named prospect contact with valid email is required' USING ERRCODE='23514'; END IF;
 IF v_receipt.partnership_model='CMSC' THEN v_role:='partner_connector';
 ELSIF v_receipt.partnership_model='CMAR' THEN v_role:='partner_reseller_trainee';
 ELSIF v_receipt.partnership_model='CMAI' THEN v_role:='partner_implementer_trainee';
 ELSE RAISE EXCEPTION 'This partner model requires manual authorization' USING ERRCODE='23514'; END IF;

 -- Existing auth accounts must be resolved separately; never silently reparent accounts.
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=lower(btrim(v_contact.email))) THEN
  RAISE EXCEPTION 'Email already belongs to a user; HQ must resolve identity manually' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.partner_growth_invitations
    WHERE contact_id=p_contact_id AND status IN ('reserved','sent')) THEN
  RAISE EXCEPTION 'Invitation already requested or sent' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.partner_growth_invitations(
  prospect_id,partner_id,contact_id,email,full_name,invited_role,requested_by)
 VALUES(p_prospect_id,v_receipt.partner_id,p_contact_id,lower(btrim(v_contact.email)),btrim(v_contact.name),
  v_role,auth.uid())
 ON CONFLICT(contact_id) DO UPDATE SET
  status='reserved',
  reservation_token=gen_random_uuid(),
  requested_by=auth.uid(),
  requested_at=now(),
  failed_at=NULL,
  failure_reason_code=NULL
 WHERE public.partner_growth_invitations.status='failed'
 RETURNING * INTO v_inv;
 IF v_inv.id IS NULL THEN
  RAISE EXCEPTION 'Invitation already requested or sent' USING ERRCODE='23505';
 END IF;
 RETURN QUERY SELECT v_inv.reservation_token,v_inv.email,v_inv.full_name,v_inv.partner_id,
   v_inv.invited_role::text;
END
$fn$;

-- Runs from the existing service-role backed invitation edge function only.
-- Checks the created auth account and writes profile+role+ledger atomically.
CREATE OR REPLACE FUNCTION public.pg_complete_partner_invitation(p_token uuid,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_inv public.partner_growth_invitations%ROWTYPE;
DECLARE v_email text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_inv FROM public.partner_growth_invitations
  WHERE reservation_token=p_token FOR UPDATE;
 IF NOT FOUND OR v_inv.status<>'reserved' THEN
  RAISE EXCEPTION 'Invitation reservation is missing or completed' USING ERRCODE='23514'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=p_user_id;
 IF v_email IS DISTINCT FROM v_inv.email THEN
  RAISE EXCEPTION 'Invited account email does not match authorized contact' USING ERRCODE='23514'; END IF;
 UPDATE public.profiles SET
  full_name=v_inv.full_name,email=v_inv.email,partner_id=v_inv.partner_id,
  is_hq=false,is_active=true,invitation_status='pending',
  invitation_sent_at=now(),invitation_accepted_at=NULL
 WHERE id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invited profile not initialized' USING ERRCODE='23514'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,v_inv.invited_role);
 UPDATE public.partner_growth_invitations
  SET status='sent',invited_user_id=p_user_id,sent_at=now()
 WHERE id=v_inv.id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pg_fail_partner_invitation(p_token uuid,p_reason_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 UPDATE public.partner_growth_invitations
 SET status='failed',failed_at=now(),
 failure_reason_code=left(regexp_replace(coalesce(p_reason_code,'provider_error'),'[^a-z0-9_\-]','','g'),64)
 WHERE reservation_token=p_token AND status='reserved';
END
$fn$;

-- Protect against post-invite hijacking or record edits from direct clients.
CREATE OR REPLACE FUNCTION public.pg_invitation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Invitation audit cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.prospect_id IS DISTINCT FROM OLD.prospect_id OR
    NEW.partner_id IS DISTINCT FROM OLD.partner_id OR
    NEW.contact_id IS DISTINCT FROM OLD.contact_id OR
    NEW.email IS DISTINCT FROM OLD.email OR
    NEW.full_name IS DISTINCT FROM OLD.full_name OR
    NEW.invited_role IS DISTINCT FROM OLD.invited_role THEN
    RAISE EXCEPTION 'Invitation identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='failed' AND NEW.status='reserved'
    AND auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(),'hq_admin'::public.app_role)
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_hq AND p.is_active)
    AND NEW.reservation_token IS DISTINCT FROM OLD.reservation_token
    AND NEW.invited_user_id IS NULL AND NEW.sent_at IS NULL THEN
   RETURN NEW;
 END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Secure invitation service required for updates' USING ERRCODE='42501'; END IF;
 IF OLD.status <> 'reserved' OR NEW.status NOT IN ('sent','failed') THEN
   RAISE EXCEPTION 'Invitation was already processed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS pg_invitation_guard_before ON public.partner_growth_invitations;
CREATE TRIGGER pg_invitation_guard_before BEFORE DELETE OR UPDATE
 ON public.partner_growth_invitations FOR EACH ROW EXECUTE FUNCTION public.pg_invitation_guard();

-- Partners can submit strictly scoped referrals via RPC, not INSERT privileges.
CREATE OR REPLACE FUNCTION public.pg_submit_partner_referral(
 p_company_name text,p_contact_name text,p_email text,p_country text,p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_partner_id uuid;v_partner_name text;v_lead_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
  WHERE p.id=auth.uid() AND p.is_active AND NOT p.is_hq AND p.partner_id IS NOT NULL
    AND r.role::text IN ('partner_connector','partner_reseller_trainee','partner_implementer_trainee')
 ) THEN RAISE EXCEPTION 'Authorized partner trainee required' USING ERRCODE='42501'; END IF;
 SELECT p.partner_id,partner.company_name INTO v_partner_id,v_partner_name
 FROM public.profiles p JOIN public.partners partner ON partner.id=p.partner_id
 WHERE p.id=auth.uid() AND partner.is_active
  AND partner.status IN ('Onboarding','Active');
 IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Partner is inactive' USING ERRCODE='23514'; END IF;
 IF length(btrim(coalesce(p_company_name,'')))<2
    OR length(btrim(coalesce(p_contact_name,'')))<2
    OR btrim(coalesce(p_email,'')) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR upper(btrim(coalesce(p_country,''))) !~ '^[A-Z]{2}$'
 THEN RAISE EXCEPTION 'Company, contact, valid email and two-letter country required' USING ERRCODE='23514'; END IF;
 INSERT INTO public.incoming_leads(
   company_name,contact_name,email,country,notes,
   lead_source,linked_partner_id,linked_partner_name,lead_owner_type,routing_reason,status
 ) VALUES(
  btrim(p_company_name),btrim(p_contact_name),lower(btrim(p_email)),
  upper(btrim(p_country)),NULLIF(left(btrim(coalesce(p_notes,'')),2000),''),
  'Partner referral',v_partner_id,v_partner_name,'HQ','Partner referral for HQ qualification','New'
 ) RETURNING id INTO v_lead_id;
 RETURN v_lead_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.pg_reserve_partner_invitation(uuid,uuid),
 public.pg_complete_partner_invitation(uuid,uuid),
 public.pg_fail_partner_invitation(uuid,text),
 public.pg_submit_partner_referral(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pg_reserve_partner_invitation(uuid,uuid),
 public.pg_submit_partner_referral(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pg_complete_partner_invitation(uuid,uuid),
 public.pg_fail_partner_invitation(uuid,text) TO service_role;
COMMIT;
