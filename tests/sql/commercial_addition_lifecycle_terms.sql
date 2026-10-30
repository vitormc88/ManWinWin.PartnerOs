-- Synthetic only; exercises the real pricing/approval/award/activation functions.
create function pg_temp.detailed_payload() returns jsonb language plpgsql as $$
declare data jsonb:=pg_temp.payload(); d jsonb; c jsonb; begin
 d:=data#>'{business_config,commercial_addition}';
 d:=jsonb_set(d,'{baseline}',(d->'baseline')||jsonb_build_object('family','Business','model','useit','deployment','saas','componentIds',(select coalesce(jsonb_agg(id::text order by id::text),'[]') from licensed_modules where enabled)));
 c:='{"version":2,"language":"EN","proposalDate":"2026-10-29","validityDays":30,"adjustments":{"BUS_WEB_MOBILE_USER":{"unitPrice":null,"initialDiscountPct":10,"renewalDiscountPct":0,"reason":"Initial-only concession"}},"payment":{"invoice":"award","awardPercent":100,"awardDueDays":30,"installationDueDays":30,"activation":"on_award","reference":"Signed QA credit approval"}}';
 d:=jsonb_set(d,'{selection}',(d->'selection')||jsonb_build_object('commercial',c,'backoffice',0,'web',3,'agreedMonths',3,'monthReview','Synthetic explicitly agreed period'));
 d:=jsonb_set(d,'{rules}','[{"code":"BUS_WEB_MOBILE_USER","unit_price":20,"unit_type":"per-user-month","currency":"EUR","active":true,"support_percentage":null}]');
 d:=jsonb_set(d,'{quote}','{"blockers":[],"months":3,"dueNow":162,"annualIncrease":720,"lines":[{"code":"BUS_WEB_MOBILE_USER","label":"WEB","kind":"web","quantity":3,"annual":720,"oneTime":0,"dueNow":162,"initialAnnual":648,"referenceAnnual":720,"referenceOneTime":0,"referenceUnitPrice":20,"unitPrice":20,"initialDiscountPct":10,"renewalDiscountPct":0}]}');
 return data||jsonb_build_object('total_year_1',162,'total_recurring',720,'validity_days',30,'payment_terms',private.addition_payment_text(c),'business_config',jsonb_build_object('commercial_addition',d));
end $$;

do $$ declare data jsonb; p uuid; con_before numeric; users_before int; begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 data:=pg_temp.detailed_payload(); select total_value into con_before from contracts limit 1;select web_accesses into users_before from licenses limit 1;
 p:=save_commercial_addition_draft(null,null,data);
 assert (select total_value from contracts limit 1)=con_before,'detailed draft leaves ARR unchanged';
 assert exists(select 1 from commercial_addition_terms_approvals where proposal_id=p),'server approved fingerprint';
 assert (select validity_days from proposals where id=p)=30,'document metadata persisted';
 perform commercial_addition_action(p,'validate');
 perform commercial_addition_action(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA TERMS"}');
 assert (select total_value from contracts limit 1)=con_before+720,'initial concession does not change contractual renewal tariff';
 assert (select web_accesses from licenses limit 1)=users_before,'award leaves entitlement unchanged';
 perform pg_temp.expect_failure(p,'activate','{"payment_confirmed":true,"reference":"QA"}','AUTHORIZATION_REQUIRED');
 perform commercial_addition_action(p,'activate','{"activation_authorized":true,"reference":"QA credit authorization"}');
 perform commercial_addition_action(p,'activate','{"activation_authorized":true,"reference":"QA credit authorization"}');
 assert (select web_accesses from licenses limit 1)=users_before+3,'credit activation adds selected WEB once';
 assert (select total_value from contracts limit 1)=con_before+720,'activation does not repeat ARR';
end $$;

do $$ declare data jsonb; p uuid; con_before numeric; users_before int; begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 data:=pg_temp.detailed_payload();
 -- Negotiated persistent tariff: 3 WEB at15 ->540/year,135/3months.
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,commercial,adjustments,BUS_WEB_MOBILE_USER}','{"unitPrice":15,"initialDiscountPct":0,"renewalDiscountPct":0,"reason":"Negotiated persistent price"}');
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,lines,0}','{"code":"BUS_WEB_MOBILE_USER","label":"WEB","kind":"web","quantity":3,"annual":540,"oneTime":0,"dueNow":135,"initialAnnual":540,"referenceAnnual":540,"referenceOneTime":0,"referenceUnitPrice":20,"unitPrice":15,"initialDiscountPct":0,"renewalDiscountPct":0}');
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,dueNow}','135');data:=jsonb_set(data,'{business_config,commercial_addition,quote,annualIncrease}','540');data:=data||'{"total_year_1":135,"total_recurring":540}';
 p:=save_commercial_addition_draft(null,null,data);perform commercial_addition_action(p,'validate');
 -- An offer can have zero commercial amount while granting entitlements.
 data:=pg_temp.detailed_payload();
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,commercial,adjustments,BUS_WEB_MOBILE_USER}','{"unitPrice":null,"initialDiscountPct":100,"renewalDiscountPct":100,"reason":"HQ approved permanent gift"}');
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,lines,0}','{"code":"BUS_WEB_MOBILE_USER","label":"WEB offer","kind":"web","quantity":3,"annual":0,"oneTime":0,"dueNow":0,"initialAnnual":0,"referenceAnnual":720,"referenceOneTime":0,"referenceUnitPrice":20,"unitPrice":20,"initialDiscountPct":100,"renewalDiscountPct":100}');
 data:=jsonb_set(data,'{business_config,commercial_addition,quote,dueNow}','0');data:=jsonb_set(data,'{business_config,commercial_addition,quote,annualIncrease}','0');data:=data||'{"total_year_1":0,"total_recurring":0}';
 select total_value into con_before from contracts limit 1;select web_accesses into users_before from licenses limit 1;
 p:=save_commercial_addition_draft(null,null,data);perform commercial_addition_action(p,'validate');
 perform commercial_addition_action(p,'accept','{"date":"2026-10-29","evidence_type":"purchase_order","reference":"QA OFFER"}');
 perform commercial_addition_action(p,'activate','{"activation_authorized":true,"reference":"QA zero amount offer"}');
 assert (select total_value from contracts limit 1)=con_before,'gift does not add ARR';
 assert (select web_accesses from licenses limit 1)=users_before+3,'gift grants selected entitlement';
end $$;

do $$ declare data jsonb; p uuid; begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 data:=pg_temp.detailed_payload();
 begin
  perform save_commercial_addition_draft(null,null,jsonb_set(data,'{business_config,commercial_addition,quote,lines,0,initialAnnual}','1'));
  raise exception 'Expected tampered price rejection';
 exception when others then if sqlerrm not like '%Detailed line amounts%' then raise;end if;end;
 begin
  perform save_commercial_addition_draft(null,null,jsonb_set(data,'{business_config,commercial_addition,selection,agreedMonths}','4'));
  raise exception 'Expected tampered month rejection';
 exception when others then if sqlerrm not like '%agreed months%' then raise;end if;end;
 p:=save_commercial_addition_draft(null,null,data);
 begin
  update proposals set notes='Allowed note change',payment_terms='Changed after server approval' where id=p;
  perform pg_temp.expect_failure(p,'validate','{}','Save and authorize');
  raise exception 'ROLLBACK_CASE';
 exception when others then if sqlerrm<>'ROLLBACK_CASE' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 begin
  perform save_commercial_addition_draft(null,null,data);
  raise exception 'Expected credit authorization rejection';
 exception when others then if sqlerrm not like '%HQ must authorize%' then raise;end if;end;
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,commercial,payment,activation}','"full_payment"');
 data:=jsonb_set(data,'{business_config,commercial_addition,selection,commercial,adjustments,BUS_WEB_MOBILE_USER,initialDiscountPct}','11');
 begin
  perform save_commercial_addition_draft(null,null,data);
  raise exception 'Expected discount limit rejection';
 exception when others then if sqlerrm not like '%DISCOUNT_LIMIT%' then raise;end if;end;
 assert not has_table_privilege('authenticated','commercial_addition_terms_approvals','insert'),'cannot forge authorization';
 assert not has_function_privilege('authenticated','private.check_addition_detailed_terms(jsonb,boolean)','execute'),'private helper not exposed';
end $$;
select 'PASS: initial/renewal tariffs, negotiated price, zero-value gifts, credit authorization, tampering and permission checks' result;
