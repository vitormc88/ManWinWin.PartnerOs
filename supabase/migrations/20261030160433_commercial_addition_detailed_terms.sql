-- Detailed addition terms. Existing saved snapshots keep legacy prices/payment.
create table public.commercial_addition_terms_approvals (
 proposal_id uuid primary key references public.proposals(id) on delete cascade,
 fingerprint text not null, authorized_by uuid not null references public.profiles(id),
 authorized_at timestamptz not null default now()
);
alter table public.commercial_addition_terms_approvals enable row level security;
revoke all on public.commercial_addition_terms_approvals from public,anon,authenticated;
grant select on public.commercial_addition_terms_approvals to authenticated;
create policy addition_terms_read on public.commercial_addition_terms_approvals for select to authenticated
 using(exists(select 1 from public.proposals p where p.id=proposal_id and public.can_view_client(p.client_id)));
create index addition_terms_authorized_by on public.commercial_addition_terms_approvals(authorized_by);

create function private.addition_terms_fingerprint(p public.proposals) returns text
language sql immutable set search_path=pg_catalog as $$
 select md5(jsonb_build_array(p.business_config->'commercial_addition',p.payment_terms,p.proposal_date,p.validity_days,p.language)::text)
$$;
revoke all on function private.addition_terms_fingerprint(public.proposals) from public,anon,authenticated;

create function private.addition_rule(rules jsonb,code text,unit text,pct boolean default false) returns numeric
language plpgsql immutable set search_path=pg_catalog as $$
declare r jsonb; v numeric;
begin
 select x into strict r from jsonb_array_elements(rules) x where x->>'code'=code and x->>'active'='true';
 v:=(r->>case when pct then 'support_percentage' else 'unit_price' end)::numeric;
 if r->>'currency' is distinct from 'EUR' or r->>'unit_type' is distinct from unit or v is null or v::text in ('NaN','Infinity','-Infinity') or v<=0 or (pct and v>100) then raise exception 'VALIDATION_FAILED: Invalid catalogue rule %',code; end if;
 return v;
end $$;
revoke all on function private.addition_rule(jsonb,text,text,boolean) from public,anon,authenticated;

create function private.addition_license_parts(d jsonb,suffix text,qty numeric) returns jsonb
language plpgsql immutable set search_path=pg_catalog,private as $$
declare s jsonb:=d->'selection'; b jsonb:=d->'baseline'; r jsonb:=d->'rules'; code text; amount numeric; share numeric;
begin
 share:=case when s->>'offerBasis'='partner' then (s->>'licenseShare')::numeric/100 else 1 end;
 if b->>'model'='keepit' then
  code:='BUS_KEEPIT_'||suffix;amount:=private.addition_rule(r,code,'one-time')*qty;
  return jsonb_build_array(jsonb_build_object('code',code,'quantity',qty,'kind','license','annual',0,'oneTime',round(amount*share,2)),jsonb_build_object('code',code||'_SAT','quantity',qty,'kind','sat','annual',round(amount*private.addition_rule(r,'BUS_KEEPIT_SAT','yearly',true)/100*share,2),'oneTime',0));
 end if;
 code:='BUS_'||case when s->>'pricingBasis'='derived' then 'KEEPIT_' else 'USEIT_' end||suffix;
 amount:=private.addition_rule(r,code,case when s->>'pricingBasis'='derived' then 'one-time' else 'yearly' end)*qty;
 if s->>'pricingBasis'='derived' then amount:=amount*private.addition_rule(r,'BUS_USEIT_FACTOR','percentage',true)/100; end if;
 return jsonb_build_array(jsonb_build_object('code',code,'quantity',qty,'kind','license','annual',round(amount*share,2),'oneTime',0));
end $$;
revoke all on function private.addition_license_parts(jsonb,text,numeric) from public,anon,authenticated;

create function private.addition_raw_lines(d jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,private as $$
declare s jsonb:=d->'selection'; b jsonb:=d->'baseline'; r jsonb:=d->'rules'; result jsonb:='[]'; code text; suffix text; product text; share numeric; qty numeric;
begin
 share:=case when s->>'offerBasis'='partner' then (s->>'licenseShare')::numeric/100 else 1 end;
 if b->>'family' not in ('Business','Professional') or (b->>'family'='Business' and coalesce(b->>'model','') not in ('keepit','useit')) then raise exception 'VALIDATION_FAILED: Invalid source product'; end if;
 qty:=(s->>'backoffice')::numeric;
 if qty>0 then
  if b->>'family'<>'Business' then raise exception 'VALIDATION_FAILED: Professional requires an upgrade'; end if;
  result:=result||private.addition_license_parts(d,'ADDITIONAL_BACKOFFICE',qty);
  if b->>'deployment'='saas' then result:=result||jsonb_build_array(jsonb_build_object('code','BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE','quantity',qty,'kind','hosting','annual',round(private.addition_rule(r,'BUS_SAAS_HOSTING_ADDITIONAL_BACKOFFICE','per-user-month')*12*qty*case when s->>'offerBasis'='partner' then (s->>'hostingShare')::numeric/100 else 1 end,2),'oneTime',0)); end if;
 end if;
 qty:=(s->>'web')::numeric;
 if qty>0 then
  code:=case when b->>'family'='Business' then 'BUS_WEB_MOBILE_USER' else 'web_user' end;
  result:=result||jsonb_build_array(jsonb_build_object('code',code,'quantity',qty,'kind','web','annual',round(private.addition_rule(r,code,'per-user-month')*12*qty*share,2),'oneTime',0));
 end if;
 for product in select jsonb_array_elements_text(s->'products') loop
  if b->>'family'='Professional' then
   if product<>'requests' then raise exception 'VALIDATION_FAILED: Professional requires an upgrade'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('code','requests_module','quantity',1,'kind','license','annual',round(private.addition_rule(r,'requests_module','yearly')*share,2),'oneTime',0));
  elsif product='api' then result:=result||jsonb_build_array(jsonb_build_object('code','BUS_API','quantity',1,'kind','api','annual',round(private.addition_rule(r,'BUS_API','yearly')*share,2),'oneTime',0));
  else
   suffix:=case product when 'requests' then 'REQUESTS_MODULE' when 'stock' then 'STOCK_MODULE' when 'purchase' then 'PURCHASE_MODULE' when 'import' then 'PLUGIN_IMPORT' when 'workflow' then 'PLUGIN_WORKFLOW' when 'reports' then 'PLUGIN_ADVANCED_REPORTS' when 'sla' then 'PLUGIN_SLA' end;
   if suffix is null then raise exception 'VALIDATION_FAILED: Unknown product'; end if;
   result:=result||private.addition_license_parts(d,suffix,1);
  end if;
 end loop;
 return result;
end $$;
revoke all on function private.addition_raw_lines(jsonb) from public,anon,authenticated;

create function private.addition_payment_text(c jsonb) returns text
language plpgsql immutable set search_path=pg_catalog as $$
declare p jsonb:=c->'payment'; pt boolean:=c->>'language'='PT'; first_due text; second_due text; result text;
begin
 first_due:=case when (p->>'awardDueDays')::int=0 then case when pt then 'pronto pagamento' else 'due immediately' end else case when pt then 'pagamento a '|| (p->>'awardDueDays') ||' dias' else 'payment within '||(p->>'awardDueDays')||' days' end end;
 second_due:=case when (p->>'installationDueDays')::int=0 then case when pt then 'pronto pagamento' else 'due immediately' end else case when pt then 'pagamento a '||(p->>'installationDueDays')||' dias' else 'payment within '||(p->>'installationDueDays')||' days' end end;
 if p->>'invoice'='split' then
  result:=case when pt then 'Fatura de '||(p->>'awardPercent')||'% na adjudicação, '||first_due||E'.\nFatura dos restantes '||(100-(p->>'awardPercent')::numeric)::text||'% na instalação, '||second_due||'.' else (p->>'awardPercent')||'% invoiced on award, '||first_due||E'.\nRemaining '||(100-(p->>'awardPercent')::numeric)::text||'% invoiced on installation, '||second_due||'.' end;
 else result:=case when pt then 'Fatura de 100% na adjudicação, '||first_due||'.' else '100% invoiced on award, '||first_due||'.' end;end if;
 result:=result||E'\n'||case p->>'activation'
 when 'full_payment' then case when pt then 'Ativação após confirmação do pagamento integral.' else 'Activation after confirmation of full payment.' end
 when 'award_payment' then case when pt then 'Ativação após confirmação do pagamento da fatura de adjudicação.' else 'Activation after confirmation of the award invoice payment.' end
 else case when pt then 'Ativação após adjudicação e autorização das condições de crédito por HQ; sem exigir pagamento antecipado.' else 'Activation following award and HQ authorization of credit terms; advance payment is not required.' end end;
 return result||E'\n'||case when pt then 'Referência do acordo' else 'Agreement reference' end||': '||(p->>'reference');
end $$;
revoke all on function private.addition_payment_text(jsonb) from public,anon,authenticated;

create function private.check_addition_detailed_terms(d jsonb,authorize boolean default false) returns void
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s jsonb:=d->'selection'; c jsonb:=s->'commercial'; p jsonb; a jsonb; x jsonb; l jsonb; raw jsonb; parent jsonb; pa jsonb;
 annual numeric; once numeric; unit numeric; original numeric; factor numeric; initial_pct numeric; renewal_pct numeric; max_pct numeric:=100;
 initial_annual numeric; expected_now numeric; months numeric:=(d#>>'{quote,months}')::numeric; start_date date; end_date date; n int; calc_months int;
begin
 if c is null then
  if exists(select 1 from jsonb_array_elements(d#>'{quote,lines}') legacy_line where legacy_line ? 'initialAnnual') then raise exception 'VALIDATION_FAILED: Detailed amounts require structured terms'; end if;
  return;
 end if;
 if c->>'version' is distinct from '2' or coalesce(c->>'language','') not in ('PT','EN') or coalesce(c->>'proposalDate','') !~ '^\d{4}-\d{2}-\d{2}$'
 or coalesce((c->>'validityDays')::numeric,0) not between 1 and 365 or (c->>'validityDays')::numeric<>trunc((c->>'validityDays')::numeric)
 or jsonb_typeof(c->'adjustments') is distinct from 'object' then raise exception 'VALIDATION_FAILED: Review document date/language/validity'; end if;
 start_date:=(s->>'effectiveDate')::date;end_date:=(s->>'renewalDate')::date;
 if (c->>'proposalDate')::date>start_date or start_date>=end_date then raise exception 'INVALID_DATE: Review proposal and effective dates'; end if;
 n:=(extract(year from end_date)::int-extract(year from start_date)::int)*12+extract(month from end_date)::int-extract(month from start_date)::int;
 if (start_date+make_interval(months=>n))::date>end_date then n:=n-1;end if;
 calc_months:=n+case when s->>'monthPolicy'='started' and (start_date+make_interval(months=>n))::date<end_date then 1 else 0 end;
 if s->>'monthPolicy'='agreed' then
  if months is distinct from (s->>'agreedMonths')::numeric or coalesce(btrim(s->>'monthReview'),'')='' then raise exception 'VALIDATION_FAILED: Explain agreed months'; end if;
 elsif months is distinct from calc_months::numeric then raise exception 'VALIDATION_FAILED: Months do not agree with the stated dates/policy'; end if;
 p:=c->'payment';
 if coalesce(p->>'invoice','') not in ('award','split') or coalesce(p->>'activation','') not in ('full_payment','award_payment','on_award') or coalesce(btrim(p->>'reference'),'')=''
 or coalesce((p->>'awardDueDays')::numeric,-1) not between 0 and 365 or (p->>'awardDueDays')::numeric<>trunc((p->>'awardDueDays')::numeric)
 or coalesce((p->>'installationDueDays')::numeric,-1) not between 0 and 365 or (p->>'installationDueDays')::numeric<>trunc((p->>'installationDueDays')::numeric)
 or (p->>'invoice'='award' and (p->>'awardPercent')::numeric is distinct from 100)
 or (p->>'invoice'='split' and (coalesce((p->>'awardPercent')::numeric,0)<=0 or (p->>'awardPercent')::numeric>=100)) then raise exception 'VALIDATION_FAILED: Incomplete payment and activation agreement'; end if;
 if authorize and not public.is_hq_user(auth.uid()) then
  select coalesce((select max_software_discount_pct from public.partner_discount_limits where partner_id=public.get_user_partner_id(auth.uid())),10) into max_pct;
  if p->>'activation'='on_award' then raise exception 'HQ_EXCEPTION_ONLY: HQ must authorize credit activation'; end if;
 end if;
 raw:=private.addition_raw_lines(d);
 if jsonb_array_length(raw)<>jsonb_array_length(d#>'{quote,lines}') then raise exception 'VALIDATION_FAILED: Selected components and quoted lines differ'; end if;
 if exists(select 1 from jsonb_object_keys(c->'adjustments') code where not exists(select 1 from jsonb_array_elements(raw) z where z->>'code'=code)) then raise exception 'VALIDATION_FAILED: Remove stale component adjustments'; end if;
 for l in select value from jsonb_array_elements(raw) loop
  select z into strict x from jsonb_array_elements(d#>'{quote,lines}') z where z->>'code'=l->>'code';
  a:=c->'adjustments'->(l->>'code');
  initial_pct:=coalesce((a->>'initialDiscountPct')::numeric,0);renewal_pct:=coalesce((a->>'renewalDiscountPct')::numeric,0);
  factor:=case when l->>'kind' in ('web','hosting') then 12 else 1 end;
  original:=coalesce(nullif((l->>'oneTime')::numeric,0),(l->>'annual')::numeric)/(l->>'quantity')::numeric/factor;
  unit:=coalesce((a->>'unitPrice')::numeric,original);
  if unit::text in ('NaN','Infinity','-Infinity') or unit not between 0 and 100000000
   or initial_pct::text in ('NaN','Infinity','-Infinity') or initial_pct not between 0 and 100
   or renewal_pct::text in ('NaN','Infinity','-Infinity') or renewal_pct not between 0 and 100
   or (a is not null and (coalesce(btrim(a->>'reason'),'')='' or a->>'initialDiscountPct' is null or a->>'renewalDiscountPct' is null))
   or ((l->>'oneTime')::numeric>0 and renewal_pct<>0) or (l->>'kind'='sat' and a->>'unitPrice' is not null)
   then raise exception 'VALIDATION_FAILED: Invalid negotiated price/discount/justification'; end if;
  if authorize and not public.is_hq_user(auth.uid()) and (a->>'unitPrice' is not null or initial_pct>max_pct or renewal_pct>max_pct) then raise exception 'DISCOUNT_LIMIT: HQ authorization required'; end if;
  annual:=case when (l->>'annual')::numeric>0 then round(unit*(l->>'quantity')::numeric*factor,2) else 0 end;
  once:=case when (l->>'oneTime')::numeric>0 then round(unit*(l->>'quantity')::numeric,2) else 0 end;
  if l->>'kind'='sat' then
   select z into strict parent from jsonb_array_elements(raw) z where z->>'code'=regexp_replace(l->>'code','_SAT$','');
   pa:=c->'adjustments'->(parent->>'code');
   annual:=round((l->>'annual')::numeric*round(coalesce((pa->>'unitPrice')::numeric,(parent->>'oneTime')::numeric/(parent->>'quantity')::numeric)*(parent->>'quantity')::numeric,2)/(parent->>'oneTime')::numeric,2);
   unit:=annual/(l->>'quantity')::numeric;
  end if;
  initial_annual:=round(annual*(1-initial_pct/100),2);expected_now:=round(round(once*(1-initial_pct/100),2)+initial_annual*months/12,2);
  if (x->>'quantity')::numeric is distinct from (l->>'quantity')::numeric or x->>'kind' is distinct from l->>'kind'
   or (x->>'referenceAnnual')::numeric is distinct from annual or (x->>'referenceOneTime')::numeric is distinct from once
   or abs((x->>'referenceUnitPrice')::numeric-original)>0.00000001 or abs((x->>'unitPrice')::numeric-unit)>0.00000001
   or x->>'referenceUnitPrice' is null or x->>'unitPrice' is null
   or (x->>'initialAnnual')::numeric is distinct from initial_annual
   or (x->>'initialDiscountPct')::numeric is distinct from initial_pct or (x->>'renewalDiscountPct')::numeric is distinct from renewal_pct
   or (x->>'annual')::numeric is distinct from round(annual*(1-renewal_pct/100),2)
   or (x->>'oneTime')::numeric is distinct from round(once*(1-initial_pct/100),2)
   or (x->>'dueNow')::numeric is distinct from expected_now then raise exception 'VALIDATION_FAILED: Detailed line amounts do not agree with the frozen catalogue and commercial adjustments'; end if;
 end loop;
end $$;
revoke all on function private.check_addition_detailed_terms(jsonb,boolean) from public,anon,authenticated;

-- Extend the existing audited functions, asserting the expected prior definitions.
do $$ declare definition text; needle text; begin
 select pg_get_functiondef('public.save_commercial_addition_draft(uuid,timestamptz,jsonb)'::regprocedure) into definition;
 needle:='  b := draft->''baseline''; q := draft->''quote''; s := draft->''selection'';';
 if position(needle in definition)=0 then raise exception 'Unexpected addition save function';end if;
 definition:=replace(definition,needle,needle||E'\n  perform private.check_addition_detailed_terms(draft,true);\n  if s->''commercial'' is not null and _payload->>''payment_terms'' is distinct from private.addition_payment_text(s->''commercial'') then raise exception ''VALIDATION_FAILED: Payment text differs from the structured agreement'';end if;');
 definition:=replace(definition,'(x->>''annual'')::numeric * (q->>''months'')::numeric','coalesce((x->>''initialAnnual'')::numeric,(x->>''annual'')::numeric) * (q->>''months'')::numeric');
 definition:=replace(definition,'coalesce(sum_now,0) <= 0','(coalesce(sum_now,0) < 0 or (sum_now=0 and s->''commercial'' is null))');
 needle:='  if current_contract.contract_end_date is distinct from (b->>''renewalDate'')::date';
 if position(needle in definition)=0 then raise exception 'Unexpected source validation';end if;
 definition:=replace(definition,needle,E'  if s->''commercial'' is not null then\n    if coalesce(current_license.currency,''EUR'')<>''EUR'' or coalesce(current_contract.currency,''EUR'')<>''EUR'' then raise exception ''VALIDATION_FAILED: Addition catalogue requires EUR'';end if;\n    if regexp_replace(lower(current_license.license_model),''[^a-z0-9]'','''',''g'') in (''keepit'',''useit'') and (b->>''family'' is distinct from ''Business'' or b->>''model'' is distinct from regexp_replace(lower(current_license.license_model),''[^a-z0-9]'','''',''g'')) then raise exception ''CONFLICT: Commercial model differs from the source license'';end if;\n    if coalesce(current_license.api_access,false) and s->''products'' ? ''api'' then raise exception ''VALIDATION_FAILED: API is already licensed'';end if;\n  end if;\n'||needle);
 needle:='  if _proposal_id is null then';
 definition:=replace(definition,needle,E'  if s->''commercial'' is not null then\n    if _payload->>''language'' is distinct from s#>>''{commercial,language}'' or (_payload->>''proposal_date'')::date is distinct from (s#>>''{commercial,proposalDate}'')::date then raise exception ''VALIDATION_FAILED: Document metadata differs from approved terms''; end if;\n    if _proposal_id is null or draft->''rules'' is distinct from (select business_config#>''{commercial_addition,rules}'' from public.proposals where id=_proposal_id) then\n      if exists(select 1 from jsonb_array_elements(draft->''rules'') r where r->>''active''=''true'' and not exists(select 1 from public.pricing_rules pr where pr.code=r->>''code'' and pr.active and pr.currency=r->>''currency'' and pr.unit_type=r->>''unit_type'' and pr.unit_price=(r->>''unit_price'')::numeric and pr.support_percentage is not distinct from (r->>''support_percentage'')::numeric)) then raise exception ''CONFLICT: Catalogue changed; reopen before saving''; end if;\n    end if;\n  elsif exists(select 1 from public.commercial_addition_terms_approvals where proposal_id=_proposal_id) then raise exception ''VALIDATION_FAILED: Detailed terms cannot be removed'';\n  end if;\n'||needle);
 needle:='  return result_id;';
 definition:=replace(definition,needle,E'  if s->''commercial'' is not null then\n    update public.proposals set validity_days=(s#>>''{commercial,validityDays}'')::int,language=s#>>''{commercial,language}'',proposal_date=(s#>>''{commercial,proposalDate}'')::date where id=result_id;\n    insert into public.commercial_addition_terms_approvals(proposal_id,fingerprint,authorized_by) select id,private.addition_terms_fingerprint(p),auth.uid() from public.proposals p where id=result_id\n    on conflict(proposal_id) do update set fingerprint=excluded.fingerprint,authorized_by=excluded.authorized_by,authorized_at=now();\n  end if;\n'||needle);
 execute definition;

 select pg_get_functiondef('private.check_commercial_addition(uuid)'::regprocedure) into definition;
 needle:=' d:=p.business_config->''commercial_addition''; b:=d->''baseline''; s:=d->''selection''; q:=d->''quote'';';
 if position(needle in definition)=0 then raise exception 'Unexpected addition check function';end if;
 definition:=replace(definition,needle,needle||E'\n perform private.check_addition_detailed_terms(d,false);\n if s->''commercial'' is not null or exists(select 1 from public.commercial_addition_terms_approvals where proposal_id=p.id) then\n  if not exists(select 1 from public.commercial_addition_terms_approvals where proposal_id=p.id and fingerprint=private.addition_terms_fingerprint(p)) then raise exception ''CONFLICT: Save and authorize the detailed commercial terms again'';end if;\n end if;');
 definition:=replace(definition,'(x->>''annual'')::numeric*(q->>''months'')::numeric','coalesce((x->>''initialAnnual'')::numeric,(x->>''annual'')::numeric)*(q->>''months'')::numeric');
 definition:=replace(definition,'or p.total_year_1 <= 0','or p.total_year_1 < 0 or (p.total_year_1=0 and s->''commercial'' is null)');
 execute definition;

 select pg_get_functiondef('public.validate_proposal(uuid,text,text)'::regprocedure) into definition;
 needle:='IF coalesce(p.total_year_1,0) <= 0 THEN';
 if position(needle in definition)=0 then raise exception 'Unexpected validation function';end if;
 execute replace(definition,needle,'IF coalesce(p.total_year_1,0) <= 0 AND NOT (p.source_type = ''client'' AND p.business_config#>>''{commercial_addition,selection,commercial,version}'' = ''2'' AND p.total_year_1=0) THEN');

 select pg_get_functiondef('public.commercial_addition_action(uuid,text,jsonb)'::regprocedure) into definition;
 needle:=' if coalesce(_details->>''payment_confirmed'',''false'') <> ''true'' or coalesce(btrim(_details->>''reference''),'''')='''' then raise exception ''PAYMENT_REQUIRED: Confirm payment/activation conditions and enter the reference.''; end if;';
 if position(needle in definition)=0 then raise exception 'Unexpected activation function';end if;
 definition:=replace(definition,needle,E' if f.awarded_snapshot#>>''{selection,commercial,version}''=''2'' and (f.awarded_snapshot#>>''{selection,commercial,payment,activation}''=''on_award'' or (f.awarded_snapshot#>>''{quote,dueNow}'')::numeric=0) then\n  if coalesce(_details->>''activation_authorized'',''false'')<>''true'' or coalesce(btrim(_details->>''reference''),'''')='''' then raise exception ''AUTHORIZATION_REQUIRED: Confirm the agreed activation condition and its reference'';end if;\n else\n'||needle||E'\n end if;');
 execute definition;
end $$;
