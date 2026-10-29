-- LOCAL SYNTHETIC DATABASE ONLY. Never execute this fixture in TEST or PROD.
\set ON_ERROR_STOP on
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create function public.is_hq_user(uuid) returns boolean language sql stable as $$ select $1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
create function public.can_manage_proposal_source(text,uuid,uuid,uuid,uuid) returns boolean language sql stable as $$
 select auth.uid() in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
 and $1='client' and $4='11111111-1111-4111-8111-111111111111'::uuid $$;
create table public.clients(id uuid primary key,partner_uuid uuid);
create table public.licenses(id uuid primary key,client_id uuid,backoffice_users int,web_accesses int,updated_at timestamptz);
create table public.contracts(id uuid primary key,client_id uuid,contract_end_date date,updated_at timestamptz);
create table public.licensed_modules(id uuid primary key,license_id uuid,enabled boolean);
create table public.proposals(id uuid primary key default gen_random_uuid(),source_type text,client_id uuid,contract_id uuid,license_id uuid,partner_uuid uuid,client_name text,product_family text,license_model text,proposal_mode text,plan int,hosting text,deployment text,project_name text,proposal_date date,language text,payment_terms text,notes text,total_year_1 numeric,total_recurring numeric,business_config jsonb,version int,status text,created_by uuid,updated_at timestamptz default now());
create table public.proposal_items(id uuid primary key default gen_random_uuid(),proposal_id uuid references proposals(id),category text,item_code text,item_name text,description text,qty numeric,unit_price numeric,frequency text,total numeric,gross_total numeric,net_total numeric,discount_type text,discount_value numeric,discount_amount numeric,is_override boolean,is_recurring boolean,sort_order int);
alter table proposals enable row level security;
alter table proposal_items enable row level security;
create policy proposals_access on proposals to authenticated using(can_manage_proposal_source(source_type,null,null,client_id,partner_uuid)) with check(can_manage_proposal_source(source_type,null,null,client_id,partner_uuid));
create policy items_access on proposal_items to authenticated using(exists(select 1 from proposals where id=proposal_id)) with check(exists(select 1 from proposals where id=proposal_id));
grant select on clients,licenses,contracts,licensed_modules to authenticated;
-- Row locks require the existing Supabase UPDATE table grant (RLS still applies).
grant update on licenses,contracts to authenticated;
grant select,insert,update,delete on proposals,proposal_items to authenticated;
insert into clients values('11111111-1111-4111-8111-111111111111',null);
insert into licenses values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',10,11,'2026-10-29T00:00:00Z');
insert into contracts values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','2028-04-14','2026-10-29T00:00:00Z');
\ir ../../supabase/migrations_review/commercial_addition_drafts.sql
create function pg_temp.payload() returns jsonb language sql as $$ select '{
 "client_id":"11111111-1111-4111-8111-111111111111","license_id":"22222222-2222-4222-8222-222222222222","contract_id":"33333333-3333-4333-8333-333333333333","partner_uuid":null,"client_name":"Synthetic QA","product_family":"Business","license_model":"useit","proposal_mode":"useit_only","hosting":"SaaS","deployment":"saas","proposal_date":"2026-10-29","language":"EN","payment_terms":"QA only","total_year_1":708,"total_recurring":472,
 "business_config":{"commercial_addition":{"schema":"commercial_addition_v1","action":"add_users",
 "baseline":{"clientId":"11111111-1111-4111-8111-111111111111","licenseId":"22222222-2222-4222-8222-222222222222","contractId":"33333333-3333-4333-8333-333333333333","renewalDate":"2028-04-14","backoffice":10,"web":11,"licenseUpdatedAt":"2026-10-29T00:00:00Z","contractUpdatedAt":"2026-10-29T00:00:00Z","componentIds":[]},
 "selection":{"offerBasis":"customer","pricingBasis":"direct","monthPolicy":"started","priceReview":"QA only","implementationReview":"not_needed","effectiveDate":"2026-10-29","renewalDate":"2028-04-14"},
 "quote":{"blockers":[],"months":18,"dueNow":708,"annualIncrease":472,"lines":[{"code":"BO","label":"BackOffice","quantity":1,"annual":352,"oneTime":0,"dueNow":528},{"code":"HOST","label":"Hosting","quantity":1,"annual":120,"oneTime":0,"dueNow":180}]}}}}
 '::jsonb $$;
create function pg_temp.expect_failure(payload jsonb, pattern text, target uuid default null, stamp timestamptz default null) returns void language plpgsql as $$
begin
 begin perform save_commercial_addition_draft(target,stamp,payload);
 exception when others then if sqlerrm not like '%'||pattern||'%' then raise; end if; return; end;
 raise exception 'Expected failure: %',pattern;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$ declare result uuid; stamp timestamptz; n int; begin
 result:=save_commercial_addition_draft(null,null,pg_temp.payload());
 assert (select count(*) from proposals)=1,'one draft';
 assert (select sum(total) from proposal_items where proposal_id=result)=708,'items agree';
 assert (select total_recurring from proposals where id=result)=472,'annual delta separate';
 select updated_at into stamp from proposals where id=result;
 perform save_commercial_addition_draft(result,stamp,pg_temp.payload());
 assert (select count(*) from proposal_items where proposal_id=result)=2,'edit replaces own items only';
 perform pg_temp.expect_failure(pg_temp.payload(),'CONFLICT',result,'2000-01-01');
 perform pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{total_year_1}','709'),'totals do not agree');
 perform pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{business_config,commercial_addition,baseline,backoffice}','9'),'CONFLICT');
 perform pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{business_config,commercial_addition,baseline,componentIds}','["44444444-4444-4444-8444-444444444444"]'),'CONFLICT');
 perform pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{business_config,commercial_addition,quote,lines,0,dueNow}','529'),'Invalid addition amounts');
 perform pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{business_config,commercial_addition,quote,lines,0,quantity}','0'),'Invalid addition amounts');
 perform pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{business_config,commercial_addition,quote,blockers}','["unreviewed"]'),'VALIDATION_FAILED');
 update proposals set status='Ready' where id=result;
 select updated_at into stamp from proposals where id=result;
 perform pg_temp.expect_failure(pg_temp.payload(),'Only Draft',result,stamp);
 assert (select count(*) from proposals)=1,'failed saves leave no extra drafts';
 assert (select count(*) from proposal_items)=2,'failed saves preserve original lines';
 assert (select backoffice_users from licenses limit 1)=10,'license unchanged';
 assert (select contract_end_date from contracts limit 1)='2028-04-14'::date,'contract unchanged';
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select pg_temp.expect_failure(jsonb_set(pg_temp.payload(),'{business_config,commercial_addition,selection,offerBasis}','"partner"'),'NOT_AUTHORIZED');
select save_commercial_addition_draft(null,null,pg_temp.payload());
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
select pg_temp.expect_failure(pg_temp.payload(),'NOT_AUTHORIZED');
do $$ begin assert (select count(*) from proposals)=0,'RLS blocks another user'; end $$;
reset role;
do $$ begin assert not has_function_privilege('anon','public.save_commercial_addition_draft(uuid,timestamptz,jsonb)','execute'),'anonymous blocked'; end $$;
select 'PASS: atomic draft and line save; optimistic conflict; stale source and component guard; amount integrity; Ready freeze; HQ-only shares; partner source access; RLS isolation; anonymous denied; license and renewal unchanged' as result;
