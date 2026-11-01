-- LOCAL SYNTHETIC DATABASE ONLY. Run after the lifecycle fixture, in the same psql session.
reset role;
create table if not exists public.partners(id uuid primary key,partnership_level text);
\ir ../../supabase/migrations/20261101202457_commercial_addition_simple_editor.sql
create function pg_temp.combined_payload() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare data jsonb:=pg_temp.detailed_payload();d jsonb;c jsonb;s jsonb;begin
 d:=data#>'{business_config,commercial_addition}';s:=d->'selection';c:=s->'commercial';
 c:=jsonb_set(c,'{adjustments}',(c->'adjustments')||'{"SERVICE_training":{"unitPrice":null,"initialDiscountPct":25,"renewalDiscountPct":0,"reason":"Approved services discount"}}');
 s:=s||jsonb_build_object('editorVersion',3,'commercial',c,'professionalPrices','{}'::jsonb,'services','[{"id":"training","label":"Onsite training","modality":"onsite","quantity":2,"unit":"day","unitPrice":695,"ruleCode":null,"reference":"Approved service tariff","expense":false},{"id":"travel","label":"Travel","modality":"onsite","quantity":1,"unit":"fixed","unitPrice":250,"ruleCode":null,"reference":"Approved travel","expense":true}]'::jsonb);
 d:=jsonb_set(d,'{selection}',s);
 d:=jsonb_set(d,'{quote,lines}',(d#>'{quote,lines}')||'[{"code":"SERVICE_training","label":"Onsite training","kind":"service","quantity":2,"annual":0,"oneTime":1042.5,"dueNow":1042.5,"referenceAnnual":0,"referenceOneTime":1390,"referenceUnitPrice":695,"unitPrice":695,"initialAnnual":0,"initialDiscountPct":25,"renewalDiscountPct":0},{"code":"SERVICE_travel","label":"Travel","kind":"expense","quantity":1,"annual":0,"oneTime":250,"dueNow":250,"referenceAnnual":0,"referenceOneTime":250,"referenceUnitPrice":250,"unitPrice":250,"initialAnnual":0,"initialDiscountPct":0,"renewalDiscountPct":0}]'::jsonb);
 d:=jsonb_set(d,'{quote,dueNow}','1454.5');
 return data||jsonb_build_object('total_year_1',1454.5,'payment_terms',private.addition_payment_text(c),'business_config',jsonb_build_object('commercial_addition',d));
end $$;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$ declare data jsonb; p uuid; before_arr numeric;before_web int; begin
 data:=pg_temp.combined_payload();
 select total_value into before_arr from contracts limit 1;
 select web_accesses into before_web from licenses limit 1;
 p:=save_commercial_addition_draft(null,null,data);
 assert (select total_value from contracts limit 1)=before_arr,'Draft does not change ARR';
 assert (select web_accesses from licenses limit 1)=before_web,'Draft does not change license';
 perform commercial_addition_action(p,'validate');
 perform commercial_addition_action(p,'sent',jsonb_build_object('date',current_date));
 assert (select total_value from contracts limit 1)=before_arr,'Sent does not change ARR';
 perform commercial_addition_action(p,'accept',jsonb_build_object('date',current_date,'evidence_type','purchase_order','reference','SYNTHETIC-COMBINED'));
 assert (select total_value from contracts limit 1)=before_arr+720,'Only software recurring value enters ARR';
 assert (select sum(amount) from contract_lines where source='commercial_addition_award' and source_item_id in(select id from proposal_items where proposal_id=p) and line_type='implementation')=1042.5,'Discounted service is recorded once';
 assert (select sum(amount) from contract_lines where source='commercial_addition_award' and source_item_id in(select id from proposal_items where proposal_id=p) and line_type='other')=250,'Expenses recorded once';
 assert (select web_accesses from licenses limit 1)=before_web,'Award waits for activation';
 perform commercial_addition_action(p,'activate','{"activation_authorized":true,"reference":"Approved QA credit"}');
 assert (select web_accesses from licenses limit 1)=before_web+3,'Activation adds only awarded accesses';
 perform commercial_addition_action(p,'activate','{"activation_authorized":true,"reference":"Approved QA credit"}');
 assert (select total_value from contracts limit 1)=before_arr+720,'Repeated activation does not duplicate ARR';
 assert (select web_accesses from licenses limit 1)=before_web+3,'Repeated activation does not duplicate accesses';
end $$;
rollback;

reset role;
begin;
do $$ declare data jsonb;d jsonb;s jsonb;q jsonb; begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 data:=pg_temp.combined_payload();d:=data#>'{business_config,commercial_addition}';
 -- Tampered service totals and expense discounts are independently rejected.
 begin perform private.check_addition_detailed_terms(jsonb_set(d,'{quote,lines,1,dueNow}','1'),true);raise exception 'QA expected rejection';exception when others then if sqlerrm like '%QA expected%' then raise;end if;end;
 begin perform private.check_addition_detailed_terms(jsonb_set(d,'{selection,commercial,adjustments,SERVICE_travel}','{"unitPrice":null,"initialDiscountPct":25,"renewalDiscountPct":0,"reason":"Forbidden expense discount"}'),true);raise exception 'QA expected rejection';exception when others then if sqlerrm like '%QA expected%' then raise;end if;end;
 -- No catalogue price is invented for Professional; supplied annual price is exact.
 d:=jsonb_set(d,'{baseline,family}','"Professional"');d:=jsonb_set(d,'{baseline,plan}','1');
 s:=(d->'selection')||'{"web":0,"backoffice":0,"products":["stock","api"],"professionalPrices":{"stock":{"annual":400,"reference":"Approved Professional tariff"},"api":{"annual":600,"reference":"Approved Professional tariff"}},"services":[]}'::jsonb;
 d:=jsonb_set(d,'{selection}',s);
 q:=private.addition_raw_lines(d);assert jsonb_array_length(q)=2;assert (select sum((x->>'annual')::numeric) from jsonb_array_elements(q) x)=1000;
 begin perform private.addition_raw_lines(jsonb_set(d,'{selection,professionalPrices}','{}'));raise exception 'QA expected missing tariff';exception when others then if sqlerrm like '%QA expected%' then raise;end if;end;
 d:=jsonb_set(d,'{selection,commercial,payment,activation}','"full_payment"');
 perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 begin perform private.check_addition_detailed_terms(d,true);raise exception 'QA expected HQ approval';exception when others then if sqlerrm not like '%HQ must approve%' then raise;end if;end;
end $$;
rollback;
\echo 'PASS: combined proposal, service discount, award-only ARR, idempotent activation and Professional price validation'
