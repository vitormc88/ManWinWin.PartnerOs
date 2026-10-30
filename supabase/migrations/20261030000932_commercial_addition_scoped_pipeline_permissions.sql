-- Commercial addition operations use the existing pipeline edit capability,
-- scoped to visible clients owned by the user's partner. No general client/
-- license/contract table policies or user permissions are widened.
create or replace function public.can_manage_client_additions(_client_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and (
  public.can_manage_client(_client_id)
  or (public.has_module_access('pipeline','edit') and public.can_view_client(_client_id)
   and exists(select 1 from public.clients c where c.id=_client_id and (
    public.is_hq_user(auth.uid())
    or c.partner_uuid=public.get_user_partner_id(auth.uid())
    or (c.partner_uuid is null and c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and c.partner_id::uuid=public.get_user_partner_id(auth.uid()))
   )))
 )
$$;
revoke all on function public.can_manage_client_additions(uuid) from public,anon;
grant execute on function public.can_manage_client_additions(uuid) to authenticated;

-- The draft operation must lock and read source records, but may only write its
-- own proposal/line mirror. Use an explicitly gated entry point instead of
-- granting partners general UPDATE on licenses or contracts.
alter function public.save_commercial_addition_draft(uuid,timestamptz,jsonb) security definer;
alter function public.save_commercial_addition_draft(uuid,timestamptz,jsonb) set search_path=pg_catalog,public,pg_temp;
do $$ declare definition text; fn text; needle text; begin
 select pg_get_functiondef('public.save_commercial_addition_draft(uuid,timestamptz,jsonb)'::regprocedure) into definition;
 needle:='if auth.uid() is null then raise exception ''NOT_AUTHORIZED: Sign in before saving a proposal.''; end if;';
 if position(needle in definition)=0 then raise exception 'Unexpected addition draft definition; review before applying.'; end if;
 execute replace(definition,needle,'if auth.uid() is null or not public.can_manage_client_additions((_payload->>''client_id'')::uuid) then raise exception ''NOT_AUTHORIZED: Client commercial edit permission is required.''; end if;');
 foreach fn in array array['private.check_commercial_addition(uuid)','private.award_commercial_addition(uuid,text,date,text,text,text)','public.commercial_addition_action(uuid,text,jsonb)'] loop
  select pg_get_functiondef(fn::regprocedure) into definition;
  needle:='public.can_manage_client(p.client_id)';
  if position(needle in definition)=0 then raise exception 'Unexpected addition operation %; review before applying.',fn; end if;
  execute replace(definition,needle,'public.can_manage_client_additions(p.client_id)');
 end loop;
end $$;
