-- Inside BEGIN/ROLLBACK in TEST, after the media migration.
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role) limit 1;
set local role authenticated;
insert into public.customer_explorer_media(client_key,case_study)
values('987654320',jsonb_build_object('title','TEST fixture','url','https://www.manwinwin.com/cmms-case-studies/',
'language','EN','scope','TEST ONLY','problem','TEST','approach','TEST','evidence','TEST',
'limitation','Fictitious customer','reviewed_at','2026-10-08','private_extra','must not be published'));
do $$ declare rejected boolean=false;begin
 if not exists(select 1 from public.customer_explorer_media where client_key='987654320' and updated_by=auth.uid() and not(case_study?'private_extra')) then raise exception 'Media stamp/schema failed';end if;
 begin update public.customer_explorer_media set case_study=jsonb_set(case_study,'{url}','"https://untrusted.example/"') where client_key='987654320';
 exception when raise_exception then rejected=true;end;
 if not rejected then raise exception 'Nonofficial case URL accepted';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from storage.buckets where id='customer-explorer-logos' and public) then raise exception 'Logo bucket public';end if;
 if has_table_privilege('anon','public.customer_explorer_media','SELECT') then raise exception 'Anonymous media read';end if;
 if not exists(select 1 from public.customer_explorer_audit where source_table='customer_explorer_media' and record_id='987654320') then raise exception 'Media audit missing';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p join public.partners t on t.id=p.partner_id where p.is_active and not p.is_hq and t.is_active and coalesce(p.invitation_status,'accepted')<>'pending' limit 1;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.customer_explorer_media) then raise exception 'Media exposed during HQ rollout';end if;
 begin insert into public.customer_explorer_media(client_key) values('987654319');raise exception 'Partner media write accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
