-- Atomic reviewed HQ imports. RLS and the existing audit/validation triggers
-- remain authoritative; no security-definer write endpoint is introduced.
create or replace function private.explorer_stamp()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.explorer_access(true) then raise exception 'HQ administrator required' using errcode='42501';end if;
 if tg_table_name='customer_explorer_hq' then
  if tg_op='UPDATE' and new.client_id<>old.client_id then raise exception 'Client ID cannot be changed';end if;
  if exists(select 1 from public.clients c where c.client_code ~ '^[0-9]+$'
   and coalesce(nullif(ltrim(c.client_code,'0'),''),'0')=coalesce(nullif(ltrim(new.client_id,'0'),''),'0')) then
   raise exception 'Client ID already exists in PartnerOS. Edit its Explorer classification instead.' using errcode='23505';
  end if;
 end if;
 -- Strictly advancing revisions also cover transactions started before a lock wait.
 if tg_op='UPDATE' then new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 else new.updated_at=clock_timestamp();end if;
 if new.evidence_status='validated' then
  if tg_op='INSERT' then new.validated_at=now();new.validated_by=auth.uid();
  elsif old.evidence_status is distinct from new.evidence_status or old.sector is distinct from new.sector or old.evidence_note is distinct from new.evidence_note then
   new.validated_at=now();new.validated_by=auth.uid();
  else new.validated_at=old.validated_at;new.validated_by=old.validated_by;end if;
 else new.validated_at=null;new.validated_by=null;end if;
 return new;
end; $$;
create function private.explorer_save_hq_batch(items jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; expected_count integer; affected integer; total integer=0;
begin
 if not private.explorer_access(true) then
  raise exception 'HQ administrator required' using errcode='42501';
 end if;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 5000 then
  raise exception 'Provide between 1 and 5000 reviewed HQ rows';
 end if;
 if exists(select 1 from jsonb_array_elements(items) x where jsonb_typeof(x) is distinct from 'object') then
  raise exception 'Invalid reviewed row';
 end if;
 if exists(select 1 from jsonb_array_elements(items) x
  group by coalesce(nullif(ltrim(x->>'client_id','0'),''),'0') having count(*)>1) then
  raise exception 'Duplicate Client ID in reviewed batch';
 end if;
 -- Same lock/order as projection refresh: prevents cross-editor deadlocks.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh'));
 for item in select value from jsonb_array_elements(items) loop
  if item->>'id' is not null then
   if item->>'expected_updated_at' is null then
    raise exception 'Refresh the directory before editing an existing customer' using errcode='40001';
   end if;
   perform 1 from public.customer_explorer_hq
    where id=(item->>'id')::uuid and updated_at=(item->>'expected_updated_at')::timestamptz for update;
   if not found then
    raise exception 'A reviewed customer changed. Refresh and review the import again; no rows were saved.' using errcode='40001';
   end if;
  end if;
 end loop;
 select count(*) into expected_count from jsonb_array_elements(items) x where x->>'id' is not null;
 update public.customer_explorer_hq h set
  client_id=x.client_id,name=x.name,country=x.country,sector=x.sector,
  active=x.active,visible=x.visible,evidence_status=x.evidence_status,evidence_note=x.evidence_note
 from jsonb_to_recordset(items) x(id uuid,client_id text,name text,country text,sector text,
  active boolean,visible boolean,evidence_status text,evidence_note text,expected_updated_at timestamptz)
 where h.id=x.id and h.updated_at=x.expected_updated_at;
 get diagnostics affected=row_count;
 if affected<>expected_count then raise exception 'Reviewed customers changed; refresh and review again' using errcode='40001';end if;
 total=affected;
 insert into public.customer_explorer_hq(client_id,name,country,sector,active,visible,evidence_status,evidence_note)
 select x.client_id,x.name,x.country,x.sector,x.active,x.visible,x.evidence_status,x.evidence_note
 from jsonb_to_recordset(items) x(id uuid,client_id text,name text,country text,sector text,
  active boolean,visible boolean,evidence_status text,evidence_note text)
 where x.id is null;
 get diagnostics affected=row_count;
 return total+affected;
end; $$;
create function public.customer_explorer_save_hq_batch(items jsonb)
returns integer language sql security invoker set search_path='' as $$
 select private.explorer_save_hq_batch(items);
$$;
revoke all on function private.explorer_save_hq_batch(jsonb),public.customer_explorer_save_hq_batch(jsonb) from public,anon,authenticated;
grant execute on function private.explorer_save_hq_batch(jsonb),public.customer_explorer_save_hq_batch(jsonb) to authenticated;
