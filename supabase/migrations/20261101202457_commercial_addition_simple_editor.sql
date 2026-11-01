-- Versioned combined customer proposals. Legacy issued snapshots keep their existing arithmetic.
-- Existing authorization, source locks, fingerprint, acceptance and idempotency guards remain in place.
CREATE OR REPLACE FUNCTION private.addition_raw_lines_legacy(d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare s jsonb:=d->'selection'; b jsonb:=d->'baseline'; r jsonb:=d->'rules'; result jsonb:='[]'; code text; suffix text; product text; share numeric; qty numeric;
begin
 share:=case when s->>'offerBasis'='partner' then (s->>'licenseShare')::numeric/100 else 1 end;
 if b->>'family' not in ('Business','Professional') or (b->>'family'='Business' and coalesce(b->>'model','') not in ('keepit','useit')) then raise exception 'VALIDATION_FAILED: Invalid source product'; end if;
 qty:=(s->>'backoffice')::numeric;
 if qty>0 then
  if b->>'family'<>'Business' then raise exception 'VALIDATION_FAILED: Professional requires an upgrade'; end if;
  result:=result||private.addition_license_parts(d,'ADDITIONAL_BACKOFFICE',qty);
  if b->>'deployment'='saas' then result:=result||jsonb_build_array(jsonb_build_object('code','BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE','quantity',qty,'kind','hosting','annual',round(private.addition_rule(r,'BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE','per-user-month')*12*qty*case when s->>'offerBasis'='partner' then (s->>'hostingShare')::numeric/100 else 1 end,2),'oneTime',0)); end if;
 end if;
 qty:=(s->>'web')::numeric;
 if qty>0 then
  code:=case when b->>'family'='Business' then 'BUS_WEB_MOBILE_USER' else 'web_user' end;
  result:=result||jsonb_build_array(jsonb_build_object('code',code,'quantity',qty,'kind','web','annual',round(private.addition_rule(r,code,'per-user-month')*12*qty*share,2),'oneTime',0));
 end if;
 for product in select jsonb_array_elements_text(s->'products') loop
  if b->>'family'='Professional' then
   if product<>'requests' then raise exception 'VALIDATION_FAILED: Professional requires an upgrade'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('code','requests_module','quantity',1,'kind','license','annual',round(private.addition_rule(r,'requests_module','yearly')*share,2),'oneTime',0));
  elsif product='api' then result:=result||jsonb_build_array(jsonb_build_object('code','BUS_API','quantity',1,'kind','api','annual',round(private.addition_rule(r,'BUS_API','yearly')*share,2),'oneTime',0));
  else
   suffix:=case product when 'requests' then 'REQUESTS_MODULE' when 'stock' then 'STOCK_MODULE' when 'purchase' then 'PURCHASE_MODULE' when 'import' then 'PLUGIN_IMPORT' when 'workflow' then 'PLUGIN_WORKFLOW' when 'reports' then 'PLUGIN_ADVANCED_REPORTS' when 'sla' then 'PLUGIN_SLA' end;
   if suffix is null then raise exception 'VALIDATION_FAILED: Unknown product'; end if;
   result:=result||private.addition_license_parts(d,suffix,1);
  end if;
 end loop;
 return result;
end $function$
;
revoke all on function private.addition_raw_lines_legacy(jsonb) from public,anon,authenticated;
create or replace function private.addition_raw_lines(d jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,private as $simple$
declare s jsonb:=d->'selection'; b jsonb:=d->'baseline'; v jsonb; row jsonb; result jsonb; product text; agreed jsonb; tariff numeric; qty numeric; share numeric; code text; filtered jsonb;
begin
 if s->>'editorVersion' is distinct from '3' then return private.addition_raw_lines_legacy(d);end if;
 if s->'commercial' is null or s->>'implementationReview' is distinct from 'not_needed' then raise exception 'VALIDATION_FAILED: Combined proposals require structured terms and integrated services';end if;
 if b->>'family'='Professional' then
  select coalesce(jsonb_agg(x),'[]') into filtered from jsonb_array_elements(s->'products') x where x='"requests"'::jsonb;
  result:=private.addition_raw_lines_legacy(jsonb_set(d,'{selection,products}',filtered));
  share:=case when s->>'offerBasis'='partner' then (s->>'licenseShare')::numeric/100 else 1 end;
  for product in select jsonb_array_elements_text(s->'products') loop
   if product='requests' then continue;end if;
   if private.addition_product_label(product) is null then raise exception 'VALIDATION_FAILED: Unknown Professional component';end if;
   agreed:=s->'professionalPrices'->product;tariff:=(agreed->>'annual')::numeric;
   if tariff is null or tariff::text in ('NaN','Infinity','-Infinity') or tariff not between 0.01 and 100000000 or coalesce(btrim(agreed->>'reference'),'')='' then raise exception 'VALIDATION_FAILED: Enter an approved Professional annual price and its reference';end if;
   result:=result||jsonb_build_array(jsonb_build_object('code','PRO_ADDITION_'||upper(product),'quantity',1,'kind',case when product='api' then 'api' else 'license' end,'annual',round(tariff*share,2),'oneTime',0));
  end loop;
 else result:=private.addition_raw_lines_legacy(d);end if;
 if jsonb_typeof(s->'services') is distinct from 'array' or jsonb_array_length(s->'services')>30 then raise exception 'VALIDATION_FAILED: Invalid services list';end if;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(s->'services') x) then raise exception 'VALIDATION_FAILED: Duplicate services';end if;
 for row in select value from jsonb_array_elements(s->'services') loop
  qty:=(row->>'quantity')::numeric;tariff:=(row->>'unitPrice')::numeric;
  if coalesce(row->>'id','')!~'^[a-zA-Z0-9_-]{1,60}$' or coalesce(btrim(row->>'label'),'')='' or length(row->>'label')>500
   or coalesce(row->>'modality','') not in ('online','onsite','other') or coalesce(row->>'unit','') not in ('session','hour','day','fixed')
   or jsonb_typeof(row->'expense') is distinct from 'boolean' or qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty not between 0.0001 and 1000
   or tariff is null or tariff::text in ('NaN','Infinity','-Infinity') or tariff not between 0.01 and 100000000 or coalesce(btrim(row->>'reference'),'')='' then raise exception 'VALIDATION_FAILED: Service quantity, price and reference required';end if;
  code:=row->>'ruleCode';
  if code is not null then
   if code not in ('impl_session','BUS_RCI_LIVE_SESSION') then raise exception 'VALIDATION_FAILED: Not an approved training catalogue rule';end if;
   select x into v from jsonb_array_elements(d->'rules') x where x->>'code'=code and x->>'active'='true' and x->>'currency'='EUR' and x->>'unit_type'='one-time' and (x->>'unit_price')::numeric=tariff;
   if v is null then raise exception 'VALIDATION_FAILED: Service price differs from frozen catalogue';end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('code','SERVICE_'||(row->>'id'),'quantity',qty,'kind',case when (row->>'expense')::boolean then 'expense' else 'service' end,'annual',0,'oneTime',round(qty*tariff,2)));
 end loop;
 return result;
end $simple$;

CREATE OR REPLACE FUNCTION private.check_addition_detailed_terms(d jsonb, authorize boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare s jsonb:=d->'selection'; c jsonb:=s->'commercial'; p jsonb; a jsonb; x jsonb; l jsonb; raw jsonb; parent jsonb; pa jsonb;
 annual numeric; once numeric; unit numeric; original numeric; factor numeric; initial_pct numeric; renewal_pct numeric; max_pct numeric:=100;
 initial_annual numeric; expected_now numeric; months numeric:=(d#>>'{quote,months}')::numeric; start_date date; end_date date; n int; calc_months int;
begin
 if c is null then
  if exists(select 1 from jsonb_array_elements(d#>'{quote,lines}') legacy_line where legacy_line ? 'initialAnnual') then raise exception 'VALIDATION_FAILED: Detailed amounts require structured terms'; end if;
  return;
 end if;
 if c->>'version' is distinct from '2' or coalesce(c->>'language','') not in ('PT','EN') or coalesce(c->>'proposalDate','') !~ '^\d{4}-\d{2}-\d{2}$'
 or coalesce((c->>'validityDays')::numeric,0) not between 1 and 365 or (c->>'validityDays')::numeric<>trunc((c->>'validityDays')::numeric)
 or jsonb_typeof(c->'adjustments') is distinct from 'object' then raise exception 'VALIDATION_FAILED: Review document date/language/validity'; end if;
 start_date:=(s->>'effectiveDate')::date;end_date:=(s->>'renewalDate')::date;
 if (c->>'proposalDate')::date>start_date or start_date>=end_date then raise exception 'INVALID_DATE: Review proposal and effective dates'; end if;
 n:=(extract(year from end_date)::int-extract(year from start_date)::int)*12+extract(month from end_date)::int-extract(month from start_date)::int;
 if (start_date+make_interval(months=>n))::date>end_date then n:=n-1;end if;
 calc_months:=n+case when s->>'monthPolicy'='started' and (start_date+make_interval(months=>n))::date<end_date then 1 else 0 end;
 if s->>'monthPolicy'='agreed' then
  if months is distinct from (s->>'agreedMonths')::numeric or coalesce(btrim(s->>'monthReview'),'')='' then raise exception 'VALIDATION_FAILED: Explain agreed months'; end if;
 elsif months is distinct from calc_months::numeric then raise exception 'VALIDATION_FAILED: Months do not agree with the stated dates/policy'; end if;
 p:=c->'payment';
 if coalesce(p->>'invoice','') not in ('award','split') or coalesce(p->>'activation','') not in ('full_payment','award_payment','on_award') or coalesce(btrim(p->>'reference'),'')=''
 or coalesce((p->>'awardDueDays')::numeric,-1) not between 0 and 365 or (p->>'awardDueDays')::numeric<>trunc((p->>'awardDueDays')::numeric)
 or coalesce((p->>'installationDueDays')::numeric,-1) not between 0 and 365 or (p->>'installationDueDays')::numeric<>trunc((p->>'installationDueDays')::numeric)
 or (p->>'invoice'='award' and (p->>'awardPercent')::numeric is distinct from 100)
 or (p->>'invoice'='split' and (coalesce((p->>'awardPercent')::numeric,0)<=0 or (p->>'awardPercent')::numeric>=100)) then raise exception 'VALIDATION_FAILED: Incomplete payment and activation agreement'; end if;
 if authorize and not public.is_hq_user(auth.uid()) then
  select coalesce((select max_software_discount_pct from public.partner_discount_limits where partner_id=public.get_user_partner_id(auth.uid())),10) into max_pct;
  if p->>'activation'='on_award' then raise exception 'HQ_EXCEPTION_ONLY: HQ must authorize credit activation'; end if;
 end if;
 if s->>'editorVersion'='3' and authorize and not public.is_hq_user(auth.uid()) and
 ((d#>>'{baseline,family}'='Professional' and exists(select 1 from jsonb_array_elements_text(s->'products') z where z<>'requests'))
 or exists(select 1 from jsonb_array_elements(s->'services') z where z->>'ruleCode' is null)) then
 raise exception 'HQ_EXCEPTION_ONLY: HQ must approve Professional tariffs and custom services / expenses';end if;
 raw:=private.addition_raw_lines(d);
 if jsonb_array_length(raw)<>jsonb_array_length(d#>'{quote,lines}') then raise exception 'VALIDATION_FAILED: Selected components and quoted lines differ'; end if;
 if exists(select 1 from jsonb_object_keys(c->'adjustments') code where not exists(select 1 from jsonb_array_elements(raw) z where z->>'code'=code)) then raise exception 'VALIDATION_FAILED: Remove stale component adjustments'; end if;
 for l in select value from jsonb_array_elements(raw) loop
  select z into strict x from jsonb_array_elements(d#>'{quote,lines}') z where z->>'code'=l->>'code';
  a:=c->'adjustments'->(l->>'code');
  if authorize and not public.is_hq_user(auth.uid()) then
   if l->>'kind'='service' then select coalesce((select max_services_discount_pct from public.partner_discount_limits where partner_id=public.get_user_partner_id(auth.uid())),(select case when lower(coalesce(partnership_level,''))='implementer' then 100 else 10 end from public.partners where id=public.get_user_partner_id(auth.uid())),10) into max_pct;
   else select coalesce((select max_software_discount_pct from public.partner_discount_limits where partner_id=public.get_user_partner_id(auth.uid())),10) into max_pct;end if;
  end if;
  initial_pct:=coalesce((a->>'initialDiscountPct')::numeric,0);renewal_pct:=coalesce((a->>'renewalDiscountPct')::numeric,0);
  if s->>'editorVersion'='3' and l->>'kind' in ('sat','hosting','expense') and (initial_pct<>0 or renewal_pct<>0) then raise exception 'VALIDATION_FAILED: S&AT, hosting and expenses cannot be discounted';end if;
  factor:=case when l->>'kind' in ('web','hosting') then 12 else 1 end;
  original:=coalesce(nullif((l->>'oneTime')::numeric,0),(l->>'annual')::numeric)/(l->>'quantity')::numeric/factor;
  unit:=coalesce((a->>'unitPrice')::numeric,original);
  if unit::text in ('NaN','Infinity','-Infinity') or unit not between 0 and 100000000
   or initial_pct::text in ('NaN','Infinity','-Infinity') or initial_pct not between 0 and 100
   or renewal_pct::text in ('NaN','Infinity','-Infinity') or renewal_pct not between 0 and 100
   or (a is not null and (coalesce(btrim(a->>'reason'),'')='' or a->>'initialDiscountPct' is null or a->>'renewalDiscountPct' is null))
   or ((l->>'oneTime')::numeric>0 and renewal_pct<>0) or (l->>'kind'='sat' and a->>'unitPrice' is not null)
   then raise exception 'VALIDATION_FAILED: Invalid negotiated price/discount/justification'; end if;
  if authorize and not public.is_hq_user(auth.uid()) and (a->>'unitPrice' is not null or initial_pct>max_pct or renewal_pct>max_pct) then raise exception 'DISCOUNT_LIMIT: HQ authorization required'; end if;
  annual:=case when (l->>'annual')::numeric>0 then round(unit*(l->>'quantity')::numeric*factor,2) else 0 end;
  once:=case when (l->>'oneTime')::numeric>0 then round(unit*(l->>'quantity')::numeric,2) else 0 end;
  if l->>'kind'='sat' then
   select z into strict parent from jsonb_array_elements(raw) z where z->>'code'=regexp_replace(l->>'code','_SAT$','');
   pa:=c->'adjustments'->(parent->>'code');
   annual:=round((l->>'annual')::numeric*round(coalesce((pa->>'unitPrice')::numeric,(parent->>'oneTime')::numeric/(parent->>'quantity')::numeric)*(parent->>'quantity')::numeric,2)/(parent->>'oneTime')::numeric,2);
   unit:=annual/(l->>'quantity')::numeric;
  end if;
  initial_annual:=round(annual*(1-initial_pct/100),2);expected_now:=round(round(once*(1-initial_pct/100),2)+initial_annual*months/12,2);
  if (x->>'quantity')::numeric is distinct from (l->>'quantity')::numeric or x->>'kind' is distinct from l->>'kind'
   or (x->>'referenceAnnual')::numeric is distinct from annual or (x->>'referenceOneTime')::numeric is distinct from once
   or abs((x->>'referenceUnitPrice')::numeric-original)>0.00000001 or abs((x->>'unitPrice')::numeric-unit)>0.00000001
   or x->>'referenceUnitPrice' is null or x->>'unitPrice' is null
   or (x->>'initialAnnual')::numeric is distinct from initial_annual
   or (x->>'initialDiscountPct')::numeric is distinct from initial_pct or (x->>'renewalDiscountPct')::numeric is distinct from renewal_pct
   or (x->>'annual')::numeric is distinct from round(annual*(1-renewal_pct/100),2)
   or (x->>'oneTime')::numeric is distinct from round(once*(1-initial_pct/100),2)
   or (x->>'dueNow')::numeric is distinct from expected_now then raise exception 'VALIDATION_FAILED: Detailed line amounts do not agree with the frozen catalogue and commercial adjustments'; end if;
 end loop;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_commercial_addition_draft(_proposal_id uuid, _expected_updated_at timestamp with time zone, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  draft jsonb := _payload #> '{business_config,commercial_addition}';
  b jsonb; q jsonb; s jsonb; l jsonb;
  cid uuid; lid uuid; source_contract_id uuid; pid uuid; result_id uuid; version_number integer;
  existing public.proposals%rowtype;
  current_license public.licenses%rowtype;
  current_contract public.contracts%rowtype;
  sum_now numeric; sum_annual numeric; line_no integer := 0;
begin
  if auth.uid() is null or not public.can_manage_client_additions((_payload->>'client_id')::uuid) then raise exception 'NOT_AUTHORIZED: Client commercial edit permission is required.'; end if;
  if jsonb_typeof(draft) is distinct from 'object' or coalesce(draft->>'schema','') <> 'commercial_addition_v1' or
    coalesce(draft->>'action','') not in ('add_users','add_modules','add_plugins') then
    raise exception 'VALIDATION_FAILED: Unsupported addition snapshot.';
  end if;
  b := draft->'baseline'; q := draft->'quote'; s := draft->'selection';
  perform private.check_addition_detailed_terms(draft,true);
  if s->'commercial' is not null and _payload->>'payment_terms' is distinct from private.addition_payment_text(s->'commercial') then raise exception 'VALIDATION_FAILED: Payment text differs from the structured agreement';end if;
  cid := (_payload->>'client_id')::uuid; lid := (_payload->>'license_id')::uuid;
  source_contract_id := (_payload->>'contract_id')::uuid; pid := (_payload->>'partner_uuid')::uuid;
  if cid is null or lid is null or source_contract_id is null or cid is distinct from (b->>'clientId')::uuid
    or lid is distinct from (b->>'licenseId')::uuid or source_contract_id is distinct from (b->>'contractId')::uuid
    or not public.can_manage_proposal_source('client',null,null,cid,pid) then
    raise exception 'NOT_AUTHORIZED: Invalid or inaccessible source client.';
  end if;
  if not exists(select 1 from public.clients where id=cid and partner_uuid is not distinct from pid) then
    raise exception 'NOT_AUTHORIZED: Partner does not match the source client.';
  end if;
  select * into current_license from public.licenses where id=lid and client_id=cid for share;
  if not found then raise exception 'VALIDATION_FAILED: Source license is unavailable.'; end if;
  select * into current_contract from public.contracts where id=source_contract_id and client_id=cid for share;
  if not found then raise exception 'VALIDATION_FAILED: Source contract is unavailable.'; end if;
  if s->'commercial' is not null then
    if coalesce(current_license.currency,'EUR')<>'EUR' or coalesce(current_contract.currency,'EUR')<>'EUR' then raise exception 'VALIDATION_FAILED: Addition catalogue requires EUR';end if;
    if regexp_replace(lower(current_license.license_model),'[^a-z0-9]','','g') in ('keepit','useit') and (b->>'family' is distinct from 'Business' or b->>'model' is distinct from regexp_replace(lower(current_license.license_model),'[^a-z0-9]','','g')) then raise exception 'CONFLICT: Commercial model differs from the source license';end if;
    if coalesce(current_license.api_access,false) and s->'products' ? 'api' then raise exception 'VALIDATION_FAILED: API is already licensed';end if;
  end if;
  if current_contract.contract_end_date is distinct from (b->>'renewalDate')::date
    or current_contract.contract_end_date is distinct from (s->>'renewalDate')::date
    or coalesce(current_license.backoffice_users,0) <> (b->>'backoffice')::numeric
    or coalesce(current_license.web_accesses,0) <> (b->>'web')::numeric then
    raise exception 'CONFLICT: Source contract or licensed accesses changed. Reopen from the current client.';
  end if;
  if current_license.updated_at is distinct from (b->>'licenseUpdatedAt')::timestamptz
    or current_contract.updated_at is distinct from (b->>'contractUpdatedAt')::timestamptz
    or coalesce((select jsonb_agg(id::text order by id::text) from public.licensed_modules where license_id=lid and enabled),'[]'::jsonb)
       is distinct from b->'componentIds' then
    raise exception 'CONFLICT: Source license, components or contract changed. Reopen from the current client.';
  end if;
  if s->>'offerBasis' = 'partner' and not public.is_hq_user(auth.uid()) then
    raise exception 'NOT_AUTHORIZED: Partner revenue shares require HQ review.';
  end if;
  if jsonb_typeof(q->'blockers') is distinct from 'array' or jsonb_array_length(q->'blockers') <> 0
    or jsonb_typeof(q->'lines') is distinct from 'array' or jsonb_array_length(q->'lines') not between 1 and 100
    or coalesce(s->>'priceReview','') = '' or coalesce(_payload->>'payment_terms','') = ''
    or coalesce(s->>'pricingBasis','') not in ('direct','derived') or coalesce(s->>'monthPolicy','') not in ('complete','started','agreed')
    or coalesce(s->>'offerBasis','') not in ('customer','partner')
    or coalesce(s->>'implementationReview','') not in ('not_needed','separate')
    or coalesce((q->>'months')::numeric,0) not between 0.0001 and 1200
    or (s->>'effectiveDate')::date >= current_contract.contract_end_date then
    raise exception 'VALIDATION_FAILED: Resolve the addition pricing and period review before saving.';
  end if;
  if exists(select 1 from jsonb_array_elements(q->'lines') x where
    coalesce(x->>'code','') = '' or coalesce(x->>'label','') = ''
    or (x->>'dueNow') is null or (x->>'annual') is null or (x->>'oneTime') is null
    or coalesce((x->>'quantity')::numeric,0) <= 0
    or (x->>'dueNow')::numeric < 0 or (x->>'annual')::numeric < 0 or (x->>'oneTime')::numeric < 0
    or (x->>'dueNow')::numeric is distinct from round((x->>'oneTime')::numeric + coalesce((x->>'initialAnnual')::numeric,(x->>'annual')::numeric) * (q->>'months')::numeric / 12,2)
    or (x->>'dueNow')::numeric > 100000000 or (x->>'annual')::numeric > 100000000) then
    raise exception 'VALIDATION_FAILED: Invalid addition amounts.';
  end if;
  if (select count(*) <> count(distinct x->>'code') from jsonb_array_elements(q->'lines') x) then
    raise exception 'VALIDATION_FAILED: Duplicate addition line codes.';
  end if;
  select round(sum((x->>'dueNow')::numeric),2),round(sum((x->>'annual')::numeric),2)
    into sum_now,sum_annual from jsonb_array_elements(q->'lines') x;
  if (coalesce(sum_now,0) < 0 or (sum_now=0 and s->'commercial' is null)) or sum_now is distinct from (_payload->>'total_year_1')::numeric
    or sum_annual is distinct from (_payload->>'total_recurring')::numeric
    or sum_now is distinct from (q->>'dueNow')::numeric or sum_annual is distinct from (q->>'annualIncrease')::numeric then
    raise exception 'VALIDATION_FAILED: Header, snapshot and incremental line totals do not agree.';
  end if;
  if s->'commercial' is not null then
    if _payload->>'language' is distinct from s#>>'{commercial,language}' or (_payload->>'proposal_date')::date is distinct from (s#>>'{commercial,proposalDate}')::date then raise exception 'VALIDATION_FAILED: Document metadata differs from approved terms'; end if;
    if _proposal_id is null or draft->'rules' is distinct from (select business_config#>'{commercial_addition,rules}' from public.proposals where id=_proposal_id) then
      if exists(select 1 from jsonb_array_elements(draft->'rules') r where r->>'active'='true' and not exists(select 1 from public.pricing_rules pr where pr.code=r->>'code' and pr.active and pr.currency=r->>'currency' and pr.unit_type=r->>'unit_type' and pr.unit_price=(r->>'unit_price')::numeric and pr.support_percentage is not distinct from (r->>'support_percentage')::numeric)) then raise exception 'CONFLICT: Catalogue changed; reopen before saving'; end if;
    end if;
  elsif exists(select 1 from public.commercial_addition_terms_approvals where proposal_id=_proposal_id) then raise exception 'VALIDATION_FAILED: Detailed terms cannot be removed';
  end if;
  if _proposal_id is null then
    perform pg_advisory_xact_lock(hashtextextended('commercial-addition:' || cid::text,0));
    select coalesce(max(version),0)+1 into version_number from public.proposals where client_id=cid and source_type='client';
    insert into public.proposals(source_type,client_id,contract_id,license_id,partner_uuid,client_name,
      product_family,license_model,proposal_mode,plan,hosting,deployment,project_name,proposal_date,language,
      payment_terms,notes,total_year_1,total_recurring,business_config,version,status,created_by)
    values ('client',cid,source_contract_id,lid,pid,_payload->>'client_name',_payload->>'product_family',_payload->>'license_model',
      _payload->>'proposal_mode',(_payload->>'plan')::integer,_payload->>'hosting',_payload->>'deployment',
      _payload->>'project_name',(_payload->>'proposal_date')::date,_payload->>'language',_payload->>'payment_terms',
      _payload->>'notes',sum_now,sum_annual,_payload->'business_config',version_number,'Draft',auth.uid()) returning id into result_id;
  else
    select * into existing from public.proposals where id=_proposal_id for update;
    if not found or existing.source_type <> 'client' or existing.client_id <> cid
      or existing.contract_id is distinct from source_contract_id or existing.license_id is distinct from lid
      or existing.business_config #>> '{commercial_addition,schema}' is distinct from 'commercial_addition_v1' then
      raise exception 'NOT_AUTHORIZED: The saved proposal is not this client addition.';
    end if;
    if existing.status <> 'Draft' then raise exception 'VALIDATION_FAILED: Only Draft additions can be edited. Use the official validation workflow for other states.'; end if;
    if _expected_updated_at is null or existing.updated_at is distinct from _expected_updated_at then
      raise exception 'CONFLICT: This draft was changed by another user. Reopen it before saving.';
    end if;
    update public.proposals set business_config=_payload->'business_config',payment_terms=_payload->>'payment_terms',
      notes=_payload->>'notes',total_year_1=sum_now,total_recurring=sum_annual,updated_at=now()
      where id=_proposal_id returning id into result_id;
  end if;
  delete from public.proposal_items where proposal_id=result_id;
  for l in select value from jsonb_array_elements(q->'lines') loop
    insert into public.proposal_items(proposal_id,category,item_code,item_name,description,qty,unit_price,
      frequency,total,gross_total,net_total,discount_type,discount_value,discount_amount,is_override,is_recurring,sort_order)
    values(result_id,case when l->>'kind' in ('service','expense') then 'service' else 'addon' end,l->>'code',l->>'label',
      'Incremental amount to existing renewal; annual increase ' || (l->>'annual') || '. See commercial_addition snapshot for period and rule provenance.',
      1,(l->>'dueNow')::numeric,'one-time',(l->>'dueNow')::numeric,(l->>'dueNow')::numeric,(l->>'dueNow')::numeric,
      'none',0,0,false,false,line_no);
    line_no := line_no+1;
  end loop;
  if s->'commercial' is not null then
    update public.proposals set validity_days=(s#>>'{commercial,validityDays}')::int,language=s#>>'{commercial,language}',proposal_date=(s#>>'{commercial,proposalDate}')::date where id=result_id;
    insert into public.commercial_addition_terms_approvals(proposal_id,fingerprint,authorized_by) select id,private.addition_terms_fingerprint(p),auth.uid() from public.proposals p where id=result_id
    on conflict(proposal_id) do update set fingerprint=excluded.fingerprint,authorized_by=excluded.authorized_by,authorized_at=now();
  end if;
  return result_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.check_commercial_addition(proposal_uuid uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare p public.proposals%rowtype; lic public.licenses%rowtype; con public.contracts%rowtype;
 d jsonb; b jsonb; s jsonb; q jsonb; annual_base numeric; unknown_count int;
begin
 select * into strict p from public.proposals where id=proposal_uuid;
 d:=p.business_config->'commercial_addition'; b:=d->'baseline'; s:=d->'selection'; q:=d->'quote';
 perform private.check_addition_detailed_terms(d,false);
 if s->'commercial' is not null or exists(select 1 from public.commercial_addition_terms_approvals where proposal_id=p.id) then
  if not exists(select 1 from public.commercial_addition_terms_approvals where proposal_id=p.id and fingerprint=private.addition_terms_fingerprint(p)) then raise exception 'CONFLICT: Save and authorize the detailed commercial terms again';end if;
 end if;
 if p.source_type <> 'client' or d->>'schema' is distinct from 'commercial_addition_v1'
 or d->>'action' not in ('add_users','add_modules','add_plugins') then raise exception 'VALIDATION_FAILED: Not a supported client addition.'; end if;
 if not public.can_manage_client_additions(p.client_id) then raise exception 'NOT_AUTHORIZED: Client edit permission is required.'; end if;
 select * into strict lic from public.licenses where id=p.license_id and client_id=p.client_id for update;
 select * into strict con from public.contracts where id=p.contract_id and client_id=p.client_id for update;
 if coalesce(con.manual_adjustment_amount,0) <> 0 then raise exception 'CONFLICT: Reconcile the manual contract adjustment before adjudicating additions.'; end if;
 if exists(select 1 from public.commercial_addition_fulfillments where license_id=lic.id and proposal_id<>p.id and activated_at is null) then raise exception 'CONFLICT: Activate the previously adjudicated additions before preparing another award for this license.'; end if;
 if exists(select 1 from public.renewals where contract_id=con.id and closed_at is null and outcome is null and not coalesce(is_covered_by_contract,false) and lower(coalesce(target_type,renewal_type,''))<>'contract') then raise exception 'CONFLICT: Reconcile separate component renewals with HQ before adjudicating this contract addition.'; end if;
 if p.client_id is distinct from (b->>'clientId')::uuid or p.license_id is distinct from (b->>'licenseId')::uuid
 or p.contract_id is distinct from (b->>'contractId')::uuid or con.contract_end_date is distinct from (b->>'renewalDate')::date
 or lic.updated_at is distinct from (b->>'licenseUpdatedAt')::timestamptz
 or con.updated_at is distinct from (b->>'contractUpdatedAt')::timestamptz
 or coalesce(lic.backoffice_users,0) is distinct from (b->>'backoffice')::int
 or coalesce(lic.web_accesses,0) is distinct from (b->>'web')::int
 or coalesce((select jsonb_agg(id::text order by id::text) from public.licensed_modules where license_id=lic.id and enabled),'[]'::jsonb) is distinct from b->'componentIds'
 then raise exception 'CONFLICT: The source license or contract changed. Prepare a new draft from the current client.'; end if;
 if lic.license_status <> 'active' or lic.is_draft then raise exception 'VALIDATION_FAILED: The source license must be active.'; end if;
 if con.contract_end_date is null or con.contract_end_date<=current_date then raise exception 'VALIDATION_FAILED: Renew the expired contract before quoting mid-cycle additions.'; end if;
 if coalesce(s->>'baselineAnnualConfirmed','false') <> 'true' or coalesce(btrim(s->>'priceReview'),'')=''
 or coalesce(btrim(p.payment_terms),'')='' or lower(p.payment_terms) ~ '(to be agreed|to be confirmed|pending|por confirmar)'
 or q->'blockers' is distinct from '[]'::jsonb
 then raise exception 'VALIDATION_FAILED: Confirm the annual baseline, pricing and agreed payment terms before validation.'; end if;
 if s->>'offerBasis'='partner' and not public.is_hq_user(auth.uid()) then raise exception 'NOT_AUTHORIZED: Partner shares require HQ.'; end if;
 if jsonb_typeof(q->'lines') is distinct from 'array' or jsonb_array_length(q->'lines') not between 1 and 100
 or coalesce((q->>'months')::numeric,0) not between 0.0001 and 1200
 or s->>'effectiveDate' is null or (s->>'effectiveDate')::date < con.contract_start_date
 or (s->>'renewalDate')::date is distinct from con.contract_end_date
 or (s->>'effectiveDate')::date >= con.contract_end_date
 or coalesce(s->>'monthPolicy','') not in ('complete','started','agreed')
 or coalesce(s->>'pricingBasis','') not in ('direct','derived')
 or coalesce(s->>'offerBasis','') not in ('customer','partner')
 or coalesce(s->>'implementationReview','') not in ('not_needed','separate')
 then raise exception 'VALIDATION_FAILED: Incomplete addition snapshot.'; end if;
 if coalesce((s->>'backoffice')::numeric,-1)<0 or coalesce((s->>'web')::numeric,-1)<0
 or (s->>'backoffice')::numeric <> trunc((s->>'backoffice')::numeric) or (s->>'web')::numeric <> trunc((s->>'web')::numeric)
 or jsonb_typeof(s->'products') is distinct from 'array'
 or exists(select 1 from jsonb_array_elements_text(s->'products') x where private.addition_product_label(x) is null or b->'owned' ? x)
 or (select count(*) <> count(distinct x) from jsonb_array_elements_text(s->'products') x)
 or (coalesce((s->>'backoffice')::int,0)=0 and coalesce((s->>'web')::int,0)=0 and jsonb_array_length(s->'products')=0 and not(s->>'editorVersion'='3' and jsonb_array_length(s->'services')>0))
 then raise exception 'VALIDATION_FAILED: Invalid or already-owned entitlements.'; end if;
 if exists(select 1 from jsonb_array_elements(q->'lines') x where
 coalesce(x->>'code','')='' or coalesce(x->>'label','')='' or coalesce((x->>'quantity')::numeric,0)<=0
 or coalesce((x->>'annual')::numeric,-1)<0 or coalesce((x->>'oneTime')::numeric,-1)<0
 or (x->>'annual')::numeric>100000000 or (x->>'oneTime')::numeric>100000000
 or (x->>'dueNow')::numeric is distinct from round((x->>'oneTime')::numeric+coalesce((x->>'initialAnnual')::numeric,(x->>'annual')::numeric)*(q->>'months')::numeric/12,2))
 or p.total_recurring is distinct from (select sum((x->>'annual')::numeric) from jsonb_array_elements(q->'lines') x)
 or p.total_year_1 is distinct from (select sum((x->>'dueNow')::numeric) from jsonb_array_elements(q->'lines') x)
 or p.total_year_1 < 0 or (p.total_year_1=0 and s->'commercial' is null)
 or (select count(*)<>count(distinct x->>'code') from jsonb_array_elements(q->'lines') x)
 then raise exception 'VALIDATION_FAILED: Incremental amounts do not agree.'; end if;
 if (select count(*) from public.proposal_items where proposal_id=p.id) <> jsonb_array_length(q->'lines')
 or exists(select 1 from jsonb_array_elements(q->'lines') x where not exists(select 1 from public.proposal_items i where i.proposal_id=p.id and i.item_code=x->>'code' and i.total=(x->>'dueNow')::numeric and i.qty=1))
 then raise exception 'VALIDATION_FAILED: Proposal line items do not agree with the saved addition.'; end if;
 -- Exact imported aliases only; unknown categories block an award, never vanish.
 select count(*) filter(where amount is null or coalesce(currency,'EUR')<>'EUR' or lower(coalesce(line_type,'')) not in ('license','mww_web','hosting','sat','s&at','web','module','plugin','implementation','training','discount','other')
 or (lower(line_type) in ('license','mww_web','hosting','sat','s&at','web','module','plugin','discount') and lower(coalesce(billing_frequency,'')) not in ('annual','annually','yearly','year','monthly','month','quarterly','quarter','semiannual','semi-annual','biannual','one-time','one_time','once'))),
 coalesce(sum(case when lower(line_type) in ('license','mww_web','hosting','sat','s&at','web','module','plugin','discount') and lower(coalesce(billing_frequency,'')) not in ('one-time','one_time','once')
 then amount * case lower(coalesce(billing_frequency,'')) when 'monthly' then 12 when 'month' then 12 when 'quarterly' then 4 when 'quarter' then 4 when 'semiannual' then 2 when 'semi-annual' then 2 when 'biannual' then 2 else 1 end else 0 end),0)
 into unknown_count,annual_base from public.contract_lines where contract_id=con.id;
 if unknown_count>0 or annual_base is distinct from (b->>'recordedAnnual')::numeric
 then raise exception 'CONFLICT: Reconcile the current contract lines and annual baseline before proceeding.'; end if;
 return annual_base;
end $function$
;
CREATE OR REPLACE FUNCTION private.award_commercial_addition(_proposal_id uuid, _evidence_type text, _acceptance_date date, _reference text, _file_path text, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare p public.proposals%rowtype; before_value numeric; d jsonb; x jsonb; item_uuid uuid; mapped_type text; before_snapshot jsonb;
begin
 if auth.uid() is null or not public.can_manage_proposal_document(_proposal_id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into strict p from public.proposals where id=_proposal_id for update;
 if not public.can_manage_client_additions(p.client_id) then raise exception 'NOT_AUTHORIZED'; end if;
 if exists(select 1 from public.commercial_addition_fulfillments where proposal_id=p.id) then return jsonb_build_object('status','Accepted','already_accepted',true); end if;
 if p.status not in ('Ready','Sent') then raise exception 'NOT_ELIGIBLE: Validate the saved draft before adjudication.'; end if;
 if _acceptance_date is null or _acceptance_date>current_date or _acceptance_date<p.proposal_date then raise exception 'INVALID_DATE: Review the adjudication date.'; end if;
 if _evidence_type not in ('signed_proposal','purchase_order','acceptance_email','internal_note') or _evidence_type is null then raise exception 'EVIDENCE_REQUIRED'; end if;
 if _evidence_type='internal_note' then
 if not public.is_hq_user(auth.uid()) or coalesce(btrim(_notes),'')='' then raise exception 'HQ_EXCEPTION_ONLY: Explain the internal exception.'; end if;
 elsif coalesce(btrim(_reference),'')='' and coalesce(btrim(_file_path),'')='' then raise exception 'EVIDENCE_REQUIRED: Enter a PO/email reference or evidence file.'; end if;
 before_value:=private.check_commercial_addition(p.id); d:=p.business_config->'commercial_addition';
 before_snapshot:=jsonb_build_object('license',(select to_jsonb(l) from public.licenses l where id=p.license_id),'contract',(select to_jsonb(c) from public.contracts c where id=p.contract_id),'lines',(select jsonb_agg(to_jsonb(l)) from public.contract_lines l where contract_id=p.contract_id));
 insert into public.commercial_addition_fulfillments(proposal_id,client_id,contract_id,license_id,accepted_by,annual_before,annual_increase,annual_after,source_snapshot,awarded_snapshot)
 values(p.id,p.client_id,p.contract_id,p.license_id,auth.uid(),before_value,p.total_recurring,before_value+p.total_recurring,before_snapshot,d);
 -- Normalize known imported spellings only as part of the adjudicated operation.
 update public.contract_lines set line_type=case lower(line_type) when 's&at' then 'sat' when 'web' then 'mww_web' else lower(line_type) end
 where contract_id=p.contract_id and line_type is distinct from case lower(line_type) when 's&at' then 'sat' when 'web' then 'mww_web' else lower(line_type) end;
 for x in select value from jsonb_array_elements(d#>'{quote,lines}') loop
 select id into strict item_uuid from public.proposal_items where proposal_id=p.id and item_code=x->>'code';
 mapped_type:=case x->>'kind' when 'service' then 'implementation' when 'expense' then 'other' when 'hosting' then 'hosting' when 'sat' then 'sat' when 'web' then 'mww_web' when 'api' then 'license' else case when x->>'code' like '%PLUGIN%' then 'plugin' when x->>'code' like '%MODULE%' then 'module' else 'license' end end;
 if (x->>'annual')::numeric>0 then
 insert into public.contract_lines(contract_id,client_id,line_type,description,related_license_id,amount,currency,billing_frequency,start_date,end_date,source,source_item_id,notes)
 values(p.contract_id,p.client_id,mapped_type,x->>'label',p.license_id,(x->>'annual')::numeric,'EUR','Annual',(d#>>'{selection,effectiveDate}')::date,(d#>>'{baseline,renewalDate}')::date,'commercial_addition_award',item_uuid,'Annual increment; payable-now proration remains on the proposal.');
 end if;
 if (x->>'oneTime')::numeric>0 then
 insert into public.contract_lines(contract_id,client_id,line_type,description,related_license_id,amount,currency,billing_frequency,start_date,end_date,source,source_item_id)
 values(p.contract_id,p.client_id,mapped_type,x->>'label',p.license_id,(x->>'oneTime')::numeric,'EUR','one-time',(d#>>'{selection,effectiveDate}')::date,null,'commercial_addition_award',item_uuid);
 end if;
 end loop;
 -- ARR changes HERE, never on draft save, validation, send or activation.
 update public.contracts set total_value=before_value+p.total_recurring,updated_at=now() where id=p.contract_id;
 update public.renewals set estimated_value=before_value+p.total_recurring,updated_at=now()
 where contract_id=p.contract_id and closed_at is null and outcome is null
 and lower(coalesce(target_type,renewal_type,''))='contract';
 perform set_config('partneros.proposal_op','on',true);
 update public.proposals set status='Accepted',accepted_at=now(),accepted_by=auth.uid(),acceptance_date=_acceptance_date,
 acceptance_evidence_type=_evidence_type,acceptance_reference=nullif(btrim(_reference),''),acceptance_file_path=nullif(btrim(_file_path),''),acceptance_notes=nullif(btrim(_notes),''),updated_at=now() where id=p.id;
 perform set_config('partneros.proposal_op','off',true);
 insert into public.proposal_status_events(proposal_id,action,from_status,to_status,actor_id,details)
 values(p.id,'addition_awarded',p.status,'Accepted',auth.uid(),jsonb_build_object('annual_before',before_value,'annual_increase',p.total_recurring,'annual_after',before_value+p.total_recurring,'activation','pending','reference',_reference));
 insert into public.lifecycle_events(client_id,event_type,event_title,event_description,actor_id,source_proposal_id,source_license_id,source_contract_id,metadata)
 values(p.client_id,'commercial_addition_awarded','Additional proposal adjudicated','ARR updated; license activation is pending the required payment confirmation.',auth.uid(),p.id,p.license_id,p.contract_id,jsonb_build_object('annual_increase',p.total_recurring,'annual_after',before_value+p.total_recurring));
 return jsonb_build_object('status','Accepted','annual_after',before_value+p.total_recurring,'activation','pending');
end $function$
;

