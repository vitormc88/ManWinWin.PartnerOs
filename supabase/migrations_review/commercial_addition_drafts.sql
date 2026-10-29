-- Additive, draft-only save. No grants or RLS policies on existing data are widened.
-- Snapshot + line mirrors commit together; no customer/license/renewal writes.
create or replace function public.save_commercial_addition_draft(
  _proposal_id uuid, _expected_updated_at timestamptz, _payload jsonb
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  draft jsonb := _payload #> '{business_config,commercial_addition}';
  b jsonb; q jsonb; s jsonb; l jsonb;
  cid uuid; lid uuid; source_contract_id uuid; pid uuid; result_id uuid; version_number integer;
  existing public.proposals%rowtype;
  current_license public.licenses%rowtype;
  current_contract public.contracts%rowtype;
  sum_now numeric; sum_annual numeric; line_no integer := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED: Sign in before saving a proposal.'; end if;
  if jsonb_typeof(draft) is distinct from 'object' or coalesce(draft->>'schema','') <> 'commercial_addition_v1' or
    coalesce(draft->>'action','') not in ('add_users','add_modules','add_plugins') then
    raise exception 'VALIDATION_FAILED: Unsupported addition snapshot.';
  end if;
  b := draft->'baseline'; q := draft->'quote'; s := draft->'selection';
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
    or (x->>'dueNow')::numeric is distinct from round((x->>'oneTime')::numeric + (x->>'annual')::numeric * (q->>'months')::numeric / 12,2)
    or (x->>'dueNow')::numeric > 100000000 or (x->>'annual')::numeric > 100000000) then
    raise exception 'VALIDATION_FAILED: Invalid addition amounts.';
  end if;
  if (select count(*) <> count(distinct x->>'code') from jsonb_array_elements(q->'lines') x) then
    raise exception 'VALIDATION_FAILED: Duplicate addition line codes.';
  end if;
  select round(sum((x->>'dueNow')::numeric),2),round(sum((x->>'annual')::numeric),2)
    into sum_now,sum_annual from jsonb_array_elements(q->'lines') x;
  if coalesce(sum_now,0) <= 0 or sum_now is distinct from (_payload->>'total_year_1')::numeric
    or sum_annual is distinct from (_payload->>'total_recurring')::numeric
    or sum_now is distinct from (q->>'dueNow')::numeric or sum_annual is distinct from (q->>'annualIncrease')::numeric then
    raise exception 'VALIDATION_FAILED: Header, snapshot and incremental line totals do not agree.';
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
    values(result_id,'addon',l->>'code',l->>'label',
      'Incremental amount to existing renewal; annual increase ' || (l->>'annual') || '. See commercial_addition snapshot for period and rule provenance.',
      1,(l->>'dueNow')::numeric,'one-time',(l->>'dueNow')::numeric,(l->>'dueNow')::numeric,(l->>'dueNow')::numeric,
      'none',0,0,false,false,line_no);
    line_no := line_no+1;
  end loop;
  return result_id;
end;
$$;
revoke all on function public.save_commercial_addition_draft(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.save_commercial_addition_draft(uuid,timestamptz,jsonb) to authenticated;
