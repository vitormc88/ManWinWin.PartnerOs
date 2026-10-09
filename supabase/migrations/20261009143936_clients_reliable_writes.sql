-- All operations run as the caller: existing grants and RLS remain authoritative.
create or replace function public.commit_client_write_plan(p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb; payload jsonb; table_name text; cols text; inserted uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200 then
    raise exception 'Invalid client write plan';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    table_name := item->>'table'; payload := item->'row';
    if table_name is null or table_name not in ('clients','client_contacts','licenses','licensed_modules','contracts','contract_lines','renewals') or jsonb_typeof(payload) <> 'object' then
      raise exception 'Invalid client write target';
    end if;
    -- New renewals only; commercial closure always uses close_renewal.
    if table_name = 'renewals' and (coalesce(payload->>'status','Upcoming') <> 'Upcoming' or payload ? 'outcome' or payload ? 'closed_at') then
      raise exception 'Only new open renewals may be created';
    end if;
    select string_agg(format('%I', key), ', ' order by key) into cols from jsonb_object_keys(payload) key;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id', table_name, cols, cols, table_name)
      into inserted using payload;
    if inserted is null then raise exception 'Client row was not saved'; end if;
  end loop;
  -- Contract coverage is part of the same transaction; never alter commercial status.
  for item in select value from jsonb_array_elements(p_rows) where value->>'table' = 'renewals' loop
    payload := item->'row';
    if payload->>'contract_id' is not null then
      update public.renewals set is_covered_by_contract = true, covered_by_contract_id = (payload->>'contract_id')::uuid
        where client_id = (payload->>'client_id')::uuid and renewal_date = (payload->>'renewal_date')::date
          and contract_id is null and is_covered_by_contract = false
          and lower(coalesce(status,'')) not in ('won','lost','completed','cancelled','canceled');
      update public.renewals set covered_by_contract_id = (payload->>'contract_id')::uuid where id = (payload->>'id')::uuid;
    end if;
  end loop;
end;
$$;
revoke all on function public.commit_client_write_plan(jsonb) from public, anon;
grant execute on function public.commit_client_write_plan(jsonb) to authenticated;

create or replace function public.save_client_license_modules(p_license_id uuid, p_modules jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb; module_id uuid; affected integer;
begin
  if auth.uid() is null or not exists (select 1 from public.licenses where id = p_license_id and public.can_manage_client(client_id)) then
    raise exception 'License edit permission required';
  end if;
  perform 1 from public.licenses where id = p_license_id for update;
  if jsonb_typeof(p_modules) <> 'array' or jsonb_array_length(p_modules) > 100 then raise exception 'Invalid modules'; end if;
  for item in select value from jsonb_array_elements(p_modules) loop
    if nullif(btrim(item->>'module_name'),'') is null or jsonb_typeof(item->'enabled') <> 'boolean' then raise exception 'Invalid module'; end if;
    select id into module_id from public.licensed_modules where license_id = p_license_id and module_name = item->>'module_name' limit 1;
    if module_id is null then
      insert into public.licensed_modules(license_id,module_name,enabled) values (p_license_id,item->>'module_name',(item->>'enabled')::boolean);
    else
      update public.licensed_modules set enabled = (item->>'enabled')::boolean where id = module_id;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Module was not saved'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.save_client_license_modules(uuid,jsonb) from public, anon;
grant execute on function public.save_client_license_modules(uuid,jsonb) to authenticated;

create or replace function public.delete_client_license(p_license_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.licenses where id = p_license_id for update;
  delete from public.licensed_modules where license_id = p_license_id;
  delete from public.licenses where id = p_license_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'License was not deleted'; end if;
end;
$$;
revoke all on function public.delete_client_license(uuid) from public, anon;
grant execute on function public.delete_client_license(uuid) to authenticated;

-- Version is a summary of the sole current license; multi-license clients are not guessed.
create or replace function public.sync_client_license_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare cid uuid; n integer; v_version text; affected integer;
begin
  cid := case when tg_op = 'DELETE' then old.client_id else new.client_id end;
  select count(*), min(version) into n, v_version from public.licenses
    where client_id = cid and lower(coalesce(license_status,'active')) = 'active' and not coalesce(is_draft,false);
  if n <= 1 then
    update public.clients set current_version = case when n = 1 then v_version else null end where id = cid;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Client license summary was not updated'; end if;
  end if;
  return null;
end;
$$;
revoke all on function public.sync_client_license_version() from public, anon;
drop trigger if exists licenses_sync_client_version on public.licenses;
create trigger licenses_sync_client_version after insert or delete or update of version, license_status, is_draft on public.licenses
for each row execute function public.sync_client_license_version();
