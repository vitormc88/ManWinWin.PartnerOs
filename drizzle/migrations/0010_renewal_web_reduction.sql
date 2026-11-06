-- Preserve the access snapshot on edits through the existing transactional RPC.
do $migration$
declare
  definition text := pg_get_functiondef('public.save_renewal_proposal(uuid,uuid,jsonb,jsonb,text,text)'::regprocedure);
  anchor text := 'source_plan = _row.source_plan, target_plan = _row.target_plan,';
begin
  if strpos(definition, anchor) = 0 then
    raise exception 'Unexpected save_renewal_proposal definition';
  end if;
  execute replace(definition, anchor, anchor || ' entitlements = _row.entitlements,');
end;
$migration$;

create function private.guard_renewal_web_reduction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reduction jsonb := new.entitlements->'web_reduction';
  target jsonb := new.entitlements->'web';
  current_license public.licenses%rowtype;
  contract_web_lines integer;
  annual_web_charge numeric;
begin
  if new.source_type <> 'renewal' or coalesce(new.renewal_change_mode, 'straight') <> 'straight' or reduction is null then
    return new;
  end if;
  -- Closing writes the new license before it marks the accepted proposal Won.
  if new.status = 'Won' and tg_op = 'UPDATE' and new.entitlements is not distinct from old.entitlements then
    return new;
  end if;
  select l.* into current_license from public.renewals r
  join public.licenses l on l.id = r.license_id and l.client_id = r.client_id
  where r.id = new.renewal_id and r.client_id = new.client_id;
  if not found or current_license.web_accesses is null or current_license.included_web_accesses is null
    or (reduction->>'previous_total')::integer is distinct from current_license.web_accesses
    or (target->>'included')::integer is distinct from current_license.included_web_accesses
    or (target->>'total')::integer is distinct from new.web_users
    or (target->>'billable')::integer is null or (target->>'billable')::integer < 0
    or new.web_users is distinct from (target->>'included')::integer + (target->>'billable')::integer
    or new.web_users >= current_license.web_accesses then
    raise exception 'The WEB reduction no longer matches the current licence.' using errcode = '23514';
  end if;
  if new.status <> 'Draft' then
    if reduction->>'ready' is distinct from 'true' or reduction->>'annual' is null then
      raise exception 'Confirm the annual WEB reduction price before validating.' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
      raise exception 'Save the WEB reduction as a draft before validating.' using errcode = '23514';
    end if;
    if (select count(*) from public.proposal_items i where i.proposal_id = new.id
          and i.item_code = reduction->>'item_code' and i.is_recurring and i.qty = 1
          and i.frequency = 'yearly' and i.discount_amount = 0
          and i.net_total = (reduction->>'annual')::numeric) <> 1 then
      raise exception 'The saved annual charge differs from the WEB reduction price.' using errcode = '23514';
    end if;
    select count(*), max(cl.amount * case lower(cl.billing_frequency)
      when 'monthly' then 12 when 'quarterly' then 4 when 'semiannual' then 2
      when 'annual' then 1 when 'yearly' then 1 else null end)
    into contract_web_lines, annual_web_charge
    from public.renewals r join public.contract_lines cl on cl.contract_id = r.contract_id
    where r.id = new.renewal_id and cl.line_type = 'mww_web';
    if reduction->>'pricing' = 'contract_web_line' and (contract_web_lines <> 1 or annual_web_charge is null
      or (reduction->>'annual')::numeric is distinct from round(annual_web_charge *
        (target->>'billable')::integer / (current_license.web_accesses - current_license.included_web_accesses), 2)) then
      raise exception 'The WEB charge does not match the current contract.' using errcode = '23514';
    end if;
    if reduction->>'pricing' is distinct from 'contract_web_line'
      and (tg_op = 'INSERT' or old.status = 'Draft' or old.entitlements is distinct from new.entitlements)
      and not coalesce(public.is_hq_user(auth.uid()), false) then
      raise exception 'HQ must validate the agreed annual renewal amount.' using errcode = '42501';
    end if;
    if reduction->>'pricing' is distinct from 'contract_web_line' and
      (btrim(coalesce(reduction->>'reason', '')) = '' or new.total_recurring is distinct from (reduction->>'annual')::numeric) then
      raise exception 'The agreed annual amount and justification must match the renewal.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_renewal_web_reduction() from public, anon, authenticated;
create trigger trg_renewal_web_reduction before insert or update of entitlements, status, web_users
on public.proposals for each row execute function private.guard_renewal_web_reduction();

-- Lock and recheck the live licence before applying the accepted reduction.
do $migration$
declare
  definition text := pg_get_functiondef('public.close_renewal_core(uuid,text,uuid,text,text,date,date)'::regprocedure);
  anchor text := 'UPDATE public.licenses SET';
begin
  if strpos(definition, anchor) = 0 then
    raise exception 'Unexpected close_renewal_core definition';
  end if;
  execute replace(definition, anchor, $guard$
    IF p.entitlements ? 'web_reduction' THEN
      PERFORM 1 FROM public.licenses
        WHERE id = _license_id AND client_id = r.client_id
          AND web_accesses = (p.entitlements->'web_reduction'->>'previous_total')::integer
          AND included_web_accesses = (p.entitlements->'web'->>'included')::integer
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The WEB access configuration changed after this proposal was prepared.' USING ERRCODE = '23514';
      END IF;
    END IF;
    UPDATE public.licenses SET$guard$);
end;
$migration$;