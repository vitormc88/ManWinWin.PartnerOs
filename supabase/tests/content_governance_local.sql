\set ON_ERROR_STOP on
-- Disposable LOCAL fixture only, not a production setup script.
create schema auth;
create schema private;
do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;
create type public.app_role as enum ('hq_admin','partner_manager');
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.test_uid',true),'')::uuid$$;
create function public.is_hq_user(uuid) returns boolean language sql as $$select $1='00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.has_role(uuid,public.app_role) returns boolean language sql as $$select public.is_hq_user($1) and $2='hq_admin'$$;
create function public.has_module_access(text,text) returns boolean language sql as $$select coalesce(current_setting('request.test_edit',true),'yes')='yes'$$;
create table public.documents(id integer primary key,title text,file_url text,file_name text,version_number integer);
create table public.clients(id integer primary key,sector text);
create table public.customer_explorer_hq(id integer primary key,sector text);
create table public.customer_explorer_overrides(id integer primary key,sector text);
insert into public.documents values(1,'Old title','bucket/file.pdf','file.pdf',1);
insert into public.clients values(1,'Historical unsupported label');
\ir ../migrations/20261015214702_content_governance.sql
grant usage on schema auth to authenticated;
grant select,insert,update on public.documents,public.clients,public.customer_explorer_hq,public.customer_explorer_overrides to authenticated;
begin;
set local role authenticated;
do $$begin
 if (select content_review from public.documents where id=1)<>'{}'::jsonb then raise exception 'Existing resource auto-reviewed';end if;
end$$;
select set_config('request.test_uid','00000000-0000-0000-0000-000000000002',true);
do $$begin
 begin update public.documents set content_review='{"status":"recommended"}' where id=1;raise exception 'Non-HQ approval succeeded';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.test_uid','00000000-0000-0000-0000-000000000001',true);
do $$begin
 begin update public.documents set content_review='{"status":"recommended"}' where id=1;raise exception 'Incomplete approval succeeded';exception when raise_exception then if sqlerrm<>'Recommended resources require all editorial fields.' then raise;end if;end;
end$$;
update public.documents set content_review='{"status":"recommended","display_title":"Reviewed title","language":"en","product":"MWW","purpose":"User manual","version_label":"Reviewed revision","reviewed_by":"forged","reviewed_at":"2000-01-01"}' where id=1;
do $$begin
 if (select content_review->>'reviewed_by' from public.documents where id=1)<>'00000000-0000-0000-0000-000000000001' then raise exception 'Reviewer forged';end if;
 if (select content_review->>'reviewed_at' from public.documents where id=1) like '2000-%' then raise exception 'Review time forged';end if;
end$$;
select set_config('request.test_edit','no',true);
do $$begin
 begin update public.documents set content_review='{"status":"archived"}' where id=1;raise exception 'Module restriction bypassed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.test_edit','yes',true);
update public.documents set file_url='bucket/replaced.pdf' where id=1;
do $$begin if (select content_review from public.documents where id=1)<>'{}'::jsonb then raise exception 'Stale approval retained';end if;end$$;
update public.documents set content_review='{"status":"archived"}' where id=1;
update public.documents set content_review='{"status":"needs_review"}' where id=1;
-- Unknown historical values survive unrelated edits; new unknown values do not.
update public.clients set sector=sector where id=1;
insert into public.clients values(2,'Food & Beverages');
insert into public.customer_explorer_hq values(1,'Food & Beverage');
insert into public.customer_explorer_overrides values(1,null);
do $$begin
 begin insert into public.clients values(3,'Uncontrolled label');raise exception 'Unknown client sector accepted';exception when invalid_parameter_value then null;end;
 begin insert into public.customer_explorer_hq values(2,'Uncontrolled label');raise exception 'Unknown HQ sector accepted';exception when invalid_parameter_value then null;end;
 begin update public.customer_explorer_overrides set sector='Uncontrolled label';raise exception 'Unknown override accepted';exception when invalid_parameter_value then null;end;
end$$;
rollback;
select 'PASS: default review, HQ/module guards, completeness, server actor/time, source invalidation, archive restoration, catalogue validation and grandfathered sectors' as result;
