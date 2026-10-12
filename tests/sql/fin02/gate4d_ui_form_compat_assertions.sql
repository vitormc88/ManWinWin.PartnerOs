-- FIN01 Gate4D-v2 source-anchored full CreateProposalDialog Business Draft payload.
-- Uses source-required fixture + actual TEST column overlay, fictional actors.
\set ON_ERROR_STOP on
CREATE FUNCTION public.gate4d_ui_payload(
 _mode text DEFAULT 'compare_keepit_useit',
 _source text DEFAULT 'deal',
 _sourceid uuid DEFAULT '00000000-0000-4000-8000-000000000101',
 _partner uuid DEFAULT NULL,
 _version integer DEFAULT 2
) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT public.gate4d_payload(_source,_sourceid,_partner,'Fictitious Thai Union Business') ||
 pg_catalog.jsonb_build_object(
  'lead_id',CASE WHEN _source='deal' THEN _sourceid END,
  'renewal_id',NULL,'contract_id',
    CASE WHEN _source='client' THEN '00000000-0000-4000-8000-000000000401' END,
  'license_id',CASE WHEN _source='client' THEN '00000000-0000-4000-8000-000000000501' END,
  'version',_version,'language','PT','plan',NULL,
  'status','Draft','hosting','SaaS','proposal_mode',_mode,
  'license_model',CASE WHEN _mode='keepit_only' THEN 'keepit'
                       WHEN _mode='useit_only' THEN 'useit' ELSE NULL END,
  'deployment','saas','project_name','Synthetic Thai Union Trial',
  'country','PT','proposal_date','2026-10-12','validity_days',45,
  'payment_terms','30 days synthetic','notes','No actual customers',
  'implementation_type',NULL,'per_diem',0,'discount_pct',0,
  'discount_scope','none','software_discount_pct',0,
  'services_discount_pct',0,'include_requests_module',true,
  'web_users',2,'service_days',NULL,'software_subtotal',1000,
  'services_subtotal',50,'renewal_change_mode','straight',
  'source_plan',NULL,'target_plan',NULL,'entitlements',NULL,
  'implementation_source',NULL,'implementation_hours',NULL,
  'implementation_hourly_rate',NULL,'implementation_gross',NULL,
  'implementation_discount_amount',NULL,'implementation_net',NULL,
  'implementation_transition_rule_id',NULL,
  'implementation_transition_rule_code',NULL,
  'implementation_justification',NULL,
  'created_by','00000000-0000-4000-8000-000000000301');
$$;
CREATE FUNCTION public.gate4d_ui_items(_web_renews boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT pg_catalog.jsonb_agg(i || pg_catalog.jsonb_build_object(
   'description','Synthetic priced line',
   'is_override',false,'pricing_rule_code','SYNTHETIC_RULE',
   'line_type','catalog','change_kind',NULL) ORDER BY (i->>'sort_order')::integer)
 FROM pg_catalog.jsonb_array_elements(public.gate4d_items(_web_renews,false)) AS i;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
-- Actual UI defaults to comparing KeepIT + UseIT. Draft comparison MUST be
-- SAVABLE with complete UI fields, but later FIN02 award must be blocked until
-- chosen-option snapshot. The new RPC saves the headline source lines only.
SELECT public.save_business_draft_form_candidate(
 '00000000-0000-4000-8000-000000000911',NULL,
 public.gate4d_ui_payload(),public.gate4d_ui_items(false));
SELECT jsonb_build_object(
 'header',(SELECT jsonb_build_object(
 'mode',proposal_mode,'model',license_model,'version',version,'language',language,
 'lead_match',(lead_id=deal_id),'creator_match',(created_by=auth.uid()),
 'project',project_name,'validity',validity_days,'payment',payment_terms,
 'include_requests',include_requests_module,'web_users',web_users)
 FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000911'),
 'items',(SELECT count(*) FROM public.proposal_items WHERE proposal_id='00000000-0000-4000-8000-000000000911'),
 'priced_source',(SELECT count(*) FROM public.proposal_items
  WHERE proposal_id='00000000-0000-4000-8000-000000000911'
  AND pricing_rule_code='SYNTHETIC_RULE' AND description='Synthetic priced line'
  AND NOT is_override),
 'expected',(SELECT expected_value FROM public.deals WHERE id='00000000-0000-4000-8000-000000000101')
) AS debug_fictional_only;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.proposals p
   WHERE id='00000000-0000-4000-8000-000000000911'
   AND status='Draft' AND proposal_mode='compare_keepit_useit'
   AND license_model IS NULL AND version=2 AND language='PT'
   AND lead_id=deal_id AND created_by=auth.uid() AND project_name='Synthetic Thai Union Trial'
   AND validity_days=45 AND payment_terms='30 days synthetic'
   AND include_requests_module=true AND web_users=2)
 OR (SELECT count(*) FROM public.proposal_items WHERE proposal_id='00000000-0000-4000-8000-000000000911')<>4
 OR NOT EXISTS(SELECT 1 FROM public.proposal_items
   WHERE proposal_id='00000000-0000-4000-8000-000000000911'
   AND pricing_rule_code='SYNTHETIC_RULE' AND description='Synthetic priced line'
   AND NOT is_override)
 OR (SELECT expected_value FROM public.deals WHERE id='00000000-0000-4000-8000-000000000101')<>1608
 THEN RAISE EXCEPTION 'UI compare Draft fields/lines/Deal value not faithfully saved'; END IF;
END $$;
-- Edit to KeepIT only, preserving existing full-form metadata fields and same
-- version while changing edition-specific state.
DO $$
DECLARE _old timestamptz;
BEGIN
 SELECT updated_at INTO _old FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000911';
 PERFORM public.save_business_draft_form_candidate(
  '00000000-0000-4000-8000-000000000911',_old,
  public.gate4d_ui_payload('keepit_only') ||
    '{"notes":"Edited in form; document refs must remain untouched"}'::jsonb,
  public.gate4d_ui_items(false));
 IF NOT EXISTS(SELECT 1 FROM public.proposals
  WHERE id='00000000-0000-4000-8000-000000000911'
    AND proposal_mode='keepit_only' AND license_model='keepit'
    AND notes='Edited in form; document refs must remain untouched'
    AND version=2)
 THEN RAISE EXCEPTION 'UI edit lost mandatory Business metadata'; END IF;
END $$;
-- Client proposal with existing contract/license safely linked to SAME client.
SELECT public.save_business_draft_form_candidate(
 '00000000-0000-4000-8000-000000000912',NULL,
 public.gate4d_ui_payload('useit_only','client',
  '00000000-0000-4000-8000-000000000111',
  '00000000-0000-4000-8000-000000000201'),public.gate4d_ui_items(false));
DO $$
BEGIN
 IF (SELECT contract_id FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000912')
 IS DISTINCT FROM '00000000-0000-4000-8000-000000000401'::uuid
 OR (SELECT license_id FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000912')
 IS DISTINCT FROM '00000000-0000-4000-8000-000000000501'::uuid
 OR (SELECT expected_value FROM public.deals
 WHERE id='00000000-0000-4000-8000-000000000102')<>0
 THEN RAISE EXCEPTION 'UI Client-source contract/license or Deal isolation failed'; END IF;
END $$;

-- The generated source payload *must* match: stale created_by, fraudulent
-- lead_id, forged official doc refs or acceptance field cannot be written.
DO $$
DECLARE _seen boolean;
BEGIN
 _seen:=false;
 BEGIN
  PERFORM public.save_business_draft_form_candidate(
  '00000000-0000-4000-8000-000000000913',NULL,
  public.gate4d_ui_payload() || '{"docx_url":"forged.pdf"}'::jsonb,
  public.gate4d_ui_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _seen:=true; END;
 IF NOT _seen THEN RAISE EXCEPTION 'Forged document or status field accepted'; END IF;
 _seen:=false;
 BEGIN
  PERFORM public.save_business_draft_form_candidate(
  '00000000-0000-4000-8000-000000000913',NULL,
  public.gate4d_ui_payload() || '{"lead_id":"00000000-0000-4000-8000-000000000102"}'::jsonb,
  public.gate4d_ui_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _seen:=true; END;
 IF NOT _seen THEN RAISE EXCEPTION 'Deal legacy lead spoofing accepted'; END IF;
 _seen:=false;
 BEGIN
  PERFORM public.save_business_draft_form_candidate(
  '00000000-0000-4000-8000-000000000913',NULL,
  public.gate4d_ui_payload() || '{"created_by":"00000000-0000-4000-8000-000000000302"}'::jsonb,
  public.gate4d_ui_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _seen:=true; END;
 IF NOT _seen THEN RAISE EXCEPTION 'Author identity spoof accepted'; END IF;
 _seen:=false;
 BEGIN
  PERFORM public.save_business_draft_form_candidate(
  '00000000-0000-4000-8000-000000000913',NULL,
  public.gate4d_ui_payload() || '{"status":"Won"}'::jsonb,
  public.gate4d_ui_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _seen:=true; END;
 IF NOT _seen THEN RAISE EXCEPTION 'State escalation accepted'; END IF;
 _seen:=false;
 BEGIN
  PERFORM public.save_business_draft_form_candidate(
  '00000000-0000-4000-8000-000000000913',NULL,
  public.gate4d_ui_payload() || '{"license_model":"useit"}'::jsonb,
  public.gate4d_ui_items(false));
 EXCEPTION WHEN SQLSTATE '42501' THEN _seen:=true; END;
 IF NOT _seen THEN RAISE EXCEPTION 'Compare-mode model mismatch accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.proposals WHERE id='00000000-0000-4000-8000-000000000913')
 THEN RAISE EXCEPTION 'Forged save inserted orphan proposal'; END IF;
END $$;
RESET ROLE;
SELECT 'FIN01 Gate4D v2 PASS — full UI header/line field preservation, compare draft, linked client, RLS and forbidden lifecycle mutation' AS result;
