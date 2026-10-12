-- Original TEST calculation and renewal-revenue helpers (functions only).
-- Source metadata captured read-only. No remote records/secrets. CI only.
-- Full TEST trigger stack is NOT included in this scoped E2E run.

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recalculate_contract_total(_contract_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sum numeric(12,2);
  _adj numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO _sum
    FROM public.contract_lines WHERE contract_id = _contract_id;

  SELECT COALESCE(manual_adjustment_amount, 0) INTO _adj
    FROM public.contracts WHERE id = _contract_id;

  UPDATE public.contracts
     SET calculated_total = _sum + _adj
   WHERE id = _contract_id;

  RETURN _sum + _adj;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.contract_lines_refresh_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_contract_total(OLD.contract_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_contract_total(NEW.contract_id);
    IF TG_OP = 'UPDATE' AND OLD.contract_id <> NEW.contract_id THEN
      PERFORM public.recalculate_contract_total(OLD.contract_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.contracts_refresh_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.manual_adjustment_amount IS DISTINCT FROM NEW.manual_adjustment_amount) THEN
    PERFORM public.recalculate_contract_total(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.renewal_line_class(_line_type text, _description text, _is_recurring boolean DEFAULT true)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(_is_recurring, true) = false THEN 'one_time'
    WHEN lower(btrim(coalesce(_line_type,''))) IN ('license','licence','sat','s&at') THEN 'core_license'
    WHEN lower(btrim(coalesce(_line_type,''))) IN ('mww_web','web') THEN 'web_access'
    WHEN regexp_replace(lower(btrim(coalesce(_description,''))), '[^a-z0-9]', '', 'g') IN
         ('sat','sta','sandat','supportandmaintenance','supportmaintenance','license','licence',
          'annuallicense','annuallicence','corelicense','corelicence','licenseannual','softwareassurance')
      THEN 'core_license'
    WHEN regexp_replace(lower(btrim(coalesce(_description,''))), '[^a-z0-9]', '', 'g') IN
         ('web','mwwweb','manwinwinweb','webaccess','webaccesses','mwwwebaccess','mwwwebaccesses',
          'additionalwebaccess','additionalwebaccesses','webusers','webuser')
      THEN 'web_access'
    WHEN lower(btrim(coalesce(_line_type,''))) = 'implementation' THEN 'one_time'
    ELSE 'other'
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.renewal_line_type_for(_name text, _category text, _recurring boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(coalesce(_name,'')) ~ 's&at|support' THEN 'sat'
    WHEN lower(coalesce(_name,'')) ~ 'hosting|saas' THEN 'hosting'
    WHEN lower(coalesce(_name,'')) ~ 'web' THEN 'mww_web'
    WHEN lower(coalesce(_name,'')) ~ 'licen' THEN 'license'
    WHEN lower(coalesce(_name,'')) ~ 'module|módulo' THEN 'module'
    WHEN lower(coalesce(_name,'')) ~ 'plugin' THEN 'plugin'
    WHEN lower(coalesce(_name,'')) ~ 'implement' THEN 'implementation'
    WHEN lower(coalesce(_name,'')) ~ 'training|forma' THEN 'training'
    WHEN _recurring THEN 'license'
    ELSE 'other'
  END;
$function$
;

CREATE OR REPLACE FUNCTION private.license_is_perpetual(_model text, _periodicity text, _product text, _edition text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT lower(coalesce(_periodicity,'')) = 'perpetual'
      OR lower(replace(replace(coalesce(_model,''),'-',''),' ','')) IN ('keepit','perpetual')
      OR lower(replace(coalesce(_product,''),'-','')) LIKE '%keepit%'
      OR lower(replace(coalesce(_edition,''),'-','')) LIKE '%keepit%';
$function$
;

CREATE OR REPLACE FUNCTION public.renewal_closure_record_revenue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _currency text;
  _partner uuid;
  _recurring numeric := coalesce(NEW.renewed_recurring_value, 0);
  _one_time numeric := coalesce(NEW.one_time_value, 0);
  _eff date := coalesce(NEW.renewal_effective_date, NEW.renewal_date, current_date);
  _rec_ref text := 'renewal:' || NEW.id::text || ':recurring';
  _one_ref text := 'renewal:' || NEW.id::text || ':one_time';
  _rec_id uuid;
  _one_id uuid;
  _total numeric := 0;
BEGIN
  IF coalesce(NEW.outcome, '') <> 'renewed' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(ct.currency, 'EUR') INTO _currency
    FROM public.contracts ct WHERE ct.id = NEW.contract_id;
  _currency := coalesce(_currency, 'EUR');

  _partner := coalesce(NEW.partner_uuid, (SELECT cl.partner_uuid FROM public.clients cl WHERE cl.id = NEW.client_id));

  IF _recurring > 0 THEN
    INSERT INTO public.client_revenue_history (
      client_id, partner_id, contract_id, renewal_id, proposal_id,
      revenue_type, amount, currency, revenue_date, source, source_reference, notes)
    VALUES (NEW.client_id, _partner, NEW.contract_id, NEW.id, NEW.closed_proposal_id,
      'renewal', _recurring, _currency, _eff, 'renewal_closure', _rec_ref,
      'Recurring value billed when the renewal was closed as Renewed.')
    ON CONFLICT (client_id, source_reference) DO NOTHING;
  END IF;

  IF _one_time > 0 THEN
    INSERT INTO public.client_revenue_history (
      client_id, partner_id, contract_id, renewal_id, proposal_id,
      revenue_type, amount, currency, revenue_date, source, source_reference, notes)
    VALUES (NEW.client_id, _partner, NEW.contract_id, NEW.id, NEW.closed_proposal_id,
      'implementation', _one_time, _currency, _eff, 'renewal_closure', _one_ref,
      'One-time implementation value billed when the renewal was closed as Renewed.')
    ON CONFLICT (client_id, source_reference) DO NOTHING;
  END IF;

  SELECT id INTO _rec_id FROM public.client_revenue_history
   WHERE client_id = NEW.client_id AND source_reference = _rec_ref;
  SELECT id INTO _one_id FROM public.client_revenue_history
   WHERE client_id = NEW.client_id AND source_reference = _one_ref;

  SELECT coalesce(sum(amount), 0) INTO _total FROM public.client_revenue_history
   WHERE client_id = NEW.client_id
     AND source = 'renewal_closure'
     AND source_reference IN (_rec_ref, _one_ref);

  IF round(_total, 2) <> round(_recurring + _one_time, 2) THEN
    RAISE EXCEPTION 'REVENUE_RECONCILIATION_FAILED: recorded % expected %',
      _total, (_recurring + _one_time);
  END IF;

  NEW.closure_snapshot := coalesce(NEW.closure_snapshot, '{}'::jsonb) || jsonb_build_object(
    'revenue', jsonb_build_object(
      'currency', _currency,
      'total', _total,
      'recurring', jsonb_build_object('id', _rec_id, 'amount', _recurring,
        'revenue_type', 'renewal', 'source_reference', _rec_ref),
      'one_time', jsonb_build_object('id', _one_id, 'amount', _one_time,
        'revenue_type', 'implementation', 'source_reference', _one_ref)));

  RETURN NEW;
END;
$function$
;
