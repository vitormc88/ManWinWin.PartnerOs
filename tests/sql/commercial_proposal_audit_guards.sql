-- SYNTHETIC LOCAL ONLY; run after the lifecycle/simple-editor fixtures in one session.
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
insert into pricing_rules values('BUS_RCI_LIVE_SESSION',true,'EUR','one-time',405,null) on conflict do nothing;
create function pg_temp.services_only_payload() returns jsonb language plpgsql as $$
declare data jsonb:=pg_temp.combined_payload();d jsonb;s jsonb;begin
 d:=data#>'{business_config,commercial_addition}';s:=d->'selection';
 s:=s||'{"backoffice":0,"web":0,"products":[],"baselineAnnualConfirmed":false,"services":[{"id":"training","label":"Remote training","modality":"online","quantity":2,"unit":"session","unitPrice":405,"ruleCode":"BUS_RCI_LIVE_SESSION","reference":"Catalogue","expense":false}]}'::jsonb;
 s:=jsonb_set(s,'{commercial,adjustments}','{"SERVICE_training":{"unitPrice":null,"initialDiscountPct":25,"renewalDiscountPct":0,"reason":"Approved service discount"}}');
 d:=jsonb_set(d,'{selection}',s);d:=jsonb_set(d,'{rules}',(d->'rules')||'[{"code":"BUS_RCI_LIVE_SESSION","unit_price":405,"unit_type":"one-time","currency":"EUR","active":true,"support_percentage":null}]');
 d:=jsonb_set(d,'{quote}','{"blockers":[],"months":0,"dueNow":607.5,"annualIncrease":0,"lines":[{"code":"SERVICE_training","label":"Remote training","kind":"service","quantity":2,"annual":0,"oneTime":607.5,"dueNow":607.5,"initialAnnual":0,"referenceAnnual":0,"referenceOneTime":810,"referenceUnitPrice":405,"unitPrice":405,"initialDiscountPct":25,"renewalDiscountPct":0}]}');
 return data||jsonb_build_object('total_year_1',607.5,'total_recurring',0,'business_config',jsonb_build_object('commercial_addition',d));
end $$;
begin;
do $$ declare data jsonb;p uuid;n uuid;arr numeric;con_updated timestamptz;lic_updated timestamptz;begin
 data:=pg_temp.services_only_payload();
 begin
  perform save_commercial_addition_draft(null,null,jsonb_set(data,'{business_config,commercial_addition,selection,services,0,unit}','"day"'));
  raise exception 'QA expected tariff rejection';
 exception when others then if sqlerrm like '%QA expected%' then raise;end if;assert sqlerrm like '%approved training catalogue rule%';end;
 select total_value,updated_at into arr,con_updated from contracts limit 1;select updated_at into lic_updated from licenses limit 1;
 p:=save_commercial_addition_draft(null,null,data);perform commercial_addition_action(p,'validate');
 perform commercial_addition_action(p,'accept',jsonb_build_object('date',current_date,'evidence_type','purchase_order','reference','QA-SERVICES'));
 assert (select total_value from contracts limit 1)=arr;
 assert (select updated_at from contracts limit 1)=con_updated,'Services must not alter contract header';
 assert not (select requires_license_activation from commercial_addition_fulfillments where proposal_id=p);
 assert commercial_addition_action(p,'activate','{}')->>'not_required'='true';
 assert (select updated_at from licenses limit 1)=lic_updated,'Services must not touch license';
 n:=save_commercial_addition_draft(null,null,pg_temp.combined_payload());perform commercial_addition_action(n,'validate');
 assert (select status from proposals where id=n)='Ready','Service-only award does not block software';
end $$;
rollback;
\echo 'PASS A01/A02/A03: tariff scope, zero-month services, unchanged ARR/license and no subsequent block'

begin;
do $$ declare data jsonb;p uuid;pr jsonb;recovered jsonb;newp uuid;t timestamptz;begin
 data:=pg_temp.combined_payload();p:=save_commercial_addition_draft(null,null,data);select updated_at into t from proposals where id=p;
 pr:=save_proposal_preparation(null,null,(data->>'client_id')::uuid,(data->>'license_id')::uuid,(data->>'contract_id')::uuid,'addition',jsonb_build_object('draft',data#>'{business_config,commercial_addition}'),p,t);
 begin perform commercial_addition_action(p,'validate');raise exception 'QA expected pending guard';
 exception when others then if sqlerrm like '%QA expected%' then raise;end if;assert sqlerrm like 'PREPARATION_PENDING:%';end;
 -- Represent a pre-migration preparation whose original was already validated.
 perform set_config('partneros.proposal_op','on',true);update proposals set status='Ready',updated_at=clock_timestamp() where id=p;perform set_config('partneros.proposal_op','off',true);
 recovered:=recover_addition_preparation((pr->>'id')::uuid,(pr->>'updated_at')::timestamptz);
 assert recovered->>'proposal_id' is null;
 assert recovered#>>'{body,recovered_journey,revisionOf}'=p::text;
 recovered:=save_proposal_preparation((recovered->>'id')::uuid,(recovered->>'updated_at')::timestamptz,(data->>'client_id')::uuid,(data->>'license_id')::uuid,(data->>'contract_id')::uuid,'addition',recovered->'body'||'{"recovered_journey":{"revisionOf":"forged"}}',null,null);
 assert recovered#>>'{body,recovered_journey,revisionOf}'=p::text,'Recovery identity is server-controlled across later saves';
 newp:=complete_proposal_preparation((recovered->>'id')::uuid,(recovered->>'updated_at')::timestamptz,data);
 assert newp<>p;assert (select status from proposals where id=p)='Ready';
 assert (select business_config#>>'{commercial_journey,revisionOf}' from proposals where id=newp)=p::text;
 assert not exists(select 1 from proposal_preparations where id=(pr->>'id')::uuid);
end $$;
rollback;
\echo 'PASS A04: pending edits block validation and stale work recovers as a distinct revision'

begin;
do $$ declare p uuid;data jsonb;begin
 data:=pg_temp.combined_payload();p:=save_commercial_addition_draft(null,null,data);perform commercial_addition_action(p,'validate');
 begin perform commercial_addition_action(p,'sent','{"date":"2000-01-01"}');raise exception 'QA expected chronology guard';
 exception when others then if sqlerrm like '%QA expected%' then raise;end if;assert sqlerrm like 'INVALID_DATE:%';end;
 perform commercial_addition_action(p,'sent',jsonb_build_object('date',current_date));assert (select status from proposals where id=p)='Sent';
end $$;
rollback;
\echo 'PASS A05: historical send before document date rejected; valid send preserved'

begin;
do $$ declare p uuid;data jsonb;details jsonb;begin
 data:=jsonb_set(pg_temp.combined_payload(),'{business_config,commercial_addition,selection,commercial,validityDays}','1');
 p:=save_commercial_addition_draft(null,null,data);perform commercial_addition_action(p,'validate');
 details:=jsonb_build_object('date',current_date,'evidence_type','purchase_order','reference','QA-EXPIRED');
 begin perform commercial_addition_action(p,'accept',details);raise exception 'QA expected expiry guard';
 exception when others then if sqlerrm like '%QA expected%' then raise;end if;assert sqlerrm like 'VALIDITY_EXPIRED:%';end;
 perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 begin perform commercial_addition_action(p,'accept',details||'{"validity_extension_confirmed":true,"validity_extension_reason":"Partner request"}');raise exception 'QA expected HQ authorization';
 exception when others then if sqlerrm like '%QA expected%' then raise;end if;assert sqlerrm like 'HQ_EXCEPTION_ONLY:%';end;
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 perform commercial_addition_action(p,'accept',details||'{"validity_extension_confirmed":true,"validity_extension_reason":"HQ explicitly approved unchanged terms"}');
 assert (select status from proposals where id=p)='Accepted';assert (select validity_days from proposals where id=p)=1,'Issued document unchanged';
 assert exists(select 1 from proposal_status_events where proposal_id=p and action='addition_validity_extended');
 perform commercial_addition_action(p,'accept',details);assert (select count(*) from commercial_addition_fulfillments where proposal_id=p)=1;
end $$;
rollback;
\echo 'PASS A06: expired offer needs explicit HQ authorization; document stays frozen; award idempotent'

begin;
do $$ declare data jsonb;p uuid;begin
 update contracts set contract_end_date=current_date-1,updated_at=clock_timestamp();update licenses set license_status='inactive',updated_at=clock_timestamp();
 data:=pg_temp.services_only_payload();
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,effectiveDate}',to_jsonb(current_date::text));
 p:=save_commercial_addition_draft(null,null,data);perform commercial_addition_action(p,'validate');
 assert (select status from proposals where id=p)='Ready','Services are independent of expired license period';
end $$;
rollback;
\echo 'PASS: services remain quotable after license renewal date'
