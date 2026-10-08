-- Reviewed deployment source, not applied by the local preview.
-- Generate a timestamped migration with `supabase migration new customer_explorer`
-- and copy this SQL into it when the UI is approved.
-- Purpose: share customer existence and responsible PARTNER contacts only.
-- Existing clients/partners RLS and access to detailed records are unchanged.

create table public.customer_explorer_directory (
  id uuid primary key,
  name text not null,
  country text,
  sector text,
  active boolean not null,
  partner text not null,
  contact_name text not null,
  contact_email text,
  synced_at timestamptz not null default now()
);
comment on table public.customer_explorer_directory is
  'Read-only global directory: customer name, country, sector, status and responsible partner contact. No customer contact or commercial information.';
alter table public.customer_explorer_directory enable row level security;
revoke all on public.customer_explorer_directory from public, anon, authenticated;
grant select on public.customer_explorer_directory to authenticated;

create policy customer_explorer_read on public.customer_explorer_directory
for select to authenticated using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true
      and (public.is_hq_user(p.id) or exists (
        select 1 from public.partners partner
        where partner.id = p.partner_id and partner.is_active = true
      ))
  )
  and (
    public.has_role((select auth.uid()), 'hq_admin'::public.app_role)
    or public.has_module_access('knowledge_base', 'view')
  )
);

create schema if not exists private;
-- Privileged projection happens only through database triggers, never through
-- a callable browser RPC. The private function has no execution grants.
create function private.sync_customer_explorer_directory()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.customer_explorer_directory d
  where not exists (select 1 from public.clients c where c.id=d.id and c.status <> 'Archived');
  insert into public.customer_explorer_directory
    (id,name,country,sector,active,partner,contact_name,contact_email,synced_at)
  select c.id,c.commercial_name,c.country,c.sector,
    (c.status='Active' and not coalesce(c.is_inactive,false)),
    case when c.is_hq_direct then 'ManWinWin' else coalesce(p.company_name,'ManWinWin') end,
    case when c.is_hq_direct then 'Customer Care'
      else coalesce(nullif(p.primary_contact_name,''),'Customer Care') end,
    case when c.is_hq_direct then null else nullif(p.primary_contact_email,'') end,
    now()
  from public.clients c left join public.partners p on p.id=c.partner_uuid
  where c.status <> 'Archived'
  on conflict (id) do update set name=excluded.name,country=excluded.country,
    sector=excluded.sector,active=excluded.active,partner=excluded.partner,
    contact_name=excluded.contact_name,contact_email=excluded.contact_email,
    synced_at=excluded.synced_at;
  return null;
end;
$$;
revoke all on function private.sync_customer_explorer_directory() from public,anon,authenticated;
create trigger customer_explorer_clients_sync after insert or update or delete
on public.clients for each statement execute function private.sync_customer_explorer_directory();
create trigger customer_explorer_partners_sync after insert or update or delete
on public.partners for each statement execute function private.sync_customer_explorer_directory();

-- Initial projection, without updating customer or partner source records.
insert into public.customer_explorer_directory
  (id,name,country,sector,active,partner,contact_name,contact_email)
select c.id,c.commercial_name,c.country,c.sector,
  (c.status='Active' and not coalesce(c.is_inactive,false)),
  case when c.is_hq_direct then 'ManWinWin' else coalesce(p.company_name,'ManWinWin') end,
  case when c.is_hq_direct then 'Customer Care'
    else coalesce(nullif(p.primary_contact_name,''),'Customer Care') end,
  case when c.is_hq_direct then null else nullif(p.primary_contact_email,'') end
from public.clients c left join public.partners p on p.id=c.partner_uuid
where c.status <> 'Archived';
