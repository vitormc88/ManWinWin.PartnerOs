create table public.customer_explorer_media(
 client_key text primary key check(client_key ~ '^[1-9][0-9]{0,9}$' and client_key<>'9998'),
 logo_path text, logo_dark boolean not null default false,
 case_study jsonb,
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id),
 check(logo_path is null or logo_path ~ ('^'||client_key||'/[a-f0-9-]+\.(png|jpg|webp)$'))
);
alter table public.customer_explorer_media enable row level security;
revoke all on public.customer_explorer_media from public,anon,authenticated;
grant select,insert,update on public.customer_explorer_media to authenticated;
create policy explorer_media_read on public.customer_explorer_media for select to authenticated using(
 (select private.explorer_access(false)) and exists(select 1 from public.customer_explorer_directory d
 where d.client_key=customer_explorer_media.client_key and (d.visible or (select private.explorer_access(true)))));
create policy explorer_media_insert on public.customer_explorer_media for insert to authenticated with check((select private.explorer_access(true)));
create policy explorer_media_update on public.customer_explorer_media for update to authenticated
 using((select private.explorer_access(true))) with check((select private.explorer_access(true)));

create function private.explorer_media_stamp()
returns trigger language plpgsql security definer set search_path='' as $$
declare field text;
begin
 if not private.explorer_access(true) then raise exception 'HQ directory editor required' using errcode='42501';end if;
 if tg_op='UPDATE' and new.client_key<>old.client_key then raise exception 'Client identity cannot change';end if;
 if not exists(select 1 from public.customer_explorer_directory where client_key=new.client_key) then raise exception 'Client not present in Explorer';end if;
 if new.case_study is not null then
  if jsonb_typeof(new.case_study)<>'object' then raise exception 'Case study must be an object';end if;
  foreach field in array array['title','url','language','scope','problem','approach','evidence','limitation','reviewed_at'] loop
   if jsonb_typeof(new.case_study->field) is distinct from 'string'
    or length(trim(new.case_study->>field)) not between 1 and 2000 then
    raise exception 'Case study field missing or invalid: %',field;end if;
  end loop;
  if new.case_study->>'url' !~ '^https://www\.manwinwin\.com/[a-zA-Z0-9/_?=&.%-]+$' then raise exception 'Use an official public ManWinWin case-study URL';end if;
  if new.case_study->>'reviewed_at' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD review date';end if;
  if (new.case_study->>'reviewed_at')::date>current_date then raise exception 'Review date cannot be in the future';end if;
  -- Publish only the reviewed schema, not arbitrary uploaded/private JSON fields.
  new.case_study=(select jsonb_object_agg(key,value) from jsonb_each(new.case_study)
   where key=any(array['title','url','language','scope','problem','approach','evidence','limitation','reviewed_at']));
 end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end; $$;
create function private.explorer_media_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.customer_explorer_audit(source_table,record_id,action,actor,before_data,after_data)
 values('customer_explorer_media',new.client_key,tg_op,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return null;
end; $$;
create trigger explorer_media_stamp before insert or update on public.customer_explorer_media for each row execute function private.explorer_media_stamp();
create trigger explorer_media_audit after insert or update on public.customer_explorer_media for each row execute function private.explorer_media_audit();
revoke all on function private.explorer_media_stamp(),private.explorer_media_audit() from public,anon,authenticated;

-- Private assets, no public bucket. Retrieval also obeys rollout and module RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-explorer-logos','customer-explorer-logos',false,256000,array['image/png','image/jpeg','image/webp']);
create policy explorer_logo_insert on storage.objects for insert to authenticated with check(
 bucket_id='customer-explorer-logos' and (select private.explorer_access(true))
 and name ~ '^[1-9][0-9]{0,9}/[a-f0-9-]+\.(png|jpg|webp)$'
 and exists(select 1 from public.customer_explorer_directory d where d.client_key=split_part(name,'/',1)));
create policy explorer_logo_read on storage.objects for select to authenticated using(
 bucket_id='customer-explorer-logos' and (select private.explorer_access(false)) and
 ((select private.explorer_access(true)) or exists(select 1 from public.customer_explorer_media m
 join public.customer_explorer_directory d on d.client_key=m.client_key
 where m.logo_path=storage.objects.name and d.visible)));
-- Replacements use fresh object names. No overwrite/delete grants are added.
