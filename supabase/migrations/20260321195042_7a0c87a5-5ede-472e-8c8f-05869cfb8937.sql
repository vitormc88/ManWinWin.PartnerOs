-- Tighten RLS for core operational tables and add helper functions for scoped access.

-- Ensure helper functions have fixed search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_partner_manager_for_partner(_user_id uuid, _partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partners p
    where p.id = _partner_id
      and p.assigned_manager_id = _user_id
  );
$$;

create or replace function public.can_manage_partner(_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.has_role(auth.uid(), 'hq_admin')
    or public.is_partner_manager_for_partner(auth.uid(), _partner_id)
  );
$$;

create or replace function public.can_view_partner(_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.is_hq_user(auth.uid())
    or _partner_id = public.get_user_partner_id(auth.uid())
    or public.is_partner_manager_for_partner(auth.uid(), _partner_id)
  );
$$;

-- PARTNERS
alter table public.partners enable row level security;

drop policy if exists partners_select on public.partners;
drop policy if exists partners_insert on public.partners;
drop policy if exists partners_update on public.partners;
drop policy if exists partners_delete on public.partners;

create policy partners_select
on public.partners
for select
to authenticated
using (
  public.is_hq_user(auth.uid())
  or id = public.get_user_partner_id(auth.uid())
  or public.is_partner_manager_for_partner(auth.uid(), id)
);

create policy partners_insert
on public.partners
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'hq_admin')
  or public.has_role(auth.uid(), 'partner_manager')
);

create policy partners_update
on public.partners
for update
to authenticated
using (
  public.has_role(auth.uid(), 'hq_admin')
  or public.is_partner_manager_for_partner(auth.uid(), id)
)
with check (
  public.has_role(auth.uid(), 'hq_admin')
  or public.is_partner_manager_for_partner(auth.uid(), id)
);

create policy partners_delete
on public.partners
for delete
to authenticated
using (public.has_role(auth.uid(), 'hq_admin'));

-- CLIENTS
alter table public.clients enable row level security;
drop policy if exists "Allow all access to clients" on public.clients;

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
  or partner_id is null
);

create policy clients_insert
on public.clients
for insert
to authenticated
with check (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
);

create policy clients_update
on public.clients
for update
to authenticated
using (
  public.is_hq_user(auth.uid())
  or (
    partner_id is not null
    and public.can_manage_partner(partner_id::uuid)
  )
)
with check (
  public.is_hq_user(auth.uid())
  or (
    partner_id is not null
    and public.can_manage_partner(partner_id::uuid)
  )
);

create policy clients_delete
on public.clients
for delete
to authenticated
using (public.has_role(auth.uid(), 'hq_admin'));

-- LICENSES
alter table public.licenses enable row level security;
drop policy if exists "Allow all access to licenses" on public.licenses;

create policy licenses_select
on public.licenses
for select
to authenticated
using (
  public.is_hq_user(auth.uid())
  or exists (
    select 1
    from public.clients c
    where c.id = licenses.client_id
      and c.partner_id is not null
      and public.can_view_partner(c.partner_id::uuid)
  )
);

create policy licenses_insert
on public.licenses
for insert
to authenticated
with check (
  public.is_hq_user(auth.uid())
  and exists (
    select 1
    from public.clients c
    where c.id = licenses.client_id
      and (
        c.partner_id is null
        or public.can_manage_partner(c.partner_id::uuid)
        or public.has_role(auth.uid(), 'partner_manager')
      )
  )
);

create policy licenses_update
on public.licenses
for update
to authenticated
using (
  public.is_hq_user(auth.uid())
  and exists (
    select 1
    from public.clients c
    where c.id = licenses.client_id
      and (
        c.partner_id is null
        or public.can_manage_partner(c.partner_id::uuid)
        or public.has_role(auth.uid(), 'partner_manager')
      )
  )
)
with check (
  public.is_hq_user(auth.uid())
  and exists (
    select 1
    from public.clients c
    where c.id = licenses.client_id
      and (
        c.partner_id is null
        or public.can_manage_partner(c.partner_id::uuid)
        or public.has_role(auth.uid(), 'partner_manager')
      )
  )
);

create policy licenses_delete
on public.licenses
for delete
to authenticated
using (public.has_role(auth.uid(), 'hq_admin'));

-- CONTRACTS
alter table public.contracts enable row level security;
drop policy if exists "Allow all access to contracts" on public.contracts;

create policy contracts_select
on public.contracts
for select
to authenticated
using (
  public.is_hq_user(auth.uid())
  or exists (
    select 1
    from public.clients c
    where c.id = contracts.client_id
      and c.partner_id is not null
      and public.can_view_partner(c.partner_id::uuid)
  )
);

create policy contracts_insert
on public.contracts
for insert
to authenticated
with check (
  public.is_hq_user(auth.uid())
  and exists (
    select 1
    from public.clients c
    where c.id = contracts.client_id
      and (
        c.partner_id is null
        or public.can_manage_partner(c.partner_id::uuid)
        or public.has_role(auth.uid(), 'partner_manager')
      )
  )
);

create policy contracts_update
on public.contracts
for update
to authenticated
using (
  public.is_hq_user(auth.uid())
  and exists (
    select 1
    from public.clients c
    where c.id = contracts.client_id
      and (
        c.partner_id is null
        or public.can_manage_partner(c.partner_id::uuid)
        or public.has_role(auth.uid(), 'partner_manager')
      )
  )
)
with check (
  public.is_hq_user(auth.uid())
  and exists (
    select 1
    from public.clients c
    where c.id = contracts.client_id
      and (
        c.partner_id is null
        or public.can_manage_partner(c.partner_id::uuid)
        or public.has_role(auth.uid(), 'partner_manager')
      )
  )
);

create policy contracts_delete
on public.contracts
for delete
to authenticated
using (public.has_role(auth.uid(), 'hq_admin'));

-- RENEWALS
alter table public.renewals enable row level security;
drop policy if exists "Allow all access to renewals" on public.renewals;

create policy renewals_select
on public.renewals
for select
to authenticated
using (
  public.is_hq_user(auth.uid())
  or (
    partner_id is not null
    and public.can_view_partner(partner_id::uuid)
  )
);

create policy renewals_insert
on public.renewals
for insert
to authenticated
with check (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
);

create policy renewals_update
on public.renewals
for update
to authenticated
using (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
)
with check (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
);

create policy renewals_delete
on public.renewals
for delete
to authenticated
using (public.has_role(auth.uid(), 'hq_admin'));

-- DEALS
alter table public.deals enable row level security;
drop policy if exists "Allow all access to deals" on public.deals;

create policy deals_select
on public.deals
for select
to authenticated
using (
  public.is_hq_user(auth.uid())
  or (
    partner_id is not null
    and public.can_view_partner(partner_id::uuid)
  )
);

create policy deals_insert
on public.deals
for insert
to authenticated
with check (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
);

create policy deals_update
on public.deals
for update
to authenticated
using (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
)
with check (
  public.is_hq_user(auth.uid())
  and (
    partner_id is null
    or public.can_manage_partner(partner_id::uuid)
    or public.has_role(auth.uid(), 'partner_manager')
  )
);

create policy deals_delete
on public.deals
for delete
to authenticated
using (public.has_role(auth.uid(), 'hq_admin'));