-- RUN ONLY WITH THE 4B.1 MIGRATION PRESENT, IDEALLY WITHIN A THROWAWAY TRANSACTION.
-- Authenticated HQ Admin regression. All rows are tagged and MUST be rolled back.
SELECT set_config('request.jwt.claim.sub',(
 SELECT id::text FROM public.profiles WHERE is_active AND is_hq
 AND public.has_role(id,'hq_admin'::public.app_role) ORDER BY id LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $qa$
DECLARE pid uuid; dup uuid; outid uuid; again uuid; prior int; n int;
BEGIN
 INSERT INTO public.partner_prospects(company_name,country,proposed_partner_type,fit_summary,interest_evidence,created_by)
 VALUES('__4B1_CONVERT_ROLLBACK__','PT','CMSC','Sector access good','A clear first introduction',auth.uid()) RETURNING id INTO pid;
 INSERT INTO public.partner_prospect_contacts(prospect_id,name,email,is_primary) VALUES(pid,'Simulation Name','simulated@example.invalid',true);
 INSERT INTO public.partner_prospect_activation_plans(prospect_id,target_model,hq_activation_owner,kickoff_objective,first_value_milestone,created_by)
 VALUES(pid,'CMSC',auth.uid(),'Schedule kickoff','First qualified introduction',auth.uid());

 BEGIN
  PERFORM public.pg_convert_prospect(pid,'Example Legal Company','REG-12345','Example Street 123, Lisbon','Example Signatory',true);
  RAISE EXCEPTION 'FAIL unsigned converted';
 EXCEPTION WHEN others THEN IF SQLSTATE <> '23514' THEN RAISE; END IF; END;

 UPDATE public.partner_prospects SET qualification_decision='Proceed',recruitment_stage='Qualified' WHERE id=pid;
 UPDATE public.partner_prospects SET recruitment_stage='Agreement Pending' WHERE id=pid;
 UPDATE public.partner_prospects SET recruitment_stage='Signed',agreement_reference='DOC-ROLLBACK',agreement_signed_on=current_date WHERE id=pid;

 BEGIN
  PERFORM public.pg_convert_prospect(pid,'Example Legal Company','REG-12345','Example Street 123, Lisbon','Example Signatory',true);
  RAISE EXCEPTION 'FAIL legal review bypassed';
 EXCEPTION WHEN others THEN IF SQLSTATE <> '23514' THEN RAISE; END IF; END;

 UPDATE public.partner_prospect_activation_plans SET legal_review_status='approved',legal_review_reference='LEGAL-ROLLBACK' WHERE prospect_id=pid;
 UPDATE public.partner_prospect_activation_plans SET readiness_status='ready_for_handoff' WHERE prospect_id=pid;
 BEGIN
  PERFORM public.pg_convert_prospect(pid,'Example Legal Company','REG-12345','Example Street 123, Lisbon','Example Signatory',false);
  RAISE EXCEPTION 'FAIL unchecked identity accepted';
 EXCEPTION WHEN others THEN IF SQLSTATE <> '23514' THEN RAISE; END IF; END;

 SELECT count(*) INTO prior FROM public.partners;
 outid:=public.pg_convert_prospect(pid,'Example Legal Company','REG-12345','Example Street 123, Lisbon','Example Signatory',true);
 IF outid IS NULL OR (SELECT count(*) FROM public.partners)<>prior+1 THEN RAISE EXCEPTION 'FAIL not exactly one partner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partners WHERE id=outid
  AND partner_type='Strategic Connector' AND partnership_level='Strategic Connector'
  AND activation_phase='invitation_pending' AND onboarding_status='Not Started')
 THEN RAISE EXCEPTION 'FAIL commercial type/status mapping'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_prospect_conversion_receipts WHERE prospect_id=pid
  AND partner_id=outid AND converted_by=auth.uid()) THEN RAISE EXCEPTION 'FAIL immutable receipt'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_prospects WHERE id=pid AND converted_partner_id=outid) THEN RAISE EXCEPTION 'FAIL historical link'; END IF;

 again:=public.pg_convert_prospect(pid,'','','','',false);
 IF again IS DISTINCT FROM outid THEN RAISE EXCEPTION 'FAIL retry not idempotent'; END IF;
 IF (SELECT count(*) FROM public.partner_prospect_conversion_receipts WHERE prospect_id=pid)<>1 THEN RAISE EXCEPTION 'FAIL duplicated receipt'; END IF;

 BEGIN
  UPDATE public.partner_prospect_conversion_receipts SET legal_name='Changed' WHERE prospect_id=pid;
  RAISE EXCEPTION 'FAIL immutable receipt writable';
 EXCEPTION WHEN others THEN IF SQLSTATE NOT IN ('23514','42501') THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.partner_prospects SET converted_partner_id=NULL WHERE id=pid;
  RAISE EXCEPTION 'FAIL direct conversion unlink accepted';
 EXCEPTION WHEN others THEN IF SQLSTATE NOT IN ('23514','42501') THEN RAISE; END IF; END;

 -- Existing partner identity may not be duplicated by a separately qualified prospect.
 INSERT INTO public.partner_prospects(company_name,country,proposed_partner_type,fit_summary,interest_evidence,created_by)
 VALUES('__4B1_CONVERT_ROLLBACK__','PT','CMSC','Sector access good','A second referral',auth.uid()) RETURNING id INTO dup;
 INSERT INTO public.partner_prospect_contacts(prospect_id,name,is_primary) VALUES(dup,'Second Contact',true);
 INSERT INTO public.partner_prospect_activation_plans(prospect_id,target_model,hq_activation_owner,kickoff_objective,first_value_milestone,created_by)
 VALUES(dup,'CMSC',auth.uid(),'Kickoff with second contact','First qualified referral',auth.uid());
 UPDATE public.partner_prospects SET recruitment_stage='Qualified',qualification_decision='Proceed' WHERE id=dup;
 UPDATE public.partner_prospects SET recruitment_stage='Agreement Pending' WHERE id=dup;
 UPDATE public.partner_prospects SET recruitment_stage='Signed',agreement_reference='DOC-DUP-ROLLBACK',agreement_signed_on=current_date WHERE id=dup;
 UPDATE public.partner_prospect_activation_plans SET legal_review_status='approved',legal_review_reference='LEGAL-DUP-ROLLBACK' WHERE prospect_id=dup;
 UPDATE public.partner_prospect_activation_plans SET readiness_status='ready_for_handoff' WHERE prospect_id=dup;
 BEGIN
  PERFORM public.pg_convert_prospect(dup,'Different Legal Company','REG-5678','Second Street 123, Lisbon','Another Signatory',true);
  RAISE EXCEPTION 'FAIL duplicate company converted';
 EXCEPTION WHEN others THEN IF SQLSTATE <> '23505' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.partners)<>prior+1 THEN RAISE EXCEPTION 'FAIL duplicate inserted partner'; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE partner_id=outid)<>0 THEN RAISE EXCEPTION 'FAIL unexpected user access'; END IF;
 IF (SELECT count(*) FROM public.academy_module_progress WHERE user_id IN (SELECT id FROM public.profiles WHERE partner_id=outid))<>0 THEN RAISE EXCEPTION 'FAIL Academy auto progress'; END IF;
END;$qa$;
RESET ROLE;
SELECT 'PASS' AS s4b1_conversion, (SELECT count(*) FROM public.partner_prospect_conversion_receipts WHERE company_name='__4B1_CONVERT_ROLLBACK__') AS temporary_receipts;
