-- Additions remain non-operative until the explicit acceptance operation.
create table public.commercial_addition_fulfillments (
 proposal_id uuid primary key references public.proposals(id) on delete restrict,
 client_id uuid not null references public.clients(id),
 contract_id uuid not null references public.contracts(id),
 license_id uuid not null references public.licenses(id),
 accepted_at timestamptz not null default now(), accepted_by uuid not null references public.profiles(id),
 annual_before numeric not null, annual_increase numeric not null, annual_after numeric not null,
 source_snapshot jsonb not null, awarded_snapshot jsonb not null,
 activated_at timestamptz, activated_by uuid references public.profiles(id), payment_reference text,
 activation_snapshot jsonb,
 check (annual_before >= 0 and annual_increase >= 0 and annual_after = annual_before + annual_increase)
);
alter table public.commercial_addition_fulfillments enable row level security;
revoke all on public.commercial_addition_fulfillments from anon,authenticated;
grant select on public.commercial_addition_fulfillments to authenticated;
create policy addition_fulfillment_read on public.commercial_addition_fulfillments for select to authenticated
 using (public.can_view_client(client_id));
create index addition_fulfillment_client on public.commercial_addition_fulfillments(client_id);
create index addition_fulfillment_contract on public.commercial_addition_fulfillments(contract_id);
create index addition_fulfillment_license on public.commercial_addition_fulfillments(license_id);
create index addition_fulfillment_accepted_by on public.commercial_addition_fulfillments(accepted_by);
create index addition_fulfillment_activated_by on public.commercial_addition_fulfillments(activated_by);

create or replace function private.addition_product_label(product text) returns text
language sql immutable set search_path=pg_catalog as $$ select case product
 when 'requests' then 'Maintenance Requests' when 'stock' then 'Stock Management'
 when 'purchase' then 'Purchase Orders' when 'import' then 'Import Tool'
 when 'workflow' then 'Workflow' when 'reports' then 'Advanced Reports'
 when 'sla' then 'SLA' when 'api' then 'API' end $$;
revoke all on function private.addition_product_label(text) from public,anon,authenticated;

-- Shared preflight for validation AND award. Authorization is checked by caller.
create or replace function private.check_commercial_addition(proposal_uuid uuid) returns numeric
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare p public.proposals%rowtype; lic public.licenses%rowtype; con public.contracts%rowtype;
 d jsonb; b jsonb; s jsonb; q jsonb; annual_base numeric; unknown_count int;
begin
 select * into strict p from public.proposals where id=proposal_uuid;
 d:=p.business_config->'commercial_addition'; b:=d->'baseline'; s:=d->'selection'; q:=d->'quote';
 if p.source_type <> 'client' or d->>'schema' is distinct from 'commercial_addition_v1'
 or d->>'action' not in ('add_users','add_modules','add_plugins') then raise exception 'VALIDATION_FAILED: Not a supported client addition.'; end if;
 if not public.can_manage_client(p.client_id) then raise exception 'NOT_AUTHORIZED: Client edit permission is required.'; end if;
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
 or (coalesce((s->>'backoffice')::int,0)=0 and coalesce((s->>'web')::int,0)=0 and jsonb_array_length(s->'products')=0)
 then raise exception 'VALIDATION_FAILED: Invalid or already-owned entitlements.'; end if;
 if exists(select 1 from jsonb_array_elements(q->'lines') x where
 coalesce(x->>'code','')='' or coalesce(x->>'label','')='' or coalesce((x->>'quantity')::numeric,0)<=0
 or coalesce((x->>'annual')::numeric,-1)<0 or coalesce((x->>'oneTime')::numeric,-1)<0
 or (x->>'annual')::numeric>100000000 or (x->>'oneTime')::numeric>100000000
 or (x->>'dueNow')::numeric is distinct from round((x->>'oneTime')::numeric+(x->>'annual')::numeric*(q->>'months')::numeric/12,2))
 or p.total_recurring is distinct from (select sum((x->>'annual')::numeric) from jsonb_array_elements(q->'lines') x)
 or p.total_year_1 is distinct from (select sum((x->>'dueNow')::numeric) from jsonb_array_elements(q->'lines') x)
 or p.total_year_1 <= 0
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
end $$;
revoke all on function private.check_commercial_addition(uuid) from public,anon,authenticated;

create or replace function private.award_commercial_addition(_proposal_id uuid,_evidence_type text,_acceptance_date date,_reference text,_file_path text,_notes text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare p public.proposals%rowtype; before_value numeric; d jsonb; x jsonb; item_uuid uuid; mapped_type text; before_snapshot jsonb;
begin
 if auth.uid() is null or not public.can_manage_proposal_document(_proposal_id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into strict p from public.proposals where id=_proposal_id for update;
 if not public.can_manage_client(p.client_id) then raise exception 'NOT_AUTHORIZED'; end if;
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
 mapped_type:=case x->>'kind' when 'hosting' then 'hosting' when 'sat' then 'sat' when 'web' then 'mww_web' when 'api' then 'license' else case when x->>'code' like '%PLUGIN%' then 'plugin' when x->>'code' like '%MODULE%' then 'module' else 'license' end end;
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
end $$;
revoke all on function private.award_commercial_addition(uuid,text,date,text,text,text) from public,anon,authenticated;

create or replace function public.commercial_addition_action(_proposal_id uuid,_action text,_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare p public.proposals%rowtype; f public.commercial_addition_fulfillments%rowtype; lic public.licenses%rowtype; d jsonb; product text; label text; component_uuid uuid; catalog_uuid uuid; result jsonb;
begin
 if auth.uid() is null or not public.can_manage_proposal_document(_proposal_id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into strict p from public.proposals where id=_proposal_id for update;
 if not public.can_manage_client(p.client_id) or p.source_type <> 'client' or p.business_config#>>'{commercial_addition,schema}' is distinct from 'commercial_addition_v1' then raise exception 'NOT_AUTHORIZED'; end if;
 if _action is null or _action not in ('validate','sent','accept','reject','revise','activate') then raise exception 'VALIDATION_FAILED: Unknown operation.'; end if;
 if _action='validate' then return public.validate_proposal(p.id,null,null); end if;
 if _action='sent' then return public.mark_proposal_sent(p.id,(_details->>'date')::date,'manual',_details->>'note'); end if;
 if _action='accept' then return public.record_proposal_acceptance(p.id,_details->>'evidence_type',(_details->>'date')::date,_details->>'reference',null,_details->>'note'); end if;
 if _action in ('reject','revise') then
 if exists(select 1 from public.commercial_addition_fulfillments where proposal_id=p.id) or p.status not in ('Draft','Ready','Sent') then raise exception 'NOT_ELIGIBLE: An adjudicated or closed proposal cannot be revised or rejected.'; end if;
 if coalesce(btrim(_details->>'note'),'')='' then raise exception 'VALIDATION_FAILED: Enter a reason.'; end if;
 perform set_config('partneros.proposal_op','on',true);
 update public.proposals set status=case _action when 'reject' then 'Lost' else 'Draft' end,validated_at=null,validated_by=null,updated_at=now() where id=p.id;
 perform set_config('partneros.proposal_op','off',true);
 insert into public.proposal_status_events(proposal_id,action,from_status,to_status,actor_id,details)
 values(p.id,'addition_'||_action,p.status,case _action when 'reject' then 'Lost' else 'Draft' end,auth.uid(),_details);
 return jsonb_build_object('status',case _action when 'reject' then 'Lost' else 'Draft' end);
 end if;
 if _action <> 'activate' then raise exception 'VALIDATION_FAILED: Unknown operation.'; end if;
 select * into strict f from public.commercial_addition_fulfillments where proposal_id=p.id for update;
 if f.activated_at is not null then return jsonb_build_object('activated',true,'already_applied',true); end if;
 if p.status <> 'Accepted' then raise exception 'NOT_ELIGIBLE: Adjudication is required before license activation.'; end if;
 if coalesce(_details->>'payment_confirmed','false') <> 'true' or coalesce(btrim(_details->>'reference'),'')='' then raise exception 'PAYMENT_REQUIRED: Confirm payment/activation conditions and enter the reference.'; end if;
 d:=f.awarded_snapshot;
 if (d#>>'{selection,effectiveDate}')::date>current_date then raise exception 'INVALID_DATE: The agreed effective date has not arrived.'; end if;
 select * into strict lic from public.licenses where id=f.license_id and client_id=f.client_id for update;
 perform 1 from public.contracts where id=f.contract_id and client_id=f.client_id and contract_end_date=(d#>>'{baseline,renewalDate}')::date for update;
 if not found then raise exception 'CONFLICT: The awarded contract changed; reconcile activation with HQ.'; end if;
 if lic.license_status <> 'active' or lic.is_draft or lic.updated_at is distinct from (d#>>'{baseline,licenseUpdatedAt}')::timestamptz
 or coalesce(lic.backoffice_users,0) is distinct from (d#>>'{baseline,backoffice}')::int
 or coalesce(lic.web_accesses,0) is distinct from (d#>>'{baseline,web}')::int
 or coalesce((select jsonb_agg(id::text order by id::text) from public.licensed_modules where license_id=lic.id and enabled),'[]'::jsonb) is distinct from d#>'{baseline,componentIds}'
 then raise exception 'CONFLICT: License entitlements changed after the proposal. No access was overwritten.'; end if;
 for product in select jsonb_array_elements_text(d#>'{selection,products}') loop
 label:=private.addition_product_label(product);
 if label is null then raise exception 'VALIDATION_FAILED: Unknown component.'; end if;
 if product='api' then continue; end if;
 catalog_uuid:=null;
 if product in ('requests','stock','purchase') then select id into catalog_uuid from public.modules_catalog where lower(name)=lower(label) order by id limit 1;
 else select id into catalog_uuid from public.plugins_catalog where lower(name)=lower(label) order by id limit 1; end if;
 if catalog_uuid is null then raise exception 'CONFLICT: The awarded component is missing from the entitlement catalog. Reconcile it with HQ before activation.'; end if;
 select id into component_uuid from public.licensed_modules where license_id=lic.id and lower(module_name)=lower(label) order by created_at limit 1 for update;
 if component_uuid is not null then update public.licensed_modules set enabled=true,
 module_id=case when product in ('requests','stock','purchase') then catalog_uuid end,
 plugin_id=case when product not in ('requests','stock','purchase') then catalog_uuid end,
 item_type=case when product in ('requests','stock','purchase') then 'module' else 'plugin' end,
 license_type=lic.license_model,periodicity=case when d#>>'{baseline,model}'='keepit' then 'Perpetual' else 'Annual' end,
 start_date=(d#>>'{selection,effectiveDate}')::date,end_date=(d#>>'{baseline,renewalDate}')::date where id=component_uuid;
 else insert into public.licensed_modules(license_id,module_name,enabled,item_type,module_id,plugin_id,license_type,periodicity,quantity,included_in_base,start_date,end_date,notes)
 values(lic.id,label,true,case when product in ('requests','stock','purchase') then 'module' else 'plugin' end,
 case when product in ('requests','stock','purchase') then catalog_uuid end,case when product not in ('requests','stock','purchase') then catalog_uuid end,
 lic.license_model,case when d#>>'{baseline,model}'='keepit' then 'Perpetual' else 'Annual' end,
 1,false,(d#>>'{selection,effectiveDate}')::date,(d#>>'{baseline,renewalDate}')::date,'Adjudicated addition proposal '||p.id::text);
 end if;
 end loop;
 update public.licenses set backoffice_users=coalesce(backoffice_users,0)+(d#>>'{selection,backoffice}')::int,
 web_accesses=coalesce(web_accesses,0)+(d#>>'{selection,web}')::int,
 api_access=coalesce(api_access,false) or (d#>'{selection,products}' ? 'api'),updated_at=now() where id=lic.id;
 update public.commercial_addition_fulfillments set activated_at=now(),activated_by=auth.uid(),payment_reference=_details->>'reference',activation_snapshot=jsonb_build_object('before',to_jsonb(lic),'after',(select to_jsonb(l) from public.licenses l where id=lic.id)) where proposal_id=p.id;
 insert into public.lifecycle_events(client_id,event_type,event_title,event_description,actor_id,source_proposal_id,source_license_id,source_contract_id,metadata)
 values(p.client_id,'commercial_addition_activated','Adjudicated additions activated','Only the awarded accesses/components were applied. ARR was already recorded at adjudication.',auth.uid(),p.id,p.license_id,p.contract_id,jsonb_build_object('payment_reference',_details->>'reference','products',d#>'{selection,products}','backoffice_added',d#>'{selection,backoffice}','web_added',d#>'{selection,web}'));
 return jsonb_build_object('activated',true,'already_applied',false);
end $$;
revoke all on function public.commercial_addition_action(uuid,text,jsonb) from public,anon;
grant execute on function public.commercial_addition_action(uuid,text,jsonb) to authenticated;

-- Extend the OFFICIAL operations; retain their original paths for all other proposals.
do $$ declare definition text; needle text; begin
 select pg_get_functiondef('public.validate_proposal(uuid,text,text)'::regprocedure) into definition;
 needle:='IF coalesce(p.total_recurring,0) < 0 OR coalesce(p.total_recurring,0) > coalesce(p.total_year_1,0) + 0.01 THEN';
 if position(needle in definition)=0 then raise exception 'Unexpected validate_proposal definition; review before applying.'; end if;
 definition:=replace(definition,needle,
 'IF p.source_type = ''client'' AND p.business_config #>> ''{commercial_addition,schema}'' = ''commercial_addition_v1'' THEN
    PERFORM private.check_commercial_addition(p.id);
  ELSIF coalesce(p.total_recurring,0) < 0 OR coalesce(p.total_recurring,0) > coalesce(p.total_year_1,0) + 0.01 THEN');
 execute definition;
 select pg_get_functiondef('public.record_proposal_acceptance(uuid,text,date,text,text,text)'::regprocedure) into definition;
 needle:='IF p.renewal_id IS NULL THEN RAISE EXCEPTION ''NOT_RENEWAL: acceptance is recorded only for renewal proposals; use Award & Convert for opportunities''; END IF;';
 if position(needle in definition)=0 then raise exception 'Unexpected acceptance definition; review before applying.'; end if;
 definition:=replace(definition,needle,
 'IF p.source_type = ''client'' AND p.business_config #>> ''{commercial_addition,schema}'' = ''commercial_addition_v1'' THEN
    RETURN private.award_commercial_addition(p.id,_evidence_type,_acceptance_date,_reference,_file_path,_notes);
  END IF;
  '||needle);
 execute definition;
end $$;
