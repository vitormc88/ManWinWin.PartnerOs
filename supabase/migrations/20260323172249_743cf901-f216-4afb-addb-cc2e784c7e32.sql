-- Harden core multi-tenant access and admin safety for beta stabilization

-- Helper: count active HQ admins
create or replace function public.active_hq_admin_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role = 'hq_admin'
    and coalesce(p.is_active, true)
$$;

-- Helper: client-scoped access
create or replace function public.can_view_client(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = _client_id
      and (
        public.is_hq_user(auth.uid())
        or (
          c.partner_id is not null
          and public.can_view_partner(c.partner_id::uuid)
        )
      )
  )
$$;

create or replace function public.can_manage_client(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = _client_id
      and (
        public.is_hq_user(auth.uid())
        or (
          c.partner_id is not null
          and c.partner_id::uuid = public.get_user_partner_id(auth.uid())
        )
      )
  )
$$;

-- Helper: deal-scoped access
create or replace function public.can_view_deal(_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.deals d
    where d.id = _deal_id
      and (
        public.is_hq_user(auth.uid())
        or (
          d.partner_id is not null
          and public.can_view_partner(d.partner_id::uuid)
        )
      )
  )
$$;

create or replace function public.can_manage_deal(_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.deals d
    where d.id = _deal_id
      and (
        public.is_hq_user(auth.uid())
        or (
          d.partner_id is not null
          and d.partner_id::uuid = public.get_user_partner_id(auth.uid())
        )
      )
  )
$$;

-- Prevent destructive changes to the last active HQ admin role/profile
create or replace function public.prevent_last_hq_admin_role_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'hq_admin' and public.active_hq_admin_count() <= 1 then
    raise exception 'Cannot remove the last active HQ Admin';
  end if;
  return old;
end;
$$;

create or replace function public.prevent_last_hq_admin_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'hq_admin' and new.role <> 'hq_admin' and public.active_hq_admin_count() <= 1 then
    raise exception 'Cannot remove the last active HQ Admin';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_last_hq_admin_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_roles ur
    where ur.user_id = old.id and ur.role = 'hq_admin'
  )
  and public.active_hq_admin_count() <= 1
  and (
    coalesce(new.is_active, true) = false
    or coalesce(new.is_hq, false) = false
    or new.partner_id is not null
  ) then
    raise exception 'Cannot deactivate or convert the last active HQ Admin';
  end if;

  return new;
end;
$$;

create trigger prevent_last_hq_admin_role_delete_trigger
before delete on public.user_roles
for each row
execute function public.prevent_last_hq_admin_role_delete();

create trigger prevent_last_hq_admin_role_update_trigger
before update on public.user_roles
for each row
execute function public.prevent_last_hq_admin_role_update();

create trigger prevent_last_hq_admin_profile_change_trigger
before update on public.profiles
for each row
execute function public.prevent_last_hq_admin_profile_change();

-- Fix partner scoping leak: partner users must not see HQ-direct clients
drop policy if exists clients_select on public.clients;
create policy clients_select
on public.clients
for select
to authenticated
using (
  public.is_hq_user(auth.uid())
  or (
    partner_id is not null
    and public.can_view_partner(partner_id::uuid)
  )
);

-- Secure child client tables
DROP POLICY IF EXISTS "Allow all access to client_contacts" ON public.client_contacts;
create policy client_contacts_select on public.client_contacts for select to authenticated using (public.can_view_client(client_id));
create policy client_contacts_insert on public.client_contacts for insert to authenticated with check (public.can_manage_client(client_id));
create policy client_contacts_update on public.client_contacts for update to authenticated using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));
create policy client_contacts_delete on public.client_contacts for delete to authenticated using (public.can_manage_client(client_id));

DROP POLICY IF EXISTS "Allow all access to client_notes" ON public.client_notes;
create policy client_notes_select on public.client_notes for select to authenticated using (public.can_view_client(client_id));
create policy client_notes_insert on public.client_notes for insert to authenticated with check (public.can_manage_client(client_id));
create policy client_notes_update on public.client_notes for update to authenticated using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));
create policy client_notes_delete on public.client_notes for delete to authenticated using (public.can_manage_client(client_id));

DROP POLICY IF EXISTS "Allow all access to client_credentials" ON public.client_credentials;
create policy client_credentials_select on public.client_credentials for select to authenticated using (public.has_role(auth.uid(), 'hq_admin'));
create policy client_credentials_insert on public.client_credentials for insert to authenticated with check (public.has_role(auth.uid(), 'hq_admin'));
create policy client_credentials_update on public.client_credentials for update to authenticated using (public.has_role(auth.uid(), 'hq_admin')) with check (public.has_role(auth.uid(), 'hq_admin'));
create policy client_credentials_delete on public.client_credentials for delete to authenticated using (public.has_role(auth.uid(), 'hq_admin'));

-- Secure child deal tables
DROP POLICY IF EXISTS "Allow all access to deal_contacts" ON public.deal_contacts;
create policy deal_contacts_select on public.deal_contacts for select to authenticated using (public.can_view_deal(deal_id));
create policy deal_contacts_insert on public.deal_contacts for insert to authenticated with check (public.can_manage_deal(deal_id));
create policy deal_contacts_update on public.deal_contacts for update to authenticated using (public.can_manage_deal(deal_id)) with check (public.can_manage_deal(deal_id));
create policy deal_contacts_delete on public.deal_contacts for delete to authenticated using (public.can_manage_deal(deal_id));

DROP POLICY IF EXISTS "Allow all access to deal_tasks" ON public.deal_tasks;
create policy deal_tasks_select on public.deal_tasks for select to authenticated using (public.can_view_deal(deal_id));
create policy deal_tasks_insert on public.deal_tasks for insert to authenticated with check (public.can_manage_deal(deal_id));
create policy deal_tasks_update on public.deal_tasks for update to authenticated using (public.can_manage_deal(deal_id)) with check (public.can_manage_deal(deal_id));
create policy deal_tasks_delete on public.deal_tasks for delete to authenticated using (public.can_manage_deal(deal_id));

DROP POLICY IF EXISTS "Allow all access to deal_activities" ON public.deal_activities;
create policy deal_activities_select on public.deal_activities for select to authenticated using (public.can_view_deal(deal_id));
create policy deal_activities_insert on public.deal_activities for insert to authenticated with check (public.can_manage_deal(deal_id));
create policy deal_activities_update on public.deal_activities for update to authenticated using (public.can_manage_deal(deal_id)) with check (public.can_manage_deal(deal_id));
create policy deal_activities_delete on public.deal_activities for delete to authenticated using (public.can_manage_deal(deal_id));