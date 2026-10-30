-- SYNTHETIC ONLY; run after the isolated addition fixtures, never against PROD.
do $$ declare data jsonb; body jsonb; working jsonb; refreshed jsonb; pid uuid;
 before_count int; before_arr numeric; before_web int; begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 data:=pg_temp.detailed_payload();
 body:=jsonb_build_object('draft',data#>'{business_config,commercial_addition}','terms','','notes','Unfinished QA preparation');
 body:=jsonb_set(body,'{draft,selection,commercial,payment,invoice}','""');
 body:=jsonb_set(body,'{draft,quote,blockers}','["Payment agreement pending"]');
 select count(*) into before_count from proposals;select total_value into before_arr from contracts limit 1;select web_accesses into before_web from licenses limit 1;
 working:=save_proposal_preparation(null,null,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','addition',body);
 assert working->>'kind'='addition','partial work saved';
 assert (select count(*) from proposals)=before_count,'preparation cannot enter commercial proposal metrics';
 assert (select total_value from contracts limit 1)=before_arr,'no preparation ARR';
 assert (select web_accesses from licenses limit 1)=before_web,'no preparation access';
 begin
  perform commercial_addition_action((working->>'id')::uuid,'accept','{"reference":"QA"}');
  raise exception 'Expected missing proposal rejection';
 exception when others then if sqlerrm='Expected missing proposal rejection' then raise;end if;end;
 refreshed:=save_proposal_preparation((working->>'id')::uuid,(working->>'updated_at')::timestamptz,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','addition',body||'{"notes":"Updated QA preparation"}');
 begin
  perform save_proposal_preparation((working->>'id')::uuid,(working->>'updated_at')::timestamptz,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','addition',body);
  raise exception 'Expected stale draft rejection';
 exception when others then if sqlerrm not like 'CONFLICT:%' then raise;end if;end;
 begin
  perform complete_proposal_preparation((refreshed->>'id')::uuid,(refreshed->>'updated_at')::timestamptz,jsonb_set(data,'{business_config,commercial_addition,quote,lines,0,initialAnnual}','1'));
  raise exception 'Expected tampered completion rejection';
 exception when others then if sqlerrm not like 'VALIDATION_FAILED:%' then raise;end if;end;
 assert exists(select 1 from proposal_preparations where id=(refreshed->>'id')::uuid),'failed completion retains recoverable draft';
 pid:=complete_proposal_preparation((refreshed->>'id')::uuid,(refreshed->>'updated_at')::timestamptz,data);
 assert (select status from proposals where id=pid)='Draft','complete preparation becomes a real Draft, never an award';
 assert not exists(select 1 from proposal_preparations where id=(refreshed->>'id')::uuid),'atomic completion removes duplicate preparation';
 assert (select count(*) from proposals)=before_count+1,'exactly one complete proposal';
 assert (select total_value from contracts limit 1)=before_arr and (select web_accesses from licenses limit 1)=before_web,'completion has no ARR/license effect';
 assert private.addition_payment_text('{"language":"EN","payment":{"invoice":"","activation":""}}')='Payment and activation conditions have not been agreed yet.','no implicit credit';
 working:=save_proposal_preparation(null,null,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','request','{"request":{"mode":"change_hosting","target":"On-premise"}}');
 begin
  perform complete_proposal_preparation((working->>'id')::uuid,(working->>'updated_at')::timestamptz,data);
  raise exception 'Expected request issuance rejection';
 exception when others then if sqlerrm not like 'CONFLICT:%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
 begin
  perform save_proposal_preparation(null,null,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','addition',body);
  raise exception 'Expected read-only rejection';
 exception when others then if sqlerrm not like 'NOT_AUTHORIZED:%' then raise;end if;end;
 assert not has_table_privilege('authenticated','proposal_preparations','insert'),'no direct preparation writes';
 assert not has_table_privilege('authenticated','proposal_preparations','update'),'no direct preparation overwrite';
 assert not has_function_privilege('anon','public.save_proposal_preparation(uuid,timestamptz,uuid,uuid,uuid,text,jsonb,uuid,timestamptz)','execute'),'no anonymous preparation operation';
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$ begin assert (select count(*) from public.proposal_preparations)=0,'read-only user cannot read internal preparations';end $$;
rollback;
select 'PASS: preparation isolation, optimistic concurrency, atomic completion, failed-save recovery, request issuance guard and role boundaries' result;
