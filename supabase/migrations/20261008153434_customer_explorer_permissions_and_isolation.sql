-- Explorer has its own module permission; never inherits Knowledge Base access.
-- Templates remain subordinate to the independent HQ/pilot/all rollout gate.
insert into public.role_permission_templates(role,module_key,access_level)
select role,'customer_explorer',case when role::text='hq_admin' then 'admin' else 'view' end
from (select distinct role from public.role_permission_templates) r
on conflict(role,module_key) do nothing;

alter table private.customer_explorer_rollout
 add column sync_failed_at timestamptz,
 add column sync_error_code text;

create or replace function private.explorer_access(manage boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p cross join private.customer_explorer_rollout s
 where p.id=(select auth.uid()) and s.singleton and s.mode<>'off' and s.sync_failed_at is null
 and p.is_active and coalesce(p.invitation_status,'accepted')<>'pending'
 and coalesce(public.can_view_module(p.id,'customer_explorer'),false)
 and case when manage then p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role)
   and coalesce(public.can_edit_module(p.id,'customer_explorer'),false)
 else (p.is_hq and public.is_hq_user(p.id)) or
  (not p.is_hq and (s.mode='all' or (s.mode='pilot' and p.id=any(s.pilot_user_ids)))
   and exists(select 1 from public.partners t where t.id=p.partner_id and t.is_active)) end);
$$;

-- Settings access survives the Explorer kill switch, so HQ can recover safely.
create function private.explorer_settings_access()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid())
 and p.is_active and p.is_hq and coalesce(p.invitation_status,'accepted')<>'pending'
 and public.has_role(p.id,'hq_admin'::public.app_role)
 and coalesce(public.can_admin_module(p.id,'settings'),false)
 and coalesce(public.can_admin_module(p.id,'customer_explorer'),false));
$$;

-- Only core-source sync errors are isolated. HQ writes still fail atomically if
-- projection building fails: the UI must not falsely report a successful save.
create or replace function private.sync_customer_explorer_directory()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema='public' and tg_table_name in ('clients','partners') then
  if exists(select 1 from private.customer_explorer_rollout where singleton and mode='off') then return null;end if;
  begin
   if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh')) then
    raise exception 'Explorer refresh busy' using errcode='55P03';
   end if;
   perform private.refresh_customer_explorer();
  exception when others then
   -- Retain only SQLSTATE, never client details or internal error messages.
   update private.customer_explorer_rollout set mode='off',sync_failed_at=now(),
    sync_error_code=sqlstate,changed_at=now() where singleton;
  end;
 else
  perform private.refresh_customer_explorer();
 end if;
 return null;
end; $$;

create function private.explorer_get_settings()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.explorer_settings_access() then raise exception 'HQ settings administrator required' using errcode='42501';end if;
 return (select jsonb_build_object('mode',mode,'pilot_user_ids',pilot_user_ids,
 'changed_at',changed_at,'sync_failed_at',sync_failed_at,'sync_error_code',sync_error_code)
 from private.customer_explorer_rollout where singleton);
end; $$;
create function private.explorer_set_settings(new_mode text,pilot_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.explorer_settings_access() then raise exception 'HQ settings administrator required' using errcode='42501';end if;
 if new_mode not in ('off','hq','pilot','all') or new_mode is null then raise exception 'Invalid rollout mode';end if;
 if new_mode='pilot' and (coalesce(cardinality(pilot_ids),0)=0 or exists(
  select 1 from unnest(pilot_ids) x(id) where not exists(select 1 from public.profiles p
  join public.partners t on t.id=p.partner_id where p.id=x.id and p.is_active and not p.is_hq
  and t.is_active and coalesce(p.invitation_status,'accepted')<>'pending'))) then
  raise exception 'Choose active partner user IDs for the pilot';end if;
 if new_mode<>'off' then perform private.refresh_customer_explorer();end if;
 insert into public.customer_explorer_audit(source_table,record_id,action,actor,before_data,after_data)
 select 'customer_explorer_rollout','singleton','UPDATE',auth.uid(),
  jsonb_build_object('mode',mode,'pilot_user_ids',pilot_user_ids),
  jsonb_build_object('mode',new_mode,'pilot_user_ids',case when new_mode='pilot' then coalesce(pilot_ids,'{}') else '{}'::uuid[] end)
 from private.customer_explorer_rollout where singleton;
 update private.customer_explorer_rollout set mode=new_mode,
  pilot_user_ids=case when new_mode='pilot' then pilot_ids else '{}'::uuid[] end,
  sync_failed_at=case when new_mode='off' then sync_failed_at else null end,
  sync_error_code=case when new_mode='off' then sync_error_code else null end,
  changed_at=now() where singleton;
 return private.explorer_get_settings();
end; $$;

create function public.customer_explorer_settings()
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.explorer_get_settings();
$$;
create function public.customer_explorer_configure(new_mode text,pilot_ids uuid[] default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.explorer_set_settings(new_mode,pilot_ids);
$$;
revoke all on function private.explorer_settings_access(),private.explorer_get_settings(),private.explorer_set_settings(text,uuid[]),
 public.customer_explorer_settings(),public.customer_explorer_configure(text,uuid[]) from public,anon,authenticated;
grant execute on function private.explorer_get_settings(),private.explorer_set_settings(text,uuid[]),
 public.customer_explorer_settings(),public.customer_explorer_configure(text,uuid[]) to authenticated;
-- Private RPC implementation functions check auth.uid() themselves on every call.
