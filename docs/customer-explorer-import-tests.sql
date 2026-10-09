-- Isolated recovered database / TEST only, inside BEGIN/ROLLBACK after migrations.
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p where p.is_active and p.is_hq and public.has_role(p.id,'hq_admin'::public.app_role) limit 1;
set local role authenticated;
do $$ declare original public.customer_explorer_hq; total integer; rejected boolean=false; begin
 total=public.customer_explorer_save_hq_batch('[{"client_id":"987654310","name":"Import concurrency fixture","country":"PT","visible":true,"evidence_status":"unconfirmed"}]');
 if total<>1 then raise exception 'HQ insert failed';end if;
 select * into strict original from public.customer_explorer_hq where client_id='987654310';
 update public.customer_explorer_hq set name='Second editor change' where id=original.id;
 begin
  perform public.customer_explorer_save_hq_batch(jsonb_build_array(
   jsonb_build_object('client_id','987654311','name','Atomic rollback fixture','country','PT','visible',true,'evidence_status','unconfirmed'),
   jsonb_build_object('id',original.id,'expected_updated_at',original.updated_at,'client_id',original.client_id,'name','Stale editor','country','PT','visible',true,'evidence_status','unconfirmed')));
 exception when sqlstate 'PT409' then rejected=true;end;
 if not rejected then raise exception 'Stale import accepted';end if;
 if exists(select 1 from public.customer_explorer_hq where client_id='987654311') then raise exception 'Partial import committed';end if;
 if not exists(select 1 from public.customer_explorer_hq where id=original.id and name='Second editor change') then raise exception 'Concurrent edit lost';end if;
 select * into strict original from public.customer_explorer_hq where id=original.id;
 total=public.customer_explorer_save_hq_batch(jsonb_build_array(jsonb_build_object('id',original.id,'expected_updated_at',original.updated_at,'client_id',original.client_id,'name','Reviewed editor','country','PT','visible',true,'evidence_status','unconfirmed')));
 if total<>1 then raise exception 'Current revision rejected';end if;
 begin
  perform public.customer_explorer_save_hq_batch('[{"client_id":"987654310","name":"Duplicate overwrite","country":"PT","visible":true,"evidence_status":"unconfirmed"}]');
  raise exception 'New import overwrote existing ID';
 exception when unique_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',p.id,'role','authenticated')::text,true)
from public.profiles p join public.partners t on t.id=p.partner_id where p.is_active and not p.is_hq and t.is_active limit 1;
set local role authenticated;
do $$ begin
 begin perform public.customer_explorer_save_hq_batch('[{"client_id":"987654312","name":"Denied fixture","country":"PT","visible":true,"evidence_status":"unconfirmed"}]');
 raise exception 'Partner import accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.customer_explorer_save_hq_batch(jsonb)','EXECUTE') then raise exception 'Anonymous import RPC exposed';end if;
end $$;
