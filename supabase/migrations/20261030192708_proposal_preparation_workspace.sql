-- Working copies are deliberately outside proposals: incomplete preparation has
-- no prices in analytics, approval fingerprint, status transition or award path.
create table public.proposal_preparations (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 license_id uuid not null references public.licenses(id),
 contract_id uuid not null references public.contracts(id),
 partner_uuid uuid,
 proposal_id uuid references public.proposals(id), proposal_updated_at timestamptz,
 kind text not null check(kind in ('addition','request')),
 body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=1048576),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default clock_timestamp()
);
create index proposal_preparations_client on public.proposal_preparations(client_id,updated_at desc);
create index proposal_preparations_license on public.proposal_preparations(license_id);
create index proposal_preparations_contract on public.proposal_preparations(contract_id);
create index proposal_preparations_proposal on public.proposal_preparations(proposal_id);
create index proposal_preparations_creator on public.proposal_preparations(created_by);
alter table public.proposal_preparations enable row level security;
revoke all on public.proposal_preparations from public,anon,authenticated;
grant select on public.proposal_preparations to authenticated;
create policy proposal_preparations_read on public.proposal_preparations for select to authenticated
 using(public.can_manage_client_additions(client_id));

create function public.save_proposal_preparation(_id uuid,_expected_updated_at timestamptz,
 _client_id uuid,_license_id uuid,_contract_id uuid,_kind text,_body jsonb,
 _proposal_id uuid default null,_proposal_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare working_record public.proposal_preparations%rowtype; pid uuid; b jsonb;
begin
 if auth.uid() is null or not public.can_manage_client_additions(_client_id) then raise exception 'NOT_AUTHORIZED: Commercial edit permission is required'; end if;
 if _kind not in ('addition','request') or jsonb_typeof(_body) is distinct from 'object' or octet_length(_body::text)>1048576 then raise exception 'VALIDATION_FAILED: Invalid preparation'; end if;
 select partner_uuid into pid from public.clients where id=_client_id;
 if not found or not exists(select 1 from public.licenses where id=_license_id and client_id=_client_id)
 or not exists(select 1 from public.contracts where id=_contract_id and client_id=_client_id) then raise exception 'NOT_AUTHORIZED: Invalid preparation source'; end if;
 if _kind='addition' then
  b:=_body#>'{draft,baseline}';
  if _body#>>'{draft,schema}' is distinct from 'commercial_addition_v1' or coalesce(_body#>>'{draft,action}','') not in ('add_users','add_modules','add_plugins')
   or b->>'clientId' is distinct from _client_id::text or b->>'licenseId' is distinct from _license_id::text or b->>'contractId' is distinct from _contract_id::text
   or jsonb_typeof(_body#>'{draft,selection}') is distinct from 'object' then raise exception 'VALIDATION_FAILED: Invalid addition preparation'; end if;
 elsif coalesce(_body#>>'{request,mode}','') not in ('upgrade_license','change_hosting','other') then raise exception 'VALIDATION_FAILED: Invalid review request'; end if;
 if _proposal_id is not null and not exists(select 1 from public.proposals where id=_proposal_id and status='Draft' and source_type='client' and client_id=_client_id and license_id=_license_id and contract_id=_contract_id and updated_at=_proposal_updated_at) then raise exception 'CONFLICT: The source draft changed; reopen before saving'; end if;
 if _id is null then
  insert into public.proposal_preparations(client_id,license_id,contract_id,partner_uuid,proposal_id,proposal_updated_at,kind,body,created_by)
  values(_client_id,_license_id,_contract_id,pid,_proposal_id,_proposal_updated_at,_kind,_body,auth.uid()) returning * into working_record;
 else
  select * into working_record from public.proposal_preparations where id=_id for update;
  if not found or working_record.client_id<>_client_id or working_record.license_id<>_license_id or working_record.contract_id<>_contract_id or working_record.kind<>_kind
   or working_record.proposal_id is distinct from _proposal_id or working_record.proposal_updated_at is distinct from _proposal_updated_at then raise exception 'NOT_AUTHORIZED: Preparation source cannot be changed'; end if;
  if _expected_updated_at is null or working_record.updated_at is distinct from _expected_updated_at then raise exception 'CONFLICT: Preparation was changed by another user; reopen it'; end if;
  update public.proposal_preparations set body=_body,updated_at=clock_timestamp() where id=_id returning * into working_record;
 end if;
 return to_jsonb(working_record);
end $$;
revoke all on function public.save_proposal_preparation(uuid,timestamptz,uuid,uuid,uuid,text,jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.save_proposal_preparation(uuid,timestamptz,uuid,uuid,uuid,text,jsonb,uuid,timestamptz) to authenticated;

create function public.complete_proposal_preparation(_preparation_id uuid,_preparation_updated_at timestamptz,_payload jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare working_record public.proposal_preparations%rowtype; result_id uuid;
begin
 select * into working_record from public.proposal_preparations where id=_preparation_id for update;
 if not found or auth.uid() is null or not public.can_manage_client_additions(working_record.client_id) then raise exception 'NOT_AUTHORIZED: Commercial edit permission is required'; end if;
 if working_record.kind<>'addition' or working_record.updated_at is distinct from _preparation_updated_at then raise exception 'CONFLICT: Reopen the current addition preparation'; end if;
 if _payload->>'client_id' is distinct from working_record.client_id::text or _payload->>'license_id' is distinct from working_record.license_id::text or _payload->>'contract_id' is distinct from working_record.contract_id::text then raise exception 'NOT_AUTHORIZED: Preparation source cannot be changed'; end if;
 -- The existing official operation independently validates source, catalogue,
 -- arithmetic, permissions, detailed terms and optimistic concurrency.
 result_id:=public.save_commercial_addition_draft(working_record.proposal_id,working_record.proposal_updated_at,_payload);
 delete from public.proposal_preparations where id=working_record.id;
 return result_id;
end $$;
revoke all on function public.complete_proposal_preparation(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.complete_proposal_preparation(uuid,timestamptz,jsonb) to authenticated;

-- Never interpret an empty choice as authorized credit. Complete historic
-- agreements keep exactly the same generated text and approval fingerprint.
do $$ declare definition text; needle text; begin
 select pg_get_functiondef('private.addition_payment_text(jsonb)'::regprocedure) into definition;
 needle:=' first_due:=';
 if position(needle in definition)=0 then raise exception 'Unexpected payment-text implementation'; end if;
 definition:=replace(definition,needle,E' if coalesce(p->>''invoice'','''') not in (''award'',''split'') or coalesce(p->>''activation'','''') not in (''full_payment'',''award_payment'',''on_award'') then return case when pt then ''Condições de pagamento e ativação por definir.'' else ''Payment and activation conditions have not been agreed yet.'' end; end if;\n'||needle);
 execute definition;
end $$;
