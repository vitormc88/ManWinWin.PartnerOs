-- Run after management.sql INSIDE THE SAME BEGIN/ROLLBACK TRANSACTION.
-- Requires one existing active HQ administrator and one active partner profile.
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role) limit 1;
set local role authenticated;
insert into public.customer_explorer_hq(client_id,name,country,sector,evidence_status,evidence_note)
values('987654321','Explorer validation fixture','PT','Manufacturing','validated','TEST ONLY: transaction rollback');
do $$ begin
 if not exists(select 1 from public.customer_explorer_directory where client_id='987654321' and active is null and validated_by=auth.uid() and contact_email='customercare@manwinwin.com') then raise exception 'HQ create/projection/stamp failed'; end if;
 if not exists(select 1 from public.customer_explorer_audit where after_data->>'client_id'='987654321' and actor=auth.uid()) then raise exception 'HQ audit failed'; end if;
 begin
   insert into public.customer_explorer_hq(client_id,name,country) select client_id,'Duplicate fixture','PT' from public.customer_explorer_directory where source_kind='partner' limit 1;
   raise exception 'Duplicate was accepted';
 exception when unique_violation then null;end;
end $$;
insert into public.customer_explorer_overrides(client_id,sector,evidence_status,evidence_note)
select source_id,'Manufacturing','validated','Validation fixture' from public.customer_explorer_directory where source_kind='partner' limit 1;
update public.customer_explorer_hq set visible=false where client_id='987654321';
reset role;
-- Existing source trigger re-projection must preserve the validated override.
select private.refresh_customer_explorer();
do $$ begin
 if not exists(select 1 from public.customer_explorer_directory d join public.customer_explorer_overrides o on o.client_id=d.id where d.sector=o.sector and d.evidence_status='validated') then raise exception 'Override lost on refresh';end if;
 if has_table_privilege('anon','public.customer_explorer_directory','SELECT') then raise exception 'Anonymous access';end if;
 if has_function_privilege('authenticated','private.refresh_customer_explorer()','EXECUTE') then raise exception 'Privileged RPC exposed';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p join public.partners t on t.id=p.partner_id where p.is_active and not p.is_hq and t.is_active and coalesce(p.invitation_status,'accepted')<>'pending' limit 1;
set local role authenticated;
-- HQ-only default must deny partners even with a direct table/API request.
do $$ begin
 if private.explorer_access(false) or exists(select 1 from public.customer_explorer_directory) then raise exception 'HQ-only rollout exposed directory to partner';end if;
 if (public.customer_explorer_access()->>'read')::boolean then raise exception 'Partner capability exposed during HQ rollout';end if;
 begin
  update private.customer_explorer_rollout set mode='all';
  raise exception 'Partner changed rollout settings';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Select this partner account for the controlled pilot, without granting write rights.
update private.customer_explorer_rollout set mode='pilot',pilot_user_ids=array[auth.uid()],changed_at=now();
set local role authenticated;
do $$ declare changed integer;begin
 if not exists(select 1 from public.customer_explorer_directory where source_kind='partner') then raise exception 'Partner read denied';end if;
 if exists(select 1 from public.customer_explorer_directory where client_id='987654321') then raise exception 'Hidden HQ record exposed';end if;
 if exists(select 1 from public.customer_explorer_hq) or exists(select 1 from public.customer_explorer_audit) then raise exception 'HQ internals exposed';end if;
 begin
   insert into public.customer_explorer_hq(client_id,name,country) values('987654322','Unauthorized','PT');
   raise exception 'Partner write accepted';
 exception when insufficient_privilege then null;end;
 update public.customer_explorer_overrides set sector='Unauthorized';get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Partner override write accepted';end if;
end $$;
reset role;
-- An empty pilot list revokes the previously selected partner immediately.
update private.customer_explorer_rollout set pilot_user_ids='{}',changed_at=now();
set local role authenticated;
do $$ begin
 if exists(select 1 from public.customer_explorer_directory) then raise exception 'Removed pilot retained database access';end if;
end $$;
reset role;
update private.customer_explorer_rollout set mode='all',changed_at=now();
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.customer_explorer_directory) then raise exception 'All-partner rollout denied active partner';end if;
end $$;
reset role;
-- Independent feature kill switch, not a frontend-only menu change.
update private.customer_explorer_rollout set mode='off',changed_at=now();
set local role authenticated;
do $$ begin
 if exists(select 1 from public.customer_explorer_directory) or private.explorer_access(true) then raise exception 'Kill switch failed';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role) limit 1;
set local role authenticated;
do $$ begin
 if private.explorer_access(false) or private.explorer_access(true) or exists(select 1 from public.customer_explorer_directory) then raise exception 'Kill switch left HQ access enabled';end if;
 begin
  insert into public.customer_explorer_hq(client_id,name,country) values('987654323','Disabled fixture','PT');
  raise exception 'HQ write accepted while disabled';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
update private.customer_explorer_rollout set mode='all',changed_at=now();
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin if exists(select 1 from public.customer_explorer_directory) then raise exception 'Unknown user read accepted';end if;end $$;
reset role;
-- Calling script must ROLLBACK and confirm all created tables are absent.
