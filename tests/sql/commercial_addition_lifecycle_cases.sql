-- Included only by the local synthetic lifecycle fixture.
create function pg_temp.payload() returns jsonb language sql as $$
select jsonb_build_object('client_id',c.client_id,'license_id',l.id,'contract_id',c.id,'partner_uuid',cl.partner_uuid,'client_name','Synthetic QA','product_family','Business','license_model','useit','proposal_mode','useit_only','hosting','SaaS','deployment','saas','proposal_date','2026-10-29','language','EN','payment_terms','100% upfront before activation','total_year_1',118,'total_recurring',472,
'business_config',jsonb_build_object('commercial_addition',jsonb_build_object('schema','commercial_addition_v1','action','add_users',
'baseline',jsonb_build_object('clientId',c.client_id,'licenseId',l.id,'contractId',c.id,'renewalDate',c.contract_end_date,'backoffice',l.backoffice_users,'web',l.web_accesses,'licenseUpdatedAt',l.updated_at,'contractUpdatedAt',c.updated_at,'componentIds','[]'::jsonb,'owned','[]'::jsonb,'recordedAnnual',c.total_value),
'selection',jsonb_build_object('offerBasis','customer','pricingBasis','direct','monthPolicy','agreed','priceReview','Synthetic approved price table','implementationReview','not_needed','effectiveDate','2026-10-29','renewalDate',c.contract_end_date,'baselineAnnualConfirmed',true,'backoffice',1,'web',0,'products','[]'::jsonb),
'quote','{"blockers":[],"months":3,"dueNow":118,"annualIncrease":472,"lines":[{"code":"BO","label":"BackOffice","quantity":1,"kind":"license","annual":352,"oneTime":0,"dueNow":88},{"code":"HOST","label":"Hosting","quantity":1,"kind":"hosting","annual":120,"oneTime":0,"dueNow":30}]}'::jsonb))) from contracts c join licenses l on l.client_id=c.client_id join clients cl on cl.id=c.client_id limit 1 $$;
create function pg_temp.expect_failure(proposal_uuid uuid, op text, details jsonb, pattern text) returns void language plpgsql as $$
begin
 begin perform commercial_addition_action(proposal_uuid,op,details);
 exception when others then if sqlerrm not like '%'||pattern||'%' then raise; end if; return; end;
 raise exception 'Expected failure: %',pattern;
end $$;
create function pg_temp.fail_line_qa() returns trigger language plpgsql as $$ begin
 if current_setting('qa.fail_award',true)='on' and new.source='commercial_addition_award' then raise exception 'SYNTHETIC_LINE_FAILURE'; end if;
 return new; end $$;
create trigger fail_line_qa before insert on contract_lines for each row execute function pg_temp.fail_line_qa();
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$ declare p uuid; rejected uuid; stale uuid; data jsonb; before_lines int; begin
 rejected:=save_commercial_addition_draft(null,null,pg_temp.payload());
 perform pg_temp.expect_failure(rejected,'reject','{}','reason');
 perform commercial_addition_action(rejected,'validate');
 perform commercial_addition_action(rejected,'revise','{"note":"Customer requested a change"}');
 assert (select status from proposals where id=rejected)='Draft','explicit return to draft';
 perform commercial_addition_action(rejected,'reject','{"note":"Customer declined"}');
 assert (select status from proposals where id=rejected)='Lost','rejected state';
 assert (select total_value from contracts limit 1)=1000,'reject/revise preserve ARR';
 assert (select backoffice_users from licenses limit 1)=10,'reject/revise preserve license';
 perform pg_temp.expect_failure(rejected,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA"}','NOT_ELIGIBLE');

 p:=save_commercial_addition_draft(null,null,pg_temp.payload());
 assert (select total_value from contracts limit 1)=1000,'draft does not affect ARR';
 perform commercial_addition_action(p,'validate');
 assert (select status from proposals where id=p)='Ready','annual > prorated upfront validates';
 assert (select total_value from contracts limit 1)=1000,'Ready does not affect ARR';
 assert (select line_type from contract_lines limit 1)='S&AT','legacy normalization waits for award';
 perform pg_temp.expect_failure(p,'activate','{"payment_confirmed":true,"reference":"QA"}','no rows');
 perform commercial_addition_action(p,'sent','{"date":"2026-10-29"}');
 assert (select total_value from contracts limit 1)=1000,'Sent does not affect ARR';
 perform pg_temp.expect_failure(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order"}','EVIDENCE_REQUIRED');
 perform pg_temp.expect_failure(p,'accept','{"date":"2099-01-01","evidence_type":"purchase_order","reference":"QA"}','INVALID_DATE');
 perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
 perform pg_temp.expect_failure(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA"}','NOT_AUTHORIZED');
 assert (select count(*) from commercial_addition_fulfillments)=0,'RLS isolates ledger';
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 -- Stale sources and unknown financial lines are rejected atomically.
 begin
  update licenses set updated_at='2030-01-01';
  perform pg_temp.expect_failure(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA"}','CONFLICT');
  raise exception 'ROLLBACK_CASE';
 exception when others then if sqlerrm<>'ROLLBACK_CASE' then raise; end if; end;
 begin
  update contracts set manual_adjustment_amount=50;
  perform pg_temp.expect_failure(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA"}','manual contract adjustment');
  raise exception 'ROLLBACK_CASE';
 exception when others then if sqlerrm<>'ROLLBACK_CASE' then raise; end if; end;
 begin
  update contract_lines set line_type='Unmapped history';
  perform pg_temp.expect_failure(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA"}','Reconcile');
  assert not exists(select 1 from commercial_addition_fulfillments),'failed award leaves no ledger';
  raise exception 'ROLLBACK_CASE';
 exception when others then if sqlerrm<>'ROLLBACK_CASE' then raise; end if; end;
 perform set_config('qa.fail_award','on',true);
 perform pg_temp.expect_failure(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA"}','SYNTHETIC_LINE_FAILURE');
 assert not exists(select 1 from commercial_addition_fulfillments),'ledger rolls back if a downstream line fails';
 assert (select total_value from contracts limit 1)=1000 and (select count(*) from contract_lines)=1,'failed operation leaves no financial changes';
 assert (select status from proposals where id=p)='Sent','failed operation preserves previous status';
 perform set_config('qa.fail_award','off',true);
 perform commercial_addition_action(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"SYNTHETIC-PO"}');
 assert (select status from proposals where id=p)='Accepted','award status';
 assert (select total_value from contracts limit 1)=1472,'ARR increases only at award';
 assert (select estimated_value from renewals limit 1)=1472,'next renewal updated';
 assert (select count(*) from contract_lines)=3,'annual increments recorded once';
 assert (select backoffice_users from licenses limit 1)=10,'adjudication does not activate license';
 assert (select count(*) from commercial_addition_fulfillments)=1,'one ledger';
 perform commercial_addition_action(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"SYNTHETIC-PO"}');
 assert (select total_value from contracts limit 1)=1472 and (select count(*) from contract_lines)=3,'duplicate award is idempotent';
 perform pg_temp.expect_failure(p,'revise','{"note":"no"}','NOT_ELIGIBLE');
 perform pg_temp.expect_failure(p,'reject','{"note":"no"}','NOT_ELIGIBLE');
 perform pg_temp.expect_failure(p,'activate','{"reference":"RECEIPT"}','PAYMENT_REQUIRED');
 perform pg_temp.expect_failure(p,'activate','{"payment_confirmed":true}','PAYMENT_REQUIRED');
 begin
  update licenses set backoffice_users=20;
  perform pg_temp.expect_failure(p,'activate','{"payment_confirmed":true,"reference":"RECEIPT"}','CONFLICT');
  assert (select activated_at from commercial_addition_fulfillments where proposal_id=p) is null,'failed activation is atomic';
  raise exception 'ROLLBACK_CASE';
 exception when others then if sqlerrm<>'ROLLBACK_CASE' then raise; end if; end;
 perform commercial_addition_action(p,'activate','{"payment_confirmed":true,"reference":"SYNTHETIC-RECEIPT"}');
 perform commercial_addition_action(p,'activate','{"payment_confirmed":true,"reference":"SYNTHETIC-RECEIPT"}');
 assert (select backoffice_users from licenses limit 1)=11,'activation adds exactly one BO once';
 assert (select web_accesses from licenses limit 1)=11,'unawarded WEB unchanged';
 assert (select total_value from contracts limit 1)=1472,'activation does not add ARR again';
 assert (select renewal_date from renewals limit 1)='2028-04-14'::date,'no renewal extension';
 assert (select count(*) from lifecycle_events where source_proposal_id=p)=2,'award and activation audited';
end $$;
reset role;
-- A second, independently prepared addition covers WEB, all modules/plugins and API.
do $$ declare p uuid; data jsonb; lines jsonb; products jsonb:='["requests","stock","purchase","import","workflow","reports","sla","api"]'; begin
 perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 assert not public.can_manage_client('11111111-1111-4111-8111-111111111111'),'partner has no general client edit';
 assert public.can_manage_client_additions('11111111-1111-4111-8111-111111111111'),'existing pipeline edit allows own-client additions only';
 assert not public.can_manage_client_additions('99999999-9999-4999-8999-999999999999'),'another client is not authorized';
 data:=pg_temp.payload();
 select jsonb_agg(jsonb_build_object('code','QA_'||x,'label',x,'quantity',1,'kind','license','annual',100,'oneTime',0,'dueNow',25)) into lines from jsonb_array_elements_text(products) x;
 lines:=lines||'[{"code":"WEB","label":"Additional WEB","quantity":2,"kind":"web","annual":240,"oneTime":0,"dueNow":60}]'::jsonb;
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,backoffice}','0');
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,web}','2');
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,products}',products);
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,lines}',lines);
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,dueNow}','260');
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,annualIncrease}','1040');
 data:=jsonb_set(data,'{total_year_1}','260'); data:=jsonb_set(data,'{total_recurring}','1040');
 p:=save_commercial_addition_draft(null,null,data);
 perform commercial_addition_action(p,'validate');
 perform commercial_addition_action(p,'accept','{"date":"2026-10-29","evidence_type":"acceptance_email","reference":"SYNTHETIC-EMAIL"}');
 assert (select total_value from contracts limit 1)=2512,'subsequent award adds only delta';
 assert (select count(*) from licensed_modules)=0,'no module activation at award';
 perform commercial_addition_action(p,'activate','{"payment_confirmed":true,"reference":"SYNTHETIC-RECEIPT-2"}');
 assert (select backoffice_users from licenses limit 1)=11 and (select web_accesses from licenses limit 1)=13,'WEB adds only awarded delta';
 assert (select api_access from licenses limit 1),'API enabled';
 assert (select count(*) from licensed_modules where enabled)=7,'all and only seven non-API entitlements';
 assert not exists(select 1 from licensed_modules where module_id is null and plugin_id is null),'all activated components have catalog links';
 assert (select total_value from contracts limit 1)=2512,'component activation does not repeat ARR';
end $$;
do $$ begin
assert not has_function_privilege('anon','public.commercial_addition_action(uuid,text,jsonb)','execute'),'anonymous denied';
assert not has_function_privilege('authenticated','private.award_commercial_addition(uuid,text,date,text,text,text)','execute'),'private award cannot be bypassed';
assert not has_table_privilege('authenticated','commercial_addition_fulfillments','insert'),'ledger cannot be directly inserted';
end $$;
-- The existing opportunity and renewal acceptance paths retain their semantics.
do $$ declare p uuid; r uuid; begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 insert into proposals(client_id,client_name,source_type,deal_id,status,total_year_1,total_recurring) values('11111111-1111-4111-8111-111111111111','QA deal','deal',gen_random_uuid(),'Draft',118,472) returning id into p;
 insert into proposal_items(proposal_id,item_code,item_name,qty,total) values(p,'QA','QA',1,118);
 begin perform validate_proposal(p); raise exception 'Expected invalid regular recurring/year1'; exception when others then if sqlerrm not like '%Recurring total is inconsistent%' then raise; end if; end;
 update proposals set total_year_1=500 where id=p;
 perform validate_proposal(p);
 begin perform record_proposal_acceptance(p,'purchase_order','2026-10-29','QA'); raise exception 'Expected NOT_RENEWAL'; exception when others then if sqlerrm not like '%NOT_RENEWAL%' then raise; end if; end;
 select id into r from renewals limit 1;
 insert into proposals(client_id,client_name,source_type,renewal_id,status,total_year_1,total_recurring,payment_terms,product_family,license_model) values('11111111-1111-4111-8111-111111111111','QA renewal','renewal',r,'Draft',1000,1000,'QA agreed','Business','keepit') returning id into p;
 insert into proposal_items(proposal_id,item_code,item_name,qty,total) values(p,'QA_RENEWAL','QA',1,1000);
 perform validate_proposal(p); perform mark_proposal_sent(p,'2026-10-29'); perform record_proposal_acceptance(p,'purchase_order','2026-10-29','QA-RENEWAL');
 assert (select status from proposals where id=p)='Accepted','original renewal acceptance still works';
 assert (select count(*) from commercial_addition_fulfillments)=2,'ordinary paths do not create addition ledger entries';
 assert (select total_value from contracts limit 1)=2512,'renewal acceptance is not an addition award';
end $$;
select 'PASS: Draft/Ready/Sent/reject preserve ARR; award and renewal delta exactly once; activation only after payment; stale-source and permission guards; BO/WEB/module/plugin/API entitlements; audit and catalog links' result;
