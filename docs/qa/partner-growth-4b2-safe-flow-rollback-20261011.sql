-- Partner Growth 4B2 integrated business-flow QA, TEST ONLY, all public-schema changes rolled back.
-- This does NOT generate real email, create auth.users, or assert a real browser login.
BEGIN;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',(
 SELECT p.id::text FROM public.profiles p WHERE p.is_hq AND p.is_active
 AND public.has_role(p.id,'hq_admin'::public.app_role) ORDER BY p.id LIMIT 1),true);
SET LOCAL ROLE authenticated;

DO $setup$
DECLARE qa_prospect uuid; qa_contact uuid; qa_partner uuid; qa_token uuid;
BEGIN
 INSERT INTO public.partner_prospects(company_name,country,proposed_partner_type,fit_summary,interest_evidence,created_by)
 VALUES('__PG4B2_SAFE_E2E_ROLLBACK__','PT','CMSC','Fictional sector reach','Fictional warm introduction',auth.uid())
 RETURNING id INTO qa_prospect;
 INSERT INTO public.partner_prospect_contacts(prospect_id,name,email,is_primary)
 VALUES(qa_prospect,'Fictional Partner Contact','pg4b2-safe@example.invalid',true)
 RETURNING id INTO qa_contact;
 INSERT INTO public.partner_prospect_activation_plans(prospect_id,target_model,hq_activation_owner,kickoff_objective,first_value_milestone,created_by)
 VALUES(qa_prospect,'CMSC',auth.uid(),'Agree HQ handoff','First qualified industrial referral',auth.uid());
 UPDATE public.partner_prospects SET qualification_decision='Proceed',recruitment_stage='Qualified' WHERE id=qa_prospect;
 UPDATE public.partner_prospects SET recruitment_stage='Agreement Pending' WHERE id=qa_prospect;
 UPDATE public.partner_prospects SET recruitment_stage='Signed',
  agreement_reference='FICTIONAL-ROLLBACK-ONLY',
  agreement_signed_on=current_date WHERE id=qa_prospect;
 UPDATE public.partner_prospect_activation_plans SET legal_review_status='approved',
  legal_review_reference='FICTIONAL-LEGAL-ROLLBACK' WHERE prospect_id=qa_prospect;
 UPDATE public.partner_prospect_activation_plans SET readiness_status='ready_for_handoff'
  WHERE prospect_id=qa_prospect;
 qa_partner:=public.pg_convert_prospect(
  qa_prospect,'Fictional Partner QA Company Ltd','TEST-REG-20261011',
  '123 Imaginary Avenue, Lisbon','Fictional Signatory',true);
 IF qa_partner IS NULL OR NOT EXISTS(SELECT 1 FROM public.partners partner
  WHERE partner.id=qa_partner AND partner.status='Onboarding'
  AND partner.partner_type='Strategic Connector'
  AND partner.activation_phase='invitation_pending')
 THEN RAISE EXCEPTION 'FAIL official CMSC conversion'; END IF;
 SELECT r.reservation_token INTO qa_token FROM public.pg_reserve_partner_invitation(qa_prospect,qa_contact) r;
 IF qa_token IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.partner_growth_invitations inv
  WHERE inv.reservation_token=qa_token AND inv.invited_role='partner_connector'::public.app_role
  AND inv.status='reserved' AND inv.partner_id=qa_partner
 ) THEN RAISE EXCEPTION 'FAIL HQ reserved wrong invitation role/partner'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.partner_id=qa_partner)
 THEN RAISE EXCEPTION 'FAIL reservation automatically created account'; END IF;
 PERFORM set_config('pg_test.partner',qa_partner::text,true);
 PERFORM set_config('pg_test.prospect',qa_prospect::text,true);
 PERFORM set_config('pg_test.reservation',qa_token::text,true);
END;$setup$;
RESET ROLE;

-- Simulate the permissions of a newly invited contact using an existing
-- external TEST profile for this transaction ONLY; never touch auth.users.
SELECT set_config('request.jwt.claim.sub','',true);
DO $fixture$
DECLARE qa_external_user uuid; qa_partner uuid:=current_setting('pg_test.partner')::uuid;
BEGIN
 SELECT p.id INTO qa_external_user FROM public.profiles p WHERE p.is_active AND NOT p.is_hq
 AND NOT public.has_role(p.id,'hq_admin'::public.app_role) ORDER BY p.id LIMIT 1;
 IF qa_external_user IS NULL THEN RAISE EXCEPTION 'No external TEST fixture'; END IF;
 UPDATE public.profiles SET partner_id=qa_partner,
 invitation_status='pending',invitation_accepted_at=NULL
 WHERE id=qa_external_user;
 DELETE FROM public.user_module_permissions WHERE user_id=qa_external_user;
 DELETE FROM public.user_roles WHERE user_id=qa_external_user;
 INSERT INTO public.user_roles(user_id,role) VALUES(qa_external_user,'partner_connector'::public.app_role);
 PERFORM set_config('pg_test.user',qa_external_user::text,true);
END;$fixture$;

SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',current_setting('pg_test.user'),true);
SET LOCAL ROLE authenticated;

DO $partner_session$
DECLARE qa_lead uuid;qa_partner uuid:=current_setting('pg_test.partner')::uuid;qa_user uuid:=auth.uid();
BEGIN
 IF qa_user IS DISTINCT FROM current_setting('pg_test.user')::uuid THEN
  RAISE EXCEPTION 'FAIL simulated JWT subject'; END IF;
 IF NOT public.can_access_academy() THEN
  RAISE EXCEPTION 'FAIL Academy permission on simulated first session'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.academy_modules m WHERE m.status='published')
 THEN RAISE EXCEPTION 'FAIL cannot see published Academy module'; END IF;
 IF EXISTS(SELECT 1 FROM public.clients) OR EXISTS(SELECT 1 FROM public.deals)
  OR EXISTS(SELECT 1 FROM public.proposals) OR EXISTS(SELECT 1 FROM public.renewals)
 THEN RAISE EXCEPTION 'FAIL CRM privacy'; END IF;
 UPDATE public.profiles SET invitation_status='active',invitation_accepted_at=now()
 WHERE id=qa_user AND invitation_status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'FAIL invite acceptance state transition'; END IF;
 qa_lead:=public.pg_submit_partner_referral(
  'Fictional Qualified Lead Plant','Fictional Plant Manager',
  'fictional-lead@example.invalid','PT',
  'Fictional maintenance introduction, routed to HQ for qualification');
 IF qa_lead IS NULL OR NOT EXISTS(SELECT 1 FROM public.incoming_leads l
  WHERE l.id=qa_lead AND l.linked_partner_id=qa_partner
  AND l.lead_owner_type='HQ' AND l.lead_source='Partner referral' AND l.status='New')
 THEN RAISE EXCEPTION 'FAIL first referral to HQ'; END IF;
 UPDATE public.incoming_leads SET notes='Attempted unauthorized alteration' WHERE id=qa_lead;
 IF FOUND THEN RAISE EXCEPTION 'FAIL partner modified own HQ-managed referral'; END IF;
 IF EXISTS(SELECT 1 FROM public.academy_module_progress mp WHERE mp.user_id=qa_user)
 THEN RAISE EXCEPTION 'FAIL Academy credit granted automatically'; END IF;
 PERFORM set_config('pg_test.referral',qa_lead::text,true);
END;$partner_session$;
RESET ROLE;

-- Return to HQ JWT; check it can read the exact new referral and audit receipt.
SELECT set_config('request.jwt.claim.sub',(
 SELECT p.id::text FROM public.profiles p WHERE p.is_hq AND p.is_active
 AND public.has_role(p.id,'hq_admin'::public.app_role) ORDER BY p.id LIMIT 1),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $hq_receipt$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.incoming_leads l
  WHERE l.id=current_setting('pg_test.referral')::uuid
  AND l.linked_partner_id=current_setting('pg_test.partner')::uuid
  AND l.lead_owner_type='HQ')
 THEN RAISE EXCEPTION 'FAIL HQ cannot view first referral'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_growth_invitations i
  WHERE i.reservation_token=current_setting('pg_test.reservation')::uuid
  AND i.status='reserved')
 THEN RAISE EXCEPTION 'FAIL invitation reservation missing'; END IF;
END;$hq_receipt$;
RESET ROLE;

SELECT 'PASS' AS simulated_business_flow,
 'Invite remains reserved; no email, no real login, no service completion' AS tested_limit,
 (SELECT count(*) FROM public.partner_prospects
  WHERE company_name='__PG4B2_SAFE_E2E_ROLLBACK__') AS temporary_prospects,
 (SELECT count(*) FROM public.incoming_leads
  WHERE id=current_setting('pg_test.referral')::uuid) AS temporary_hq_referrals;
ROLLBACK;
