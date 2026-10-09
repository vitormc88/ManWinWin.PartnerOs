-- Preserve API safe-update protection. Only the derived Explorer projection
-- is rebuilt; no existing source clients/partners are deleted or rewritten.
-- The base migration remains immutable; this is its additive compatibility fix.
do $fix$
declare definition text;
begin
 definition := pg_catalog.pg_get_functiondef('private.refresh_customer_explorer()'::regprocedure);
 if position('delete from public.customer_explorer_directory;' in definition)>0 then
  execute replace(definition,
   'delete from public.customer_explorer_directory;',
   'delete from public.customer_explorer_directory where id is not null;');
 elsif position('delete from public.customer_explorer_directory where id is not null;' in definition)=0 then
  raise exception 'Unexpected Explorer refresh definition; review before applying';
 end if;
end $fix$;
