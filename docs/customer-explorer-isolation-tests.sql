-- Only run inside BEGIN/ROLLBACK against TEST after the permissions migration.
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role) limit 1;
set local role authenticated;
do $$ begin
 if not private.explorer_access(true) then raise exception 'HQ permission missing';end if;
 if public.customer_explorer_settings()->>'mode'<>'hq' then raise exception 'Wrong default mode';end if;
end $$;
reset role;
-- An explicit per-user denial must override even HQ-admin role defaults.
insert into public.user_module_permissions(user_id,module_key,access_level,is_override)
values(auth.uid(),'customer_explorer','no_access',true)
on conflict(user_id,module_key) do update set access_level='no_access',is_override=true;
set local role authenticated;
do $$ begin
 if private.explorer_access(false) or private.explorer_access(true) or exists(select 1 from public.customer_explorer_directory) then
  raise exception 'User Management denial ignored';end if;
end $$;
reset role;
delete from public.user_module_permissions where user_id=auth.uid() and module_key='customer_explorer';

-- Force a projection failure, then perform an unchanged core-client update.
-- Existing client values do not change and the outer transaction rolls back.
alter table public.customer_explorer_directory add constraint explorer_test_failure check(false) not valid;
update public.clients set short_name=short_name where id=(select id from public.clients limit 1);
do $$ begin
 if not exists(select 1 from private.customer_explorer_rollout where singleton and mode='off' and sync_failed_at is not null and sync_error_code='23514') then
  raise exception 'Projection failure did not isolate and disable Explorer';end if;
end $$;
set local role authenticated;
do $$ begin
 if private.explorer_access(false) or exists(select 1 from public.customer_explorer_directory) then raise exception 'Failed projection remained readable';end if;
 if public.customer_explorer_settings()->>'mode'<>'off' then raise exception 'Recovery settings unavailable';end if;
end $$;
reset role;
alter table public.customer_explorer_directory drop constraint explorer_test_failure;
set local role authenticated;
select public.customer_explorer_configure('hq');
do $$ begin if not private.explorer_access(true) then raise exception 'HQ recovery failed';end if;end $$;
reset role;
-- Pilot/all eligibility never overrides a module denial or allows partner management.
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p join public.partners t on t.id=p.partner_id where p.is_active and not p.is_hq and t.is_active and coalesce(p.invitation_status,'accepted')<>'pending' limit 1;
update private.customer_explorer_rollout set mode='all' where singleton;
set local role authenticated;
do $$ begin
 if not private.explorer_access(false) then raise exception 'Partner view template missing';end if;
 if private.explorer_access(true) then raise exception 'Partner management exposed';end if;
 begin perform public.customer_explorer_configure('all');raise exception 'Partner changed settings';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.user_module_permissions(user_id,module_key,access_level,is_override)
values(auth.uid(),'customer_explorer','no_access',true)
on conflict(user_id,module_key) do update set access_level='no_access',is_override=true;
set local role authenticated;
do $$ begin
 if private.explorer_access(false) or exists(select 1 from public.customer_explorer_directory) then raise exception 'Partner module denial ignored';end if;
end $$;
reset role;
