-- TEST only, transaction always rolls back. No rollout/permissions changes.
begin;
do $$ begin
 if (select functions_base_url from private.notification_settings limit 1) is distinct from 'https://avxxzmoayxzrykwqzoqn.supabase.co/functions/v1' then raise exception 'TEST only';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and p.is_hq and p.full_name ilike '%Carvalho%' and public.has_role(p.id,'hq_admin'::public.app_role);
set local role authenticated;
do $$ declare k text; n integer; begin
 select client_key into k from public.customer_explorer_directory where visible limit 1;
 if k is null then raise exception 'HQ read failed';end if;
 insert into public.customer_explorer_media(client_key,website_url,website_source,website_reviewed_at)
 values(k,'https://www.example.com/','https://www.example.com/company',current_date)
 on conflict(client_key) do update set website_url=excluded.website_url,website_source=excluded.website_source,website_reviewed_at=excluded.website_reviewed_at;
 if not exists(select 1 from public.customer_explorer_media where client_key=k and website_url='https://www.example.com/') then raise exception 'HQ save failed';end if;
 begin update public.customer_explorer_media set website_url='javascript:alert(1)' where client_key=k;raise exception 'Unsafe URL accepted';exception when check_violation then null;end;
 begin update public.customer_explorer_media set website_url='https://user:secret@example.com/' where client_key=k;raise exception 'Credentials accepted';exception when check_violation then null;end;
 begin update public.customer_explorer_media set website_reviewed_at=current_date+1 where client_key=k;raise exception 'Future review accepted';exception when check_violation then null;end;
 begin update public.customer_explorer_media set website_source=null where client_key=k;raise exception 'Missing evidence accepted';exception when check_violation then null;end;
 update public.customer_explorer_media set website_url=null,website_source=null,website_reviewed_at=null where client_key=k;
 if not exists(select 1 from public.customer_explorer_media where client_key=k and website_url is null) then raise exception 'HQ unlink failed';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and not p.is_hq and p.full_name='Francisco Santos';
set local role authenticated;
do $$ declare n integer; begin
 update public.customer_explorer_media set website_url=null,website_source=null,website_reviewed_at=null;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Partner write unexpectedly allowed';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.customer_explorer_media limit 1;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: HQ save/unlink; unsafe URLs, missing evidence and future dates rejected; partner writes and anonymous reads denied; rolled back' as result;
