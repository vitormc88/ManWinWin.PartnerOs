-- Sprint 4B.2 TEST acceptance, run only as BEGIN/.../ROLLBACK.
-- Requires role enums and S4B1 installed; 4B2 access migration may be inside same transaction.
SELECT set_config('request.jwt.claim.sub',
 (SELECT id::text FROM public.profiles WHERE is_active AND is_hq
 AND public.has_role(id,'hq_admin'::public.app_role) ORDER BY id LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $admin$
DECLARE p uuid;c uuid;outid uuid;token uuid;
BEGIN
 INSERT INTO public.partner_prospects(company_name,country,proposed_partner_type,fit_summary,interest_evidence,created_by)
 VALUES('__4B2_INVITATION_ROLLBACK__','PT','CMSC','Relevant maintenance partners','Prospect expressed collaboration intent',auth.uid()) RETURNING id INTO p;
 INSERT INTO public.partner_prospect_contacts(prospect_id,name,email,is_primary)
 VALUES(p,'QA Connector Contact','s4b2-rollback@example.invalid',true) RETURNING id INTO c;
 INSERT INTO public.partner_prospect_activation_plans(prospect_id,target_model,hq_activation_owner,kickoff_objective,first_value_milestone,created_by)
 VALUES(p,'CMSC',auth.uid(),'Kickoff and responsibilities','First qualified referral',auth.uid());
 UPDATE public.partner_prospects SET qualification_decision='Proceed',recruitment_stage='Qualified' WHERE id=p;
 UPDATE public.partner_prospects SET recruitment_stage='Agreement Pending' WHERE id=p;
 UPDATE public.partner_prospects SET recruitment_stage='Signed',agreement_reference='S4B2-ROLLBACK-SIGNED',
  agreement_signed_on=current_date WHERE id=p;
 UPDATE public.partner_prospect_activation_plans SET legal_review_status='approved',legal_review_reference='S4B2-LEGAL' WHERE prospect_id=p;
 UPDATE public.partner_prospect_activation_plans SET readiness_status='ready_for_handoff' WHERE prospect_id=p;
 outid:=public.pg_convert_prospect(p,'S4B2 Rollback Legal Co','REG-4567','Rollback Street 123, Lisbon','QA Signatory',true);
 SELECT reservation_token INTO token FROM public.pg_reserve_partner_invitation(p,c);
 IF token IS NULL THEN RAISE EXCEPTION 'FAIL invitation reservation'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_growth_invitations i WHERE i.reservation_token=token
 AND i.status='reserved' AND i.partner_id=outid AND i.invited_role='partner_connector'::public.app_role)
 THEN RAISE EXCEPTION 'FAIL CMSC role mismatch'; END IF;
 BEGIN
  PERFORM public.pg_reserve_partner_invitation(p,c);
  RAISE EXCEPTION 'FAIL duplicate reservation succeeded';
 EXCEPTION WHEN others THEN IF SQLSTATE<>'23505' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE partner_id=outid) THEN
  RAISE EXCEPTION 'FAIL reservation created a user'; END IF;
 IF EXISTS(SELECT 1 FROM public.academy_certifications a JOIN public.profiles pp ON pp.id=a.user_id WHERE pp.partner_id=outid)
 THEN RAISE EXCEPTION 'FAIL invitation certified a user'; END IF;
END;$admin$;
RESET ROLE;

-- Prove external roles cannot reserve on the same prospect.
SELECT set_config('request.jwt.claim.sub',(
 SELECT id::text FROM public.profiles WHERE is_active AND NOT is_hq ORDER BY id LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $external$
DECLARE p uuid;c uuid;
BEGIN
 SELECT id INTO p FROM public.partner_prospects WHERE company_name='__4B2_INVITATION_ROLLBACK__';
 SELECT id INTO c FROM public.partner_prospect_contacts WHERE prospect_id=p LIMIT 1;
 BEGIN
  PERFORM public.pg_reserve_partner_invitation(p,c);
  RAISE EXCEPTION 'FAIL partner reserved invitation';
 EXCEPTION WHEN others THEN IF SQLSTATE<>'42501' THEN RAISE; END IF; END;
END;$external$;
RESET ROLE;

-- As SQL superuser, assign a temporary TEST-only auth profile to the rolled-back partner.
SELECT set_config('request.jwt.claim.sub','',true);
DO $setup$
DECLARE ext uuid;p uuid;pid uuid;
BEGIN
 SELECT id INTO ext FROM public.profiles WHERE is_active AND NOT is_hq ORDER BY id LIMIT 1;
 SELECT converted_partner_id INTO pid FROM public.partner_prospects WHERE company_name='__4B2_INVITATION_ROLLBACK__';
 UPDATE public.profiles SET partner_id=pid WHERE id=ext;
 -- Simulate a genuinely new invitee, with no legacy roles or overrides.
 DELETE FROM public.user_module_permissions WHERE user_id=ext;
 DELETE FROM public.user_roles WHERE user_id=ext;
 INSERT INTO public.user_roles(user_id,role) VALUES(ext,'partner_connector'::public.app_role)
 ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',ext::text,true);
END;$setup$;
SET LOCAL ROLE authenticated;
DO $trainee$
DECLARE lead_id uuid;my_partner uuid;
BEGIN
 IF NOT public.can_access_academy() THEN RAISE EXCEPTION 'FAIL trainee Academy unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.get_effective_permissions(auth.uid()) WHERE module_key='onboarding' AND access_level='view') THEN
  RAISE EXCEPTION 'FAIL Academy template'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_effective_permissions(auth.uid()) WHERE module_key IN ('clients','pipeline','partners','partner_growth','customer_explorer') AND access_level<>'no_access') THEN
  RAISE EXCEPTION 'FAIL excessive CRM rights'; END IF;
 SELECT partner_id INTO my_partner FROM public.profiles WHERE id=auth.uid();
 lead_id:=public.pg_submit_partner_referral('QA Referral Customer','Referral Contact','referral@example.invalid','PT','Interested in preventive maintenance');
 IF NOT EXISTS(SELECT 1 FROM public.incoming_leads WHERE id=lead_id AND linked_partner_id=my_partner AND lead_owner_type='HQ') THEN
  RAISE EXCEPTION 'FAIL referral routing or visibility'; END IF;
 BEGIN
  UPDATE public.incoming_leads SET notes='Tampered' WHERE id=lead_id;
  RAISE EXCEPTION 'FAIL trainee edited own HQ-managed referral';
 EXCEPTION WHEN others THEN IF SQLSTATE NOT IN ('42501','23514') THEN RAISE; END IF; END;
END;$trainee$;
RESET ROLE;
SELECT 'PASS' AS s4b2_roles_and_invitation_qa,
  (SELECT count(*) FROM public.partner_growth_invitations WHERE email='s4b2-rollback@example.invalid') AS transaction_only_invites;
