-- SYNTHETIC LOCAL QA ONLY. Never execute this fixture in TEST/PROD.
\set ON_ERROR_STOP on
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
create function public.is_hq_user(uuid) returns boolean language sql stable as $$ select $1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
create function public.can_manage_client(uuid) returns boolean language sql stable as $$ select auth.uid() in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) and $1='11111111-1111-4111-8111-111111111111'::uuid $$;
create function public.can_view_client(uuid) returns boolean language sql stable as $$ select can_manage_client($1) $$;
create function public.can_manage_proposal_source(text,uuid,uuid,uuid,uuid) returns boolean language sql stable as $$ select $1='client' and can_manage_client($4) $$;
create table public.clients(id uuid primary key default gen_random_uuid(),client_code text,short_name text,commercial_name text,phone text,fax text,email text,website text,address text,state_region text,postal_code text,city text,country text,sector text,partner_id text,account_manager text,manager_owner text,installation_location text,first_installation_date date,first_installed_version text,current_version text,award_reference text,is_premium boolean default false,has_custom_reports boolean default false,has_custom_routine boolean default false,is_inactive boolean default false,auto_update boolean default false,product_type text,license_type text,cloud_onpremise text,status text,observations text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),source_deal_id uuid,partner_uuid uuid,account_manager_id uuid,manager_owner_id uuid,source_proposal_id uuid,is_hq_direct boolean default false);
create table public.contract_lines(id uuid primary key default gen_random_uuid(),contract_id uuid,client_id uuid,line_type text,description text,related_license_id uuid,related_module_id uuid,related_plugin_id uuid,amount numeric,currency text,billing_frequency text,start_date date,end_date date,notes text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),source text,source_item_id uuid);
create table public.contracts(id uuid primary key default gen_random_uuid(),client_id uuid,price_table_reference text,contract_start_date date,contract_end_date date,notice_period_days integer,contract_value numeric,invoiced_value numeric,num_installments integer,hosting_value numeric,mww_web_value numeric,sat_value numeric,total_value numeric,currency text,partner_revenue_split numeric,renewal_increase_pct numeric,renewal_freeze_notes text,billing_notes text,observations text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),source_proposal_id uuid,is_imported boolean default false,manual_adjustment_amount numeric,calculated_total numeric,contract_mode text);
create table public.licensed_modules(id uuid primary key default gen_random_uuid(),license_id uuid,module_name text,enabled boolean default false,license_type text,periodicity text,start_date date,end_date date,notes text,created_at timestamp with time zone default now(),module_id uuid,plugin_id uuid,item_type text,quantity numeric,unit_price numeric,included_in_base boolean default false);
create table public.licenses(id uuid primary key default gen_random_uuid(),client_id uuid,product text,version text,database_type text,license_start_date date,license_end_date date,license_model text,periodicity text,sat_active boolean default false,sat_end_date date,backoffice_users integer,backoffice_employee_users integer,mobile_users integer,web_accesses integer,api_access boolean default false,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),billing_frequency text,contract_value numeric,notes text,is_draft boolean default false,num_users integer,initial_contract_value numeric,recurring_contract_value numeric,source_proposal_id uuid,lic_code text,lic_serial text,edition text,environment text,license_status text,deployment_type text,currency text,previous_license_id uuid,replaced_by_license_id uuid,proposal_id uuid,deal_id uuid,contract_id uuid,sat_start_date date,included_backoffice_users numeric,included_web_accesses numeric,billable_backoffice_users numeric,billable_web_accesses numeric,entitlement_provenance jsonb);
create table public.lifecycle_events(id uuid primary key default gen_random_uuid(),client_id uuid,event_type text,event_title text,event_description text,actor_id uuid,actor_name text,source_proposal_id uuid,source_proposal_number text,source_license_id uuid,source_contract_id uuid,source_renewal_id uuid,metadata jsonb,occurred_at timestamp with time zone default now(),created_at timestamp with time zone default now());
create table public.modules_catalog(id uuid primary key default gen_random_uuid(),code text,name text,category text,is_active boolean default false,created_at timestamp with time zone default now());
create table public.plugins_catalog(id uuid primary key default gen_random_uuid(),code text,name text,category text,is_active boolean default false,created_at timestamp with time zone default now());
create table public.profiles(id uuid primary key default gen_random_uuid(),full_name text,email text,phone text,avatar_url text,partner_id uuid,is_hq boolean default false,is_active boolean default false,last_login_at timestamp with time zone default now(),invitation_status text,onboarding_completion_pct integer,certification_level integer,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),invitation_sent_at timestamp with time zone default now(),invitation_accepted_at timestamp with time zone default now());
create table public.proposal_items(id uuid primary key default gen_random_uuid(),proposal_id uuid,category text,item_code text,item_name text,description text,qty numeric,unit_price numeric,frequency text,total numeric,is_override boolean default false,is_recurring boolean default false,sort_order integer,created_at timestamp with time zone default now(),discount_type text,discount_value numeric,gross_total numeric,discount_amount numeric,net_total numeric,apply_discount_to_renewal boolean default false,pricing_rule_code text,pricing_rule_id uuid,source_plan integer,target_plan integer,line_type text,change_kind text,gross_delta numeric,access_type text,total_licensed_qty numeric,included_qty numeric,billable_qty numeric,implementation_source text,transition_rule_code text,implementation_hours numeric,implementation_hourly_rate numeric,justification text);
create table public.proposal_status_events(id uuid primary key default gen_random_uuid(),proposal_id uuid,action text,from_status text,to_status text,actor_id uuid,details jsonb,created_at timestamp with time zone default now());
create table public.proposals(id uuid primary key default gen_random_uuid(),lead_id uuid,parent_proposal_id uuid,version integer,language text,plan integer,status text,hosting text,client_name text,project_name text,country text,proposal_date date,validity_days integer,payment_terms text,notes text,implementation_type text,service_days numeric,service_hours numeric,backoffice_work_hours numeric,per_diem numeric,discount_pct numeric,include_requests_module boolean default false,web_users integer,software_subtotal numeric,services_subtotal numeric,discount_amount numeric,total_year_1 numeric,total_recurring numeric,docx_url text,pdf_url text,generated_at timestamp with time zone default now(),created_by uuid,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),discount_scope text,software_discount_pct numeric,services_discount_pct numeric,product_family text,license_model text,proposal_mode text,deployment text,business_config jsonb,source_type text,deal_id uuid,renewal_id uuid,client_id uuid,partner_uuid uuid,contract_id uuid,license_id uuid,renewal_change_mode text,source_plan integer,target_plan integer,entitlements jsonb,target_product_family text,implementation_source text,implementation_transition_rule_id uuid,implementation_transition_rule_code text,implementation_hours numeric,implementation_hourly_rate numeric,implementation_gross numeric,implementation_discount_amount numeric,implementation_net numeric,implementation_justification text,implementation_confirmed_by uuid,implementation_confirmed_at timestamp with time zone default now(),validated_at timestamp with time zone default now(),validated_by uuid,sent_at timestamp with time zone default now(),sent_by uuid,sent_method text,accepted_at timestamp with time zone default now(),accepted_by uuid,acceptance_date date,acceptance_evidence_type text,acceptance_reference text,acceptance_file_path text,acceptance_notes text,difference_category text,difference_note text,commercial_fingerprint text);
create table public.renewals(id uuid primary key default gen_random_uuid(),client_id uuid,partner_id text,contract_id uuid,license_id uuid,renewal_type text,renewal_date date,alert_window_days integer,status text,estimated_value numeric,final_value numeric,assigned_owner text,last_interaction timestamp with time zone default now(),notes text,priority text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),billing_frequency text,source_proposal_id uuid,assigned_user_id uuid,partner_uuid uuid,target_type text,target_id uuid,notice_period_days integer,is_covered_by_contract boolean default false,covered_by_contract_id uuid,outcome text,closed_at timestamp with time zone default now(),closed_by uuid,closing_notes text,loss_reason text,closed_proposal_id uuid,renewal_effective_date date,previous_recurring_value numeric,renewed_recurring_value numeric,one_time_value numeric,previous_renewal_id uuid,next_renewal_id uuid,closure_snapshot jsonb,automation_source text,superseded_by_renewal_id uuid);
create function public.can_manage_proposal_document(uuid) returns boolean language sql stable security definer as $$ select can_manage_client(client_id) from proposals where id=$1 $$;
create function public.proposal_contract_recurring(uuid) returns numeric language sql as $$ select 1000::numeric $$;
create function private.workflow_violation(text,text,uuid,text,jsonb) returns void language plpgsql as $$ begin raise exception '%',$4; end $$;
CREATE OR REPLACE FUNCTION public.validate_proposal(_proposal_id uuid, _difference_category text DEFAULT NULL::text, _difference_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.proposals%ROWTYPE; r public.renewals%ROWTYPE;
  _errs text[] := '{}'::text[]; _items int; _contract numeric; _diff numeric;
  _is_renewal boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF NOT public.can_manage_proposal_document(_proposal_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: you cannot validate this proposal';
  END IF;
  IF p.status = 'Ready' THEN
    RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Ready', 'already_validated', true);
  END IF;
  IF p.status <> 'Draft' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: only Draft proposals can be validated (current: %)', p.status;
  END IF;
  _is_renewal := p.renewal_id IS NOT NULL OR p.source_type = 'renewal';

  IF coalesce(btrim(p.client_name),'') = '' THEN
    _errs := array_append(_errs, 'Client name is missing.'::text);
  END IF;
  SELECT count(*) INTO _items FROM public.proposal_items WHERE proposal_id = p.id;
  IF _items = 0 THEN
    _errs := array_append(_errs, 'The proposal has no line items.'::text);
  END IF;
  IF coalesce(p.total_year_1,0) <= 0 THEN
    _errs := array_append(_errs, 'The proposal has no commercial value.'::text);
  END IF;
  IF coalesce(p.total_recurring,0) < 0 OR coalesce(p.total_recurring,0) > coalesce(p.total_year_1,0) + 0.01 THEN
    _errs := array_append(_errs, 'Recurring total is inconsistent with the Year 1 total.'::text);
  END IF;
  IF _is_renewal AND coalesce(btrim(p.payment_terms),'') = '' THEN
    _errs := array_append(_errs, 'Payment terms must be reviewed: enter the terms agreed with this customer.'::text);
  END IF;
  IF _is_renewal AND p.product_family = 'Business' AND coalesce(btrim(p.license_model),'') = '' THEN
    _errs := array_append(_errs, 'The commercial variant (licence model) must be resolved.'::text);
  END IF;

  IF _is_renewal THEN
    SELECT * INTO r FROM public.renewals WHERE id = p.renewal_id;
    IF NOT FOUND THEN
      _errs := array_append(_errs, 'The proposal is not linked to a renewal.'::text);
    ELSIF r.closed_at IS NOT NULL THEN
      _errs := array_append(_errs, 'The renewal is already closed.'::text);
    ELSE
      _contract := public.proposal_contract_recurring(p.id);
      IF _contract IS NULL THEN
        _errs := array_append(_errs, 'No contract is linked, so the renewal baseline cannot be checked.'::text);
      ELSE
        _diff := round(coalesce(p.total_recurring,0) - _contract, 2);
        IF abs(_diff) > 0.01 THEN
          _difference_category := coalesce(_difference_category, p.difference_category);
          _difference_note := coalesce(nullif(btrim(_difference_note),''), p.difference_note);
          IF _difference_category IS NULL OR _difference_category NOT IN
             ('price_change','plan_change','discount','indexation','scope_change','year2_progression','promo_end','other') THEN
            _errs := array_append(_errs, format('Recurring value %s differs from the contract (%s) by %s: choose a difference category.',
                                     coalesce(p.total_recurring,0), _contract, _diff));
          ELSIF _difference_category = 'other' AND coalesce(btrim(_difference_note),'') = '' THEN
            _errs := array_append(_errs, 'A note is required when the difference category is "Other".'::text);
          END IF;
        END IF;
      END IF;
    END IF;
  ELSE
    IF p.deal_id IS NULL AND coalesce(p.source_type,'deal') = 'deal' THEN
      _errs := array_append(_errs, 'The proposal is not linked to an opportunity.'::text);
    END IF;
  END IF;

  IF coalesce(array_length(_errs,1),0) > 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: %', array_to_string(_errs, ' | ');
  END IF;

  PERFORM set_config('partneros.proposal_op', 'on', true);
  UPDATE public.proposals SET status = 'Ready', validated_at = now(), validated_by = auth.uid(),
    difference_category = CASE WHEN abs(coalesce(_diff,0)) > 0.01 THEN _difference_category ELSE NULL END,
    difference_note = CASE WHEN abs(coalesce(_diff,0)) > 0.01 THEN _difference_note ELSE NULL END,
    updated_at = now()
  WHERE id = p.id;
  PERFORM set_config('partneros.proposal_op', 'off', true);

  INSERT INTO public.proposal_status_events (proposal_id, action, from_status, to_status, actor_id, details)
  VALUES (p.id, 'validated', p.status, 'Ready', auth.uid(), jsonb_build_object(
    'contract_recurring', _contract, 'proposal_recurring', p.total_recurring, 'difference', _diff,
    'difference_category', _difference_category, 'difference_note', _difference_note,
    'total_year_1', p.total_year_1));
  RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Ready', 'already_validated', false, 'difference', _diff);
END $function$;
CREATE OR REPLACE FUNCTION public.mark_proposal_sent(_proposal_id uuid, _sent_date date DEFAULT NULL::date, _method text DEFAULT 'manual'::text, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.proposals%ROWTYPE; _at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF NOT public.can_manage_proposal_document(_proposal_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p.status = 'Sent' THEN RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Sent', 'already_sent', true); END IF;
  IF p.status <> 'Ready' THEN
    RAISE EXCEPTION 'NOT_READY: only a validated (Ready) proposal can be marked as sent (current: %)', p.status;
  END IF;
  IF coalesce(_method,'manual') NOT IN ('manual','partneros') THEN RAISE EXCEPTION 'INVALID_METHOD'; END IF;
  IF _sent_date IS NOT NULL AND _sent_date > current_date THEN RAISE EXCEPTION 'INVALID_DATE: sent date cannot be in the future'; END IF;
  _at := CASE WHEN _sent_date IS NULL OR _sent_date = current_date THEN now() ELSE _sent_date::timestamptz END;
  PERFORM set_config('partneros.proposal_op', 'on', true);
  UPDATE public.proposals SET status = 'Sent', sent_at = _at, sent_by = auth.uid(), sent_method = coalesce(_method,'manual'), updated_at = now()
   WHERE id = p.id;
  PERFORM set_config('partneros.proposal_op', 'off', true);
  INSERT INTO public.proposal_status_events (proposal_id, action, from_status, to_status, actor_id, details)
  VALUES (p.id, 'sent', p.status, 'Sent', auth.uid(), jsonb_build_object('method', coalesce(_method,'manual'), 'sent_at', _at, 'note', _note));
  RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Sent', 'already_sent', false);
END $function$;
CREATE OR REPLACE FUNCTION public.record_proposal_acceptance(_proposal_id uuid, _evidence_type text, _acceptance_date date, _reference text DEFAULT NULL::text, _file_path text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.proposals%ROWTYPE; r public.renewals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF p.renewal_id IS NULL THEN RAISE EXCEPTION 'NOT_RENEWAL: acceptance is recorded only for renewal proposals; use Award & Convert for opportunities'; END IF;
  IF NOT public.can_manage_proposal_document(_proposal_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO r FROM public.renewals WHERE id = p.renewal_id;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'RENEWAL_CLOSED'; END IF;
  IF p.status = 'Accepted' THEN RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Accepted', 'already_accepted', true); END IF;
  IF p.status NOT IN ('Ready','Sent') THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE: only a validated or sent proposal can be accepted (current: %)', p.status;
  END IF;
  IF _evidence_type IS NULL OR _evidence_type NOT IN ('signed_proposal','purchase_order','acceptance_email','internal_note') THEN
    RAISE EXCEPTION 'EVIDENCE_REQUIRED: choose the acceptance evidence type';
  END IF;
  IF _acceptance_date IS NULL THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED: acceptance date is required'; END IF;
  IF _acceptance_date > current_date THEN RAISE EXCEPTION 'INVALID_DATE: acceptance date cannot be in the future'; END IF;
  IF _evidence_type = 'internal_note' THEN
    IF NOT public.is_hq_user(auth.uid()) THEN
      RAISE EXCEPTION 'HQ_EXCEPTION_ONLY: an internal note is accepted only as an audited HQ exception';
    END IF;
    IF coalesce(btrim(_notes),'') = '' THEN RAISE EXCEPTION 'EVIDENCE_REQUIRED: explain the HQ exception in the notes'; END IF;
  ELSIF coalesce(btrim(_reference),'') = '' AND coalesce(btrim(_file_path),'') = '' THEN
    RAISE EXCEPTION 'EVIDENCE_REQUIRED: add a reference (PO number, email subject...) or a file';
  END IF;
  PERFORM set_config('partneros.proposal_op', 'on', true);
  UPDATE public.proposals SET status = 'Accepted', accepted_at = now(), accepted_by = auth.uid(),
    acceptance_date = _acceptance_date, acceptance_evidence_type = _evidence_type,
    acceptance_reference = nullif(btrim(_reference),''), acceptance_file_path = nullif(btrim(_file_path),''),
    acceptance_notes = nullif(btrim(_notes),''), updated_at = now()
   WHERE id = p.id;
  PERFORM set_config('partneros.proposal_op', 'off', true);
  INSERT INTO public.proposal_status_events (proposal_id, action, from_status, to_status, actor_id, details)
  VALUES (p.id, CASE WHEN _evidence_type='internal_note' THEN 'accepted_hq_exception' ELSE 'accepted' END, p.status, 'Accepted', auth.uid(),
    jsonb_build_object('evidence_type', _evidence_type, 'acceptance_date', _acceptance_date, 'reference', _reference, 'file_path', _file_path, 'notes', _notes));
  RETURN jsonb_build_object('proposal_id', p.id, 'status', 'Accepted', 'already_accepted', false);
END $function$;
CREATE OR REPLACE FUNCTION public.contract_lines_refresh_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_contract_total(OLD.contract_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_contract_total(NEW.contract_id);
    IF TG_OP = 'UPDATE' AND OLD.contract_id <> NEW.contract_id THEN
      PERFORM public.recalculate_contract_total(OLD.contract_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.recalculate_contract_total(_contract_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sum numeric(12,2);
  _adj numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO _sum
    FROM public.contract_lines WHERE contract_id = _contract_id;

  SELECT COALESCE(manual_adjustment_amount, 0) INTO _adj
    FROM public.contracts WHERE id = _contract_id;

  UPDATE public.contracts
     SET calculated_total = _sum + _adj
   WHERE id = _contract_id;

  RETURN _sum + _adj;
END;
$function$;
CREATE OR REPLACE FUNCTION private.proposal_terms_check(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = _id;
  IF NOT FOUND OR p.commercial_fingerprint IS NULL OR p.status NOT IN ('Ready','Sent','Accepted','Won') THEN RETURN; END IF;
  IF private.proposal_commercial_fingerprint(p.id, to_jsonb(p)) = p.commercial_fingerprint THEN RETURN; END IF;
  IF p.status IN ('Accepted','Won') THEN
    RAISE EXCEPTION 'TERMS_LOCKED: this proposal is %; its commercial terms can no longer be changed. Create a new version instead.', p.status
      USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.workflow_violation('proposal_terms', 'proposal', p.id,
    format('REVALIDATION_REQUIRED: the commercial terms of a %s proposal changed; return it to Draft and validate again', p.status),
    jsonb_build_object('status', p.status));
END $function$;
CREATE OR REPLACE FUNCTION private.proposal_commercial_fingerprint(_id uuid, _p jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT md5(
    jsonb_build_object(
      'plan', _p->'plan', 'hosting', _p->'hosting', 'product_family', _p->'product_family',
      'license_model', _p->'license_model', 'proposal_mode', _p->'proposal_mode', 'deployment', _p->'deployment',
      'business_config', coalesce(_p->'business_config','null'::jsonb),
      'include_requests_module', _p->'include_requests_module', 'web_users', _p->'web_users',
      'service_days', round(coalesce((_p->>'service_days')::numeric,0),2),
      'service_hours', round(coalesce((_p->>'service_hours')::numeric,0),2),
      'implementation_type', _p->'implementation_type',
      'discount_pct', round(coalesce((_p->>'discount_pct')::numeric,0),2), 'discount_scope', _p->'discount_scope',
      'software_discount_pct', round(coalesce((_p->>'software_discount_pct')::numeric,0),2),
      'services_discount_pct', round(coalesce((_p->>'services_discount_pct')::numeric,0),2),
      'software_subtotal', round(coalesce((_p->>'software_subtotal')::numeric,0),2),
      'services_subtotal', round(coalesce((_p->>'services_subtotal')::numeric,0),2),
      'discount_amount', round(coalesce((_p->>'discount_amount')::numeric,0),2),
      'total_year_1', round(coalesce((_p->>'total_year_1')::numeric,0),2),
      'total_recurring', round(coalesce((_p->>'total_recurring')::numeric,0),2),
      'payment_terms', _p->'payment_terms',
      'renewal_change_mode', _p->'renewal_change_mode', 'source_plan', _p->'source_plan', 'target_plan', _p->'target_plan',
      'target_product_family', _p->'target_product_family', 'entitlements', coalesce(_p->'entitlements','null'::jsonb),
      'implementation_source', _p->'implementation_source',
      'implementation_transition_rule_code', _p->'implementation_transition_rule_code',
      'implementation_hours', round(coalesce((_p->>'implementation_hours')::numeric,0),2),
      'implementation_hourly_rate', round(coalesce((_p->>'implementation_hourly_rate')::numeric,0),2),
      'implementation_gross', round(coalesce((_p->>'implementation_gross')::numeric,0),2),
      'implementation_discount_amount', round(coalesce((_p->>'implementation_discount_amount')::numeric,0),2),
      'implementation_net', round(coalesce((_p->>'implementation_net')::numeric,0),2),
      'items', coalesce((
        SELECT jsonb_agg(x ORDER BY x::text) FROM (
          SELECT jsonb_build_object(
            'category', i.category, 'item_code', i.item_code, 'item_name', i.item_name,
            'qty', round(coalesce(i.qty,0)::numeric,4), 'unit_price', round(coalesce(i.unit_price,0)::numeric,2),
            'frequency', i.frequency, 'total', round(coalesce(i.total,0)::numeric,2),
            'is_override', i.is_override, 'is_recurring', i.is_recurring,
            'discount_type', i.discount_type, 'discount_value', round(coalesce(i.discount_value,0)::numeric,2),
            'gross_total', round(coalesce(i.gross_total,0)::numeric,2),
            'discount_amount', round(coalesce(i.discount_amount,0)::numeric,2),
            'net_total', round(coalesce(i.net_total,0)::numeric,2),
            'apply_discount_to_renewal', i.apply_discount_to_renewal,
            'source_plan', i.source_plan, 'target_plan', i.target_plan, 'line_type', i.line_type,
            'change_kind', i.change_kind, 'gross_delta', round(coalesce(i.gross_delta,0)::numeric,2),
            'access_type', i.access_type, 'total_licensed_qty', i.total_licensed_qty,
            'included_qty', i.included_qty, 'billable_qty', i.billable_qty,
            'implementation_source', i.implementation_source,
            'implementation_hours', round(coalesce(i.implementation_hours,0)::numeric,2),
            'implementation_hourly_rate', round(coalesce(i.implementation_hourly_rate,0)::numeric,2)) AS x
          FROM public.proposal_items i WHERE i.proposal_id = _id) s), '[]'::jsonb)
    )::text);
$function$;
CREATE OR REPLACE FUNCTION public.proposal_terms_check_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'proposals' THEN
    PERFORM private.proposal_terms_check(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.proposal_terms_check(OLD.proposal_id);
  ELSE
    PERFORM private.proposal_terms_check(NEW.proposal_id);
    IF TG_OP = 'UPDATE' AND OLD.proposal_id IS DISTINCT FROM NEW.proposal_id THEN
      PERFORM private.proposal_terms_check(OLD.proposal_id);
    END IF;
  END IF;
  RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.proposals_capture_fingerprint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _op boolean := coalesce(current_setting('partneros.proposal_op', true),'off') = 'on';
  _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('Accepted','Won')
     AND NEW.status IS DISTINCT FROM OLD.status AND NOT _op AND NOT _close THEN
    RAISE EXCEPTION 'TERMS_LOCKED: this proposal is %; use the official operation or create a new version.', OLD.status USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IN ('Ready','Sent','Accepted','Won') THEN
    IF TG_OP = 'UPDATE' AND OLD.status IN ('Ready','Sent','Accepted','Won')
       AND OLD.commercial_fingerprint IS NOT NULL THEN
      -- The browser/API must never clear or replace the accepted baseline.
      NEW.commercial_fingerprint := OLD.commercial_fingerprint;
    ELSE
      NEW.commercial_fingerprint := private.proposal_commercial_fingerprint(NEW.id, to_jsonb(NEW));
    END IF;
  ELSE
    NEW.commercial_fingerprint := NULL;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.proposals_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _op boolean := coalesce(current_setting('partneros.proposal_op', true),'off') = 'on';
        _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
        _old text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
        _renewal boolean := NEW.renewal_id IS NOT NULL OR NEW.source_type = 'renewal';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM _old THEN
    IF TG_OP = 'UPDATE' AND _old IN ('Ready','Sent','Accepted','Won') AND NOT _op AND NOT _close
       AND (round(coalesce(NEW.total_year_1,0),2) IS DISTINCT FROM round(coalesce(OLD.total_year_1,0),2)
         OR round(coalesce(NEW.total_recurring,0),2) IS DISTINCT FROM round(coalesce(OLD.total_recurring,0),2)) THEN
      IF _old IN ('Accepted','Won') THEN
        RAISE EXCEPTION 'TERMS_LOCKED: this proposal is %; its commercial terms can no longer be changed. Create a new version instead.', _old
          USING ERRCODE = 'P0001';
      END IF;
      PERFORM private.workflow_violation('proposal_terms', 'proposal', NEW.id,
        format('REVALIDATION_REQUIRED: the commercial terms of a %s proposal changed; return it to Draft and validate again', _old),
        jsonb_build_object('status', _old,
          'old', jsonb_build_object('y1', OLD.total_year_1, 'rec', OLD.total_recurring),
          'new', jsonb_build_object('y1', NEW.total_year_1, 'rec', NEW.total_recurring)));
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IN ('Ready','Sent','Accepted') AND NOT _op THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      format('STATUS_GUARD: "%s" can only be set through Validate / Mark Sent / Record acceptance', NEW.status),
      jsonb_build_object('from', _old, 'to', NEW.status));
  ELSIF _renewal AND NEW.status IN ('Won','Lost') AND NOT _close THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      'STATUS_GUARD: renewal proposals become Won/Lost only through the official renewal close',
      jsonb_build_object('from', _old, 'to', NEW.status));
  ELSIF _old IN ('Accepted','Won') AND NOT _op AND NOT _close THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      format('STATUS_GUARD: an %s proposal cannot be changed back to %s', _old, NEW.status),
      jsonb_build_object('from', _old, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_a_proposals_status_guard BEFORE INSERT OR UPDATE OF status, total_year_1, total_recurring ON public.proposals FOR EACH ROW EXECUTE FUNCTION proposals_status_guard();
CREATE TRIGGER trg_b_proposals_capture_fingerprint BEFORE INSERT OR UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION proposals_capture_fingerprint();
CREATE CONSTRAINT TRIGGER trg_z_proposals_terms_check AFTER INSERT OR UPDATE ON public.proposals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION proposal_terms_check_trg();
CREATE CONSTRAINT TRIGGER trg_z_proposal_items_terms_check AFTER INSERT OR DELETE OR UPDATE ON public.proposal_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION proposal_terms_check_trg();
create trigger totals after insert or update or delete on contract_lines for each row execute function contract_lines_refresh_total();
alter table proposals enable row level security; alter table proposal_items enable row level security;
create policy proposal_access on proposals to authenticated using(can_manage_client(client_id)) with check(can_manage_client(client_id));
create policy item_access on proposal_items to authenticated using(exists(select 1 from proposals where id=proposal_id)) with check(exists(select 1 from proposals where id=proposal_id));
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into profiles(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into clients(id) values('11111111-1111-4111-8111-111111111111');
insert into licenses(id,client_id,backoffice_users,web_accesses,license_status,is_draft,updated_at)
values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',10,11,'active',false,'2026-10-29T00:00:00Z');
insert into contracts(id,client_id,contract_start_date,contract_end_date,total_value,updated_at)
values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','2026-01-01','2028-04-14',1000,'2026-10-29T00:00:00Z');
insert into contract_lines(contract_id,client_id,line_type,amount,currency,billing_frequency) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','S&AT',1000,'EUR','Annual');
insert into renewals(id,client_id,contract_id,target_type,renewal_type,estimated_value,renewal_date,closed_at)
values('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','contract','Contract',1000,'2028-04-14',null);
insert into modules_catalog(name) values('Maintenance Requests'),('Stock Management'),('Purchase Orders');
insert into plugins_catalog(name) values('Import Tool'),('Workflow'),('Advanced Reports'),('SLA');
\ir ../../supabase/migrations/20261029191940_commercial_addition_atomic_drafts.sql
\ir ../../supabase/migrations/20261030000156_commercial_addition_adjudication_activation.sql
\ir commercial_addition_lifecycle_cases.sql
