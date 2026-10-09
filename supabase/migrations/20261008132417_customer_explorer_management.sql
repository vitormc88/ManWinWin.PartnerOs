-- Reviewed fresh-install source. NOT applied to PROD. Supersedes directory.sql.
-- Generate the deployment migration with Supabase CLI; test in TEST first.
create schema if not exists private;
-- Independent rollout gate. Browser roles cannot change it; default is HQ-only.
create table private.customer_explorer_rollout (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'hq' check(mode in ('off','hq','pilot','all')),
 pilot_user_ids uuid[] not null default '{}',
 changed_at timestamptz not null default now()
);
alter table private.customer_explorer_rollout enable row level security;
revoke all on private.customer_explorer_rollout from public,anon,authenticated;
insert into private.customer_explorer_rollout(singleton) values(true);
create function private.explorer_access(manage boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p cross join private.customer_explorer_rollout s where p.id=(select auth.uid())
   and s.singleton and s.mode<>'off'
   and p.is_active and coalesce(p.invitation_status,'accepted')<>'pending'
   and case when manage then p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role)
     else (p.is_hq and public.is_hq_user(p.id)) or
       (not p.is_hq and (s.mode='all' or (s.mode='pilot' and p.id=any(s.pilot_user_ids)))
        and exists(select 1 from public.partners t where t.id=p.partner_id and t.is_active)) end);
$$;
revoke all on function private.explorer_access(boolean) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.explorer_access(boolean) to authenticated;
-- Safe boolean capability API for navigation; RLS remains the actual enforcement.
create function public.customer_explorer_access()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('read',private.explorer_access(false),'manage',private.explorer_access(true));
$$;
revoke all on function public.customer_explorer_access() from public,anon,authenticated;
grant execute on function public.customer_explorer_access() to authenticated;

create table public.customer_explorer_hq (
 id uuid primary key default gen_random_uuid(),
 client_id text not null check(client_id ~ '^[0-9]{1,10}$'),
 client_key text generated always as (coalesce(nullif(ltrim(client_id,'0'),''),'0')) stored unique,
 name text not null check(length(trim(name)) between 1 and 250),
 country text not null check(country ~ '^[A-Z]{2}$'),
 sector text check(sector is null or length(trim(sector)) between 1 and 150),
 active boolean, visible boolean not null default true,
 evidence_status text not null default 'unconfirmed' check(evidence_status in ('unconfirmed','suggested','validated')),
 evidence_note text check(length(evidence_note)<=2000),
 validated_at timestamptz, validated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 check(client_key not in ('0','9998')),
 check(evidence_status<>'validated' or sector is not null)
);
create table public.customer_explorer_overrides (
 client_id uuid primary key references public.clients(id) on delete cascade,
 sector text check(sector is null or length(trim(sector)) between 1 and 150),
 visible boolean not null default true,
 evidence_status text not null default 'unconfirmed' check(evidence_status in ('unconfirmed','suggested','validated')),
 evidence_note text check(length(evidence_note)<=2000),
 validated_at timestamptz, validated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 check(evidence_status<>'validated' or sector is not null)
);
create table public.customer_explorer_audit (
 id bigint generated always as identity primary key,
 source_table text not null, record_id text not null, action text not null,
 actor uuid references public.profiles(id), occurred_at timestamptz not null default now(),
 before_data jsonb, after_data jsonb
);
create table public.customer_explorer_directory (
 id uuid primary key, client_id text not null, client_key text not null unique,
 name text not null, country text, sector text, active boolean,
 partner text not null, contact_name text not null, contact_email text,
 source_kind text not null check(source_kind in ('partner','hq')), source_id uuid not null,
 visible boolean not null, evidence_status text not null,
 evidence_note text, validated_at timestamptz, validated_by uuid,
 synced_at timestamptz not null default now()
);
-- Only public reference metadata goes into the projection. HQ notes stay in source tables.
alter table public.customer_explorer_hq enable row level security;
alter table public.customer_explorer_overrides enable row level security;
alter table public.customer_explorer_audit enable row level security;
alter table public.customer_explorer_directory enable row level security;
revoke all on public.customer_explorer_hq,public.customer_explorer_overrides,public.customer_explorer_audit,public.customer_explorer_directory from public,anon,authenticated;
grant select,insert,update on public.customer_explorer_hq,public.customer_explorer_overrides to authenticated;
grant select on public.customer_explorer_directory,public.customer_explorer_audit to authenticated;
create policy explorer_hq_manage on public.customer_explorer_hq for all to authenticated
 using((select private.explorer_access(true))) with check((select private.explorer_access(true)));
create policy explorer_override_manage on public.customer_explorer_overrides for all to authenticated
 using((select private.explorer_access(true))) with check((select private.explorer_access(true)));
create policy explorer_audit_read on public.customer_explorer_audit for select to authenticated using((select private.explorer_access(true)));
create policy explorer_directory_read on public.customer_explorer_directory for select to authenticated
 using((select private.explorer_access(false)) and (visible or (select private.explorer_access(true))));

create function private.explorer_stamp()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.explorer_access(true) then raise exception 'HQ administrator required' using errcode='42501'; end if;
 if tg_table_name='customer_explorer_hq' then
   if tg_op='UPDATE' and new.client_id<>old.client_id then raise exception 'Client ID cannot be changed'; end if;
   if exists(select 1 from public.clients c where c.client_code ~ '^[0-9]+$'
       and coalesce(nullif(ltrim(c.client_code,'0'),''),'0')=coalesce(nullif(ltrim(new.client_id,'0'),''),'0')) then
     raise exception 'Client ID already exists in PartnerOS. Edit its Explorer classification instead.' using errcode='23505';
   end if;
 end if;
 new.updated_at=now();
 if new.evidence_status='validated' then
   if tg_op='INSERT' then new.validated_at=now();new.validated_by=auth.uid();
   elsif old.evidence_status is distinct from new.evidence_status or old.sector is distinct from new.sector or old.evidence_note is distinct from new.evidence_note then
     new.validated_at=now();new.validated_by=auth.uid();
   else new.validated_at=old.validated_at;new.validated_by=old.validated_by;end if;
 else new.validated_at=null;new.validated_by=null;end if;
 return new;
end; $$;
create function private.explorer_audit_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.customer_explorer_audit(source_table,record_id,action,actor,before_data,after_data)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'client_id',to_jsonb(old)->>'id',to_jsonb(old)->>'client_id'),tg_op,auth.uid(),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return null;
end; $$;
create trigger explorer_hq_stamp before insert or update on public.customer_explorer_hq for each row execute function private.explorer_stamp();
create trigger explorer_overrides_stamp before insert or update on public.customer_explorer_overrides for each row execute function private.explorer_stamp();
create trigger explorer_hq_audit after insert or update or delete on public.customer_explorer_hq for each row execute function private.explorer_audit_change();
create trigger explorer_overrides_audit after insert or update or delete on public.customer_explorer_overrides for each row execute function private.explorer_audit_change();

create function private.refresh_customer_explorer()
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh'));
 delete from public.customer_explorer_directory;
 insert into public.customer_explorer_directory
 (id,client_id,client_key,name,country,sector,active,partner,contact_name,contact_email,source_kind,source_id,visible,evidence_status,evidence_note,validated_at,validated_by)
 select c.id,c.client_code,coalesce(nullif(ltrim(c.client_code,'0'),''),'0'),
   coalesce(nullif(c.commercial_name,''),c.short_name),c.country,
   case when o.client_id is not null then o.sector else c.sector end,
   (c.status='Active' and not coalesce(c.is_inactive,false)),
   case when c.is_hq_direct then 'ManWinWin' else coalesce(p.company_name,'ManWinWin') end,
   case when c.is_hq_direct then 'Customer Care' else coalesce(nullif(p.primary_contact_name,''),'Customer Care') end,
   case when c.is_hq_direct then 'customercare@manwinwin.com' else nullif(p.primary_contact_email,'') end,
   'partner',c.id,coalesce(o.visible,true),coalesce(o.evidence_status,'unconfirmed'),null,o.validated_at,o.validated_by
 from public.clients c left join public.partners p on p.id=c.partner_uuid
 left join public.customer_explorer_overrides o on o.client_id=c.id
 where c.status is distinct from 'Archived' and c.client_code ~ '^[0-9]+$'
   and coalesce(nullif(ltrim(c.client_code,'0'),''),'0') not in ('0','9998');
 insert into public.customer_explorer_directory
 (id,client_id,client_key,name,country,sector,active,partner,contact_name,contact_email,source_kind,source_id,visible,evidence_status,evidence_note,validated_at,validated_by)
 select h.id,h.client_id,h.client_key,h.name,h.country,h.sector,h.active,'ManWinWin','Customer Care','customercare@manwinwin.com',
   'hq',h.id,h.visible,h.evidence_status,null,h.validated_at,h.validated_by
 from public.customer_explorer_hq h
 where not exists(select 1 from public.clients c where c.client_code ~ '^[0-9]+$' and coalesce(nullif(ltrim(c.client_code,'0'),''),'0')=h.client_key);
end; $$;
create function private.sync_customer_explorer_directory()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.refresh_customer_explorer();return null;end; $$;
create trigger customer_explorer_clients_sync after insert or update or delete on public.clients for each statement execute function private.sync_customer_explorer_directory();
create trigger customer_explorer_partners_sync after insert or update or delete on public.partners for each statement execute function private.sync_customer_explorer_directory();
create trigger customer_explorer_hq_sync after insert or update or delete on public.customer_explorer_hq for each statement execute function private.sync_customer_explorer_directory();
create trigger customer_explorer_overrides_sync after insert or update or delete on public.customer_explorer_overrides for each statement execute function private.sync_customer_explorer_directory();
revoke all on function private.explorer_stamp(),private.explorer_audit_change(),private.refresh_customer_explorer(),private.sync_customer_explorer_directory() from public,anon,authenticated;
select private.refresh_customer_explorer();
