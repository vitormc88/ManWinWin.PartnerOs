-- Partner Growth 4B.2 — integrated DB acceptance with a fictional company.
-- TEST ONLY. Entire workflow is one BEGIN/ROLLBACK, no email delivery, no real login.
-- Do not execute on PROD. The simulated invited account is rolled back.
BEGIN;

-- 1. Authenticated HQ Admin qualifies, signs and authorizes a fictional prospect.
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',(
 SELECT id::text FROM public.profiles WHERE is_hq AND is_active
 AND public.has_role(id,'hq_admin'::public.app_role) ORDER BY id LIMIT 1),true);
SET LOCAL ROLE authenticated;

DO $hq_setup$
DECLARE prospect_id uuid;contact_id uuid;partner_id uuid;token uuid;
BEGIN
 INSERT INTO public.partner_prospects (
   company_name,country,proposed_partner_type,fit_summary,interest_evidence,created_by
 ) VALUES (
   '__PG4B2_E2E_FICTIONAL__','PT','CMSC',
   'Fictional connector with industrial network',
   'Fictional HQ-reviewed partner interest',auth.uid()
 ) RETURNING id INTO prospect_id;
 INSERT INTO public.partner_prospect_contacts(prospect_id,name,email,is_primary)
 VALUES(prospect_id,'Fictional Connector Tester','pg-4b2-fixture@example.invalid',true)
 RETURNING id INTO contact_id;
 INSERT INTO public.partner_prospect_activation_plans (
  prospect_id,target_model,hq_activation_owner,kickoff_objective,first_value_milestone,created_by
 ) VALUES(prospect_id,'CMSC',auth.uid(),
  'HQ-supervised first partner introduction','One qualified customer referral',auth.uid());

 UPDATE public.partner_prospects
 SET qualification_decision='Proceed',recruitment_stage='Qualified'
 WHERE id=prospect_id;
 UPDATE public.partner_prospects SET recruitment_stage='Agreement Pending' WHERE id=prospect_id;
 UPDATE public.partner_prospects
 SET recruitment_stage='Signed',agreement_reference='SIMULATED-SIGNED-FOR-ROLLBACK-ONLY',
 agreement_signed_on=current_date WHERE id=prospect_id;
 UPDATE public.partner_prospect_activation_plans
 SET legal_review_status='approved',legal_review_reference='SIMULATED-LEGAL-ROLLBACK'
 WHERE prospect_id=prospect_id;
 UPDATE public.partner_prospect_activation_plans
 SET readiness_status='ready_for_handoff' WHERE prospect_id=prospect_id;

 partner_id:=public.pg_convert_prospect(
  prospect_id,'Fictional Connector Validation Ltd',
  'FICTION-REG-20261011','123 Test Street, Fictional District, PT',
  'Fictional Authorized Signatory',true);
 IF partner_id IS NULL THEN RAISE EXCEPTION 'FAIL: fictional conversion returned null'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.partners WHERE id=partner_id
   AND status='Onboarding' AND activation_phase='invitation_pending'
   AND partner_type='Strategic Connector'
 ) THEN RAISE EXCEPTION 'FAIL: incorrect operational partner state'; END IF;

 SELECT x.reservation_token INTO token FROM public.pg_reserve_partner_invitation(prospect_id,contact_id) x;
 IF token IS NULL THEN RAISE EXCEPTION 'FAIL: HQ could not reserve named-contact invite'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_growth_invitations i
 WHERE i.reservation_token=token AND i.status='reserved'
 AND i.invited_role='partner_connector'::public.app_role
 AND i.partner_id=partner_id) THEN
  RAISE EXCEPTION 'FAIL: reservation misbound to partner/role'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE partner_id=partner_id) THEN
  RAISE EXCEPTION 'FAIL: conversion/reservation unexpectedly provisioned user'; END IF;

 PERFORM set_config('pg_test.prospect',prospect_id::text,true);
 PERFORM set_config('pg_test.partner',partner_id::text,true);
 PERFORM set_config('pg_test.reservation',token::text,true);
END;$hq_setup$;
RESET ROLE;

-- 2. TEST ONLY: simulate GoTrue's user row. NO password, email or HTTP login.
-- The existing auth.users trigger creates the ordinary public.profiles row.
DO $fixture_auth$
DECLARE mock_uid uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, invited_at
 ) VALUES(
  mock_uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'pg-4b2-fixture@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Fictional Connector Tester"}'::jsonb,now(),now(),now()
 );
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=mock_uid) THEN
  RAISE EXCEPTION 'FAIL: auth trigger did not create invited profile'; END IF;
 PERFORM set_config('pg_test.user',mock_uid::text,true);
END;$fixture_auth$;

-- 3. Service-side invitation completion, using service_role claims.
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT public.pg_complete_partner_invitation(
  current_setting('pg_test.reservation')::uuid,
  current_setting('pg_test.user')::uuid
);
RESET ROLE;

-- 4. Simulated first authenticated user session (NOT an actual browser login).
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',current_setting('pg_test.user'),true);
SET LOCAL ROLE authenticated;
DO $first_session$
DECLARE partner_id uuid:=current_setting('pg_test.partner')::uuid;
DECLARE user_id uuid:=current_setting('pg_test.user')::uuid;
DECLARE module_count int;
DECLARE referral_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles
    WHERE id=user_id AND partner_id=partner_id AND is_active
    AND invitation_status='pending') THEN
  RAISE EXCEPTION 'FAIL: service did not provision pending partner profile'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id=user_id AND role='partner_connector'::public.app_role) THEN
  RAISE EXCEPTION 'FAIL: invite did not assign restricted CMSC role'; END IF;
 IF (SELECT count(*) FROM public.user_roles WHERE user_id=user_id)<>1 THEN
  RAISE EXCEPTION 'FAIL: unexpected additional roles'; END IF;
 IF NOT public.can_access_academy() THEN
  RAISE EXCEPTION 'FAIL: connector cannot open Academy'; END IF;
 SELECT count(*) INTO module_count FROM public.academy_modules WHERE status='published';
 IF module_count<1 THEN RAISE EXCEPTION 'FAIL: published Academy modules invisible to connector'; END IF;
 IF EXISTS(SELECT 1 FROM public.clients)
    OR EXISTS(SELECT 1 FROM public.deals)
    OR EXISTS(SELECT 1 FROM public.proposals)
    OR EXISTS(SELECT 1 FROM public.renewals) THEN
  RAISE EXCEPTION 'FAIL: connector sees commercial portfolio'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_effective_permissions(auth.uid())
  WHERE module_key IN ('partner_growth','clients','pipeline','user_management')
  AND access_level<>'no_access') THEN
  RAISE EXCEPTION 'FAIL: connector has excess module privileges'; END IF;

 -- AuthContext performs this write on an authenticated SIGNED_IN event.
 UPDATE public.profiles
 SET invitation_status='active',invitation_accepted_at=now()
 WHERE id=user_id AND invitation_status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: cannot accept invitation in user scope'; END IF;

 referral_id:=public.pg_submit_partner_referral(
  'Fictional Test Plant SA','Fictional Maintenance Manager',
  'fictional.maint@example.invalid','PT',
  'Fictional first-value referral for Partner Growth QA');
 IF referral_id IS NULL THEN RAISE EXCEPTION 'FAIL: no referral ID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.incoming_leads l WHERE l.id=referral_id
   AND l.linked_partner_id=partner_id AND l.lead_owner_type='HQ'
   AND l.status='New' AND l.lead_source='Partner referral') THEN
  RAISE EXCEPTION 'FAIL: referral was not routed to HQ/partner'; END IF;
 IF EXISTS(SELECT 1 FROM public.academy_module_progress WHERE user_id=user_id) THEN
  RAISE EXCEPTION 'FAIL: fake user had automatic Academy completions'; END IF;
 PERFORM set_config('pg_test.referral',referral_id::text,true);
END;$first_session$;
RESET ROLE;

-- 5. HQ receives exactly the referral inserted by the fictional partner.
SELECT set_config('request.jwt.claim.sub',(
 SELECT id::text FROM public.profiles WHERE is_hq AND is_active
 AND public.has_role(id,'hq_admin'::public.app_role) ORDER BY id LIMIT 1),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $hq_receipt$
DECLARE rid uuid:=current_setting('pg_test.referral')::uuid;
DECLARE partner_id uuid:=current_setting('pg_test.partner')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.incoming_leads
 WHERE id=rid AND linked_partner_id=partner_id AND lead_owner_type='HQ') THEN
  RAISE EXCEPTION 'FAIL: HQ cannot receive routed referral'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_growth_invitations
 WHERE reservation_token=current_setting('pg_test.reservation')::uuid
 AND status='sent' AND invited_user_id=current_setting('pg_test.user')::uuid) THEN
  RAISE EXCEPTION 'FAIL: invitation audit not completed'; END IF;
END;$hq_receipt$;
RESET ROLE;

-- The SELECT below is proof only of transient work inside THIS transaction.
SELECT 'PASS' AS integrated_simulated_result,
 'GoTrue delivery and actual password-login NOT exercised' AS limitation,
 (SELECT count(*) FROM public.partner_growth_invitations
 WHERE email='pg-4b2-fixture@example.invalid' AND status='sent') AS transient_invites,
 (SELECT count(*) FROM public.incoming_leads
 WHERE id=current_setting('pg_test.referral')::uuid) AS transient_hq_referrals;

ROLLBACK;
