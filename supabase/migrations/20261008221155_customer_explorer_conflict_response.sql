-- Business conflicts are HTTP 409, not retryable serialization failures.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely; preserve all write guards.
create or replace function private.explorer_save_hq_batch(items jsonb)
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
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh'));
 for item in select value from jsonb_array_elements(items) loop
  if item->>'id' is not null then
   if item->>'expected_updated_at' is null then
    raise exception 'Refresh the directory before editing an existing customer' using errcode='PT409';
   end if;
   perform 1 from public.customer_explorer_hq
    where id=(item->>'id')::uuid and updated_at=(item->>'expected_updated_at')::timestamptz for update;
   if not found then
    raise exception 'A reviewed customer changed. Refresh and review the import again; no rows were saved.' using errcode='PT409';
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
 if affected<>expected_count then raise exception 'Reviewed customers changed; refresh and review again' using errcode='PT409';end if;
 total=affected;
 insert into public.customer_explorer_hq(client_id,name,country,sector,active,visible,evidence_status,evidence_note)
 select x.client_id,x.name,x.country,x.sector,x.active,x.visible,x.evidence_status,x.evidence_note
 from jsonb_to_recordset(items) x(id uuid,client_id text,name text,country text,sector text,
  active boolean,visible boolean,evidence_status text,evidence_note text)
 where x.id is null;
 get diagnostics affected=row_count;
 return total+affected;
end; $$;
