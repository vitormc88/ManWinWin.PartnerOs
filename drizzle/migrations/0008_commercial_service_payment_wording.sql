-- Preserve legacy saved documents; new service-only drafts use service commencement wording.
create function private.addition_service_payment_text(c jsonb) returns text
language sql immutable set search_path=pg_catalog,private as $$
 select regexp_replace(regexp_replace(private.addition_payment_text(c),'(^|\n)Ativação ','\1Início dos serviços ','g'),'(^|\n)Activation ','\1Service commencement ','g')
$$;
revoke all on function private.addition_service_payment_text(jsonb) from public,anon,authenticated;
do $migration$
declare definition text;needle text;replacement text;
begin
 definition:=pg_get_functiondef('public.save_commercial_addition_draft(uuid,timestamptz,jsonb)'::regprocedure);
 needle:=$needle$_payload->>'payment_terms' is distinct from private.addition_payment_text(s->'commercial') then$needle$;
 replacement:=$replacement$_payload->>'payment_terms' is distinct from private.addition_payment_text(s->'commercial') and not(private.addition_services_only(s) and _payload->>'payment_terms' is not distinct from private.addition_service_payment_text(s->'commercial')) then$replacement$;
 if position(needle in definition)=0 then raise exception 'Unexpected addition payment validation implementation';end if;
 execute replace(definition,needle,replacement);
end $migration$;