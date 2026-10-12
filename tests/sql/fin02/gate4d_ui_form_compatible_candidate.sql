-- FIN01 Gate4D-v2: ACTUAL CreateProposalDialog PAYLOAD SHAPE compatibility
-- LAB-ONLY, NOT AN INSTALLABLE MIGRATION, NOT WIRED TO THE FRONTEND.
-- Requires previous v1 SECURITY INVOKER lab candidate and catalog-column overlay.
-- Real TEST role graph/trigger set not restored and backend discount limits await signoff.
CREATE OR REPLACE FUNCTION public.save_business_draft_form_candidate(
 _proposal_id uuid, _expected_updated_at timestamptz,
 _payload jsonb, _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE
 _actor uuid := auth.uid();
 _source text;
 _deal uuid;
 _client uuid;
 _partner uuid;
 _mode text;
 _license text;
 _orig public.proposals%ROWTYPE;
 _next public.proposals%ROWTYPE;
 _thin jsonb;
 _created boolean;
BEGIN
 IF _actor IS NULL OR _proposal_id IS NULL
 OR _payload IS NULL OR pg_catalog.jsonb_typeof(_payload)<>'object'
 OR _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array'
 THEN RAISE EXCEPTION 'FORM_AUTH_OR_PAYLOAD_INVALID' USING ERRCODE='42501'; END IF;

 -- Strict UI allowlist is the 2026-10-12 CreateProposalDialog.insertData shape.
 -- Reject workflow/document/acceptance/audit fields not owned by Draft save.
 IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(_payload) AS k
            WHERE k NOT IN ('source_type', 'lead_id', 'deal_id', 'renewal_id', 'client_id', 'partner_uuid', 'client_name', 'product_family', 'proposal_mode', 'business_config', 'total_year_1', 'total_recurring', 'discount_amount', 'status', 'created_by', 'version', 'language', 'plan', 'hosting', 'license_model', 'deployment', 'project_name', 'country', 'proposal_date', 'validity_days', 'payment_terms', 'notes', 'implementation_type', 'per_diem', 'discount_pct', 'discount_scope', 'software_discount_pct', 'services_discount_pct', 'include_requests_module', 'web_users', 'service_days', 'software_subtotal', 'services_subtotal', 'renewal_change_mode', 'source_plan', 'target_plan', 'entitlements', 'implementation_source', 'implementation_hours', 'implementation_hourly_rate', 'implementation_gross', 'implementation_discount_amount', 'implementation_net', 'implementation_transition_rule_id', 'implementation_transition_rule_code', 'implementation_justification', 'contract_id', 'license_id')) THEN
    RAISE EXCEPTION 'FORM_FORBIDDEN_HEADER_FIELD' USING ERRCODE='42501';
 END IF;
 IF EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(_items) AS i
  WHERE pg_catalog.jsonb_typeof(i)<>'object'
   OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(i) AS k
     WHERE k IN ('id','proposal_id','created_at'))
 ) THEN RAISE EXCEPTION 'FORM_FORBIDDEN_LINE_IDENTITY' USING ERRCODE='42501'; END IF;

 _source:=_payload->>'source_type';
 _mode:=_payload->>'proposal_mode';
 _license:=_payload->>'license_model';
 _deal:=NULLIF(_payload->>'deal_id','')::uuid;
 _client:=NULLIF(_payload->>'client_id','')::uuid;
 _partner:=NULLIF(_payload->>'partner_uuid','')::uuid;
 IF _payload->>'status' IS DISTINCT FROM 'Draft'
 OR _payload->>'product_family' IS DISTINCT FROM 'Business'
 OR _source NOT IN ('deal','client') OR _source IS NULL
 OR _mode NOT IN ('keepit_only','useit_only','compare_keepit_useit') OR _mode IS NULL
 OR (_mode='keepit_only' AND _license IS DISTINCT FROM 'keepit')
 OR (_mode='useit_only' AND _license IS DISTINCT FROM 'useit')
 OR (_mode='compare_keepit_useit' AND _license IS NOT NULL)
 OR (_payload ? 'created_by' AND NULLIF(_payload->>'created_by','')::uuid IS DISTINCT FROM _actor)
 OR (_source='deal' AND
     ( _client IS NOT NULL
       OR (_payload->>'lead_id') IS DISTINCT FROM _payload->>'deal_id'
       OR NULLIF(_payload->>'contract_id','') IS NOT NULL
       OR NULLIF(_payload->>'license_id','') IS NOT NULL))
 OR (_source='client' AND
     (_deal IS NOT NULL OR NULLIF(_payload->>'lead_id','') IS NOT NULL))
 OR NULLIF(_payload->>'renewal_id','') IS NOT NULL
 THEN RAISE EXCEPTION 'FORM_INVALID_SOURCE_OR_MODE' USING ERRCODE='42501'; END IF;
 IF _source='client' THEN
  IF (_payload->>'contract_id' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.contracts c WHERE c.id=(_payload->>'contract_id')::uuid AND c.client_id=_client))
   OR (_payload->>'license_id' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.licenses l WHERE l.id=(_payload->>'license_id')::uuid AND l.client_id=_client))
  THEN RAISE EXCEPTION 'FORM_LINKED_CUSTOMER_MISMATCH' USING ERRCODE='42501'; END IF;
 END IF;
 -- v1 verifies same-actor RLS via can_manage_proposal_source, canonical
 -- Deal/Client partner scope, per-line amount math, and locks old Draft.
 -- Preserve compare MODE on Draft: the form saves a KeepIT headline with
 -- Business config containing both options. It may NOT be awarded as-is.
 _thin:=pg_catalog.jsonb_build_object(
    'source_type',_source,'deal_id',_deal,'client_id',_client,
    'partner_uuid',_partner,'client_name',_payload->>'client_name',
    'proposal_mode',CASE WHEN _mode='compare_keepit_useit'
       THEN 'keepit_only' ELSE _mode END,
    'product_family','Business',
    'total_year_1',_payload->'total_year_1',
    'total_recurring',_payload->'total_recurring',
    'discount_amount',_payload->'discount_amount',
    'business_config',_payload->'business_config');
 SELECT * INTO _orig FROM public.proposals WHERE id=_proposal_id;
 _created:=NOT FOUND;
 -- The existing Draft's VERSION and immutable source are guarded inside v1;
 -- the UI-calculated version must not change while editing.
 IF NOT _created AND
   (_payload ? 'version' AND (_payload->>'version')::integer IS DISTINCT FROM _orig.version)
 THEN RAISE EXCEPTION 'FORM_VERSION_LOCKED' USING ERRCODE='40001'; END IF;
 IF _created AND (NOT (_payload ? 'version') OR
   (_payload->>'version')::integer < 1) THEN
   RAISE EXCEPTION 'FORM_VERSION_REQUIRED' USING ERRCODE='22023'; END IF;

 PERFORM public.save_business_draft_atomic_candidate(
   _proposal_id,_expected_updated_at,_thin,_items);
 SELECT * INTO _orig FROM public.proposals WHERE id=_proposal_id FOR UPDATE;
 _next:=pg_catalog.jsonb_populate_record(_orig,_payload);
 -- Preserve original identity, author, immutable docs and lifecycle metadata:
 -- only deliberately editable UI columns are updated. Real TEST triggers
 -- are not reconstructed in this LAB; their compatibility remains a gate.
 UPDATE public.proposals SET
    language = _next.language,
    plan = _next.plan,
    hosting = _next.hosting,
    license_model = _next.license_model,
    deployment = _next.deployment,
    project_name = _next.project_name,
    country = _next.country,
    proposal_date = _next.proposal_date,
    validity_days = _next.validity_days,
    payment_terms = _next.payment_terms,
    notes = _next.notes,
    implementation_type = _next.implementation_type,
    per_diem = _next.per_diem,
    discount_pct = _next.discount_pct,
    discount_scope = _next.discount_scope,
    software_discount_pct = _next.software_discount_pct,
    services_discount_pct = _next.services_discount_pct,
    include_requests_module = _next.include_requests_module,
    web_users = _next.web_users,
    service_days = _next.service_days,
    software_subtotal = _next.software_subtotal,
    services_subtotal = _next.services_subtotal,
    renewal_change_mode = _next.renewal_change_mode,
    source_plan = _next.source_plan,
    target_plan = _next.target_plan,
    entitlements = _next.entitlements,
    implementation_source = _next.implementation_source,
    implementation_hours = _next.implementation_hours,
    implementation_hourly_rate = _next.implementation_hourly_rate,
    implementation_gross = _next.implementation_gross,
    implementation_discount_amount = _next.implementation_discount_amount,
    implementation_net = _next.implementation_net,
    implementation_transition_rule_id = _next.implementation_transition_rule_id,
    implementation_transition_rule_code = _next.implementation_transition_rule_code,
    implementation_justification = _next.implementation_justification,
    contract_id = _next.contract_id,
    license_id = _next.license_id,
    version = CASE WHEN _created THEN _next.version ELSE _orig.version END,
    proposal_mode = _mode,
    updated_at = pg_catalog.clock_timestamp()
 WHERE id=_proposal_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORM_HEADER_UPDATE_MISSING'; END IF;
 -- v1 creates all priced source-line entries atomically. Fill the remaining
 -- 2026-10-12 UI line metadata on those same sort_order rows.
 UPDATE public.proposal_items i SET
    description = j.description,
    is_override = j.is_override,
    pricing_rule_code = j.pricing_rule_code,
    pricing_rule_id = j.pricing_rule_id,
    source_plan = j.source_plan,
    target_plan = j.target_plan,
    line_type = j.line_type,
    change_kind = j.change_kind,
    gross_delta = j.gross_delta,
    access_type = j.access_type,
    total_licensed_qty = j.total_licensed_qty,
    included_qty = j.included_qty,
    billable_qty = j.billable_qty,
    implementation_source = j.implementation_source,
    transition_rule_code = j.transition_rule_code,
    implementation_hours = j.implementation_hours,
    implementation_hourly_rate = j.implementation_hourly_rate,
    justification = j.justification
 FROM pg_catalog.jsonb_to_recordset(_items) AS j(
    sort_order integer,
    description text,
    is_override boolean,
    pricing_rule_code text,
    pricing_rule_id uuid,
    source_plan integer,
    target_plan integer,
    line_type text,
    change_kind text,
    gross_delta numeric,
    access_type text,
    total_licensed_qty numeric,
    included_qty numeric,
    billable_qty numeric,
    implementation_source text,
    transition_rule_code text,
    implementation_hours numeric,
    implementation_hourly_rate numeric,
    justification text
 )
 WHERE i.proposal_id=_proposal_id AND i.sort_order=j.sort_order;

 -- Expected deal value is part of the same Draft transaction. This preserves
 -- current CreateProposalDialog semantics without best-effort partial commit.
 IF _source='deal' THEN
   UPDATE public.deals SET expected_value=(_payload->>'total_year_1')::numeric
   WHERE id=_deal;
   IF NOT FOUND THEN RAISE EXCEPTION 'FORM_DEAL_VALUE_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN _proposal_id;
END $fn$;
REVOKE ALL ON FUNCTION public.save_business_draft_form_candidate(uuid,timestamptz,jsonb,jsonb)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_business_draft_form_candidate(uuid,timestamptz,jsonb,jsonb)
 TO authenticated;
