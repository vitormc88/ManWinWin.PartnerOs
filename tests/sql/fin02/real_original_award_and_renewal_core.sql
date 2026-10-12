-- Read-only PROD financial SQL function source snapshot, 2026-10-11.
-- Both definitions confirmed identical to TEST prior to FIN02 by MD5 parity.
-- Source code only; no client records/credentials. Runs ONLY in disposable CI.
-- Functions are intentionally not exercised here until full dependency/RLS clone.

CREATE OR REPLACE FUNCTION public.award_deal_proposal(_deal_id uuid, _proposal_id uuid, _existing_client_id uuid, _license jsonb, _contract_lines jsonb, _start_date date DEFAULT CURRENT_DATE, _notice_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d public.deals%ROWTYPE;
  p public.proposals%ROWTYPE;
  c public.clients%ROWTYPE;
  l public.licenses%ROWTYPE;
  ct public.contracts%ROWTYPE;
  r public.renewals%ROWTYPE;
  _other uuid;
  _partner uuid;
  _end_date date;
  _initial numeric;
  _recurring numeric;
  _line_sum numeric := 0;
  _line jsonb;
  _module text;
  _mode text;
  _family text;
  _license_type text;
  _license_model text;
  _hosting text;
  _bo integer;
  _web integer;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access('clients', 'edit')
     
     OR NOT public.can_manage_deal(_deal_id) THEN
    RAISE EXCEPTION 'AWARD_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d FROM public.deals WHERE id = _deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEAL_NOT_FOUND'; END IF;
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND OR p.source_type <> 'deal' OR p.deal_id IS DISTINCT FROM d.id THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_FROM_DEAL';
  END IF;
  IF p.status NOT IN ('Ready', 'Sent', 'Accepted', 'Won') THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_ELIGIBLE: mark the awarded proposal Ready before conversion';
  END IF;
  IF d.stage = 'Lost' THEN RAISE EXCEPTION 'DEAL_IS_LOST'; END IF;

  SELECT id INTO _other FROM public.proposals
   WHERE deal_id = d.id AND status = 'Won' AND id <> p.id LIMIT 1;
  IF _other IS NOT NULL THEN RAISE EXCEPTION 'ANOTHER_PROPOSAL_ALREADY_AWARDED'; END IF;

  SELECT * INTO l FROM public.licenses
   WHERE is_draft = false
     AND (deal_id = d.id OR source_proposal_id IN
       (SELECT id FROM public.proposals WHERE deal_id = d.id))
   ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF l.source_proposal_id = p.id AND l.contract_id IS NOT NULL AND d.stage = 'Won' THEN
      SELECT * INTO ct FROM public.contracts WHERE id = l.contract_id;
      SELECT * INTO r FROM public.renewals WHERE license_id = l.id AND contract_id = ct.id
        ORDER BY created_at LIMIT 1;
      RETURN jsonb_build_object('already_awarded', true, 'client_id', l.client_id,
        'license_id', l.id, 'contract_id', ct.id, 'renewal_id', r.id);
    END IF;
    RAISE EXCEPTION 'DEAL_ALREADY_OPERATIONALIZED';
  END IF;

  IF d.partner_id IS NOT NULL THEN
    IF d.partner_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'DEAL_PARTNER_UNRESOLVED';
    END IF;
    _partner := d.partner_id::uuid;
  END IF;

  IF d.client_id IS NOT NULL AND _existing_client_id IS DISTINCT FROM d.client_id THEN
    RAISE EXCEPTION 'DEAL_CLIENT_MISMATCH';
  END IF;
  IF _existing_client_id IS NOT NULL THEN
    SELECT * INTO c FROM public.clients WHERE id = _existing_client_id FOR UPDATE;
    IF NOT FOUND OR NOT public.can_manage_client(c.id)
       OR c.partner_uuid IS DISTINCT FROM _partner THEN
      RAISE EXCEPTION 'CLIENT_NOT_IN_DEAL_SCOPE' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF d.client_id IS NOT NULL THEN RAISE EXCEPTION 'DEAL_CLIENT_REQUIRED'; END IF;
    INSERT INTO public.clients (client_code, commercial_name, short_name, country,
      partner_uuid, source_deal_id, source_proposal_id, status)
    VALUES (
      upper(left(coalesce(d.country, 'XX'), 2)) || '-' ||
        upper(left(regexp_replace(d.company_name, '[^A-Za-z0-9]', '', 'g'), 3)) || '-' ||
        upper(left(replace(gen_random_uuid()::text, '-', ''), 8)),
      d.company_name, left(d.company_name, 32), d.country, _partner, d.id, p.id, 'Active'
    ) RETURNING * INTO c;
  END IF;

  _family := _license->>'product_family';
  _mode := _license->>'proposal_mode';
  _license_type := _license->>'license_type';
  _license_model := _license->>'license_model';
  _hosting := _license->>'hosting';
  _initial := (_license->>'initial_contract_value')::numeric;
  _recurring := (_license->>'recurring_contract_value')::numeric;
  IF _family IS DISTINCT FROM p.product_family OR _initial IS NULL OR _initial <= 0
     OR _recurring IS NULL OR _recurring < 0 OR _license_type IS NULL
     OR _license_model NOT IN ('SaaS', 'Perpetual')
     OR _hosting NOT IN ('SaaS', 'On-Premise') THEN
    RAISE EXCEPTION 'INVALID_AWARDED_LICENSE';
  END IF;
  IF p.proposal_mode = 'compare_keepit_useit' THEN
    IF _mode NOT IN ('KeepIT', 'UseIT') THEN RAISE EXCEPTION 'AWARDED_MODE_REQUIRED'; END IF;
  ELSIF abs(_initial - coalesce(p.total_year_1, 0)) > 0.01
     OR abs(_recurring - coalesce(p.total_recurring, 0)) > 0.01 THEN
    RAISE EXCEPTION 'AWARDED_VALUE_DIFFERS_FROM_PROPOSAL';
  END IF;
  IF _family = 'Business' AND
     (_license_type <> 'Business ' || _mode OR
      _license_model <> CASE WHEN _mode = 'KeepIT' THEN 'Perpetual' ELSE 'SaaS' END) THEN
    RAISE EXCEPTION 'INVALID_BUSINESS_AWARD';
  END IF;
  IF _start_date IS NULL OR _notice_days NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_PERIOD';
  END IF;
  _end_date := (_start_date + interval '1 year')::date;

  IF jsonb_typeof(_contract_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_contract_lines) = 0 THEN
    RAISE EXCEPTION 'CONTRACT_LINES_REQUIRED';
  END IF;
  FOR _line IN SELECT value FROM jsonb_array_elements(_contract_lines) LOOP
    IF coalesce(_line->>'description', '') = '' OR (_line->>'amount')::numeric IS NULL THEN
      RAISE EXCEPTION 'INVALID_CONTRACT_LINE';
    END IF;
    _line_sum := _line_sum + (_line->>'amount')::numeric;
  END LOOP;
  IF abs(_line_sum - _initial) > 0.01 THEN
    RAISE EXCEPTION 'CONTRACT_TOTAL_MUST_MATCH_AWARDED_VALUE';
  END IF;

  _bo := coalesce((_license->>'included_backoffice')::integer, 0)
       + coalesce((_license->>'additional_backoffice')::integer, 0);
  _web := coalesce((_license->>'included_web')::integer, 0)
        + coalesce((_license->>'additional_web')::integer, 0);
  INSERT INTO public.licenses (client_id, deal_id, proposal_id, source_proposal_id,
    license_model, product, license_start_date, license_end_date, periodicity,
    billing_frequency, contract_value, initial_contract_value, recurring_contract_value,
    num_users, backoffice_users, backoffice_employee_users, web_accesses, mobile_users,
    api_access, sat_active, sat_end_date, notes, is_draft, database_type)
  VALUES (c.id, d.id, p.id, p.id, _license_model, _license_type, _start_date,
    _end_date, 'Annual', 'Annual', _initial, _initial, _recurring,
    _bo + _web, _bo, coalesce((_license->>'included_backoffice')::integer, 0),
    _web, coalesce((_license->>'additional_web')::integer, 0),
    coalesce((_license->>'api_enabled')::boolean, false),
    _family = 'Professional', CASE WHEN _family = 'Professional' THEN _end_date END,
    _license->>'notes', false, _hosting)
  RETURNING * INTO l;

  IF jsonb_typeof(_license->'modules') = 'array' THEN
    FOR _module IN SELECT value FROM jsonb_array_elements_text(_license->'modules') LOOP
      INSERT INTO public.licensed_modules (license_id, module_name, enabled, license_type)
      VALUES (l.id, _module, true, _license_type);
    END LOOP;
  END IF;

  INSERT INTO public.contracts (client_id, source_proposal_id, is_imported,
    contract_start_date, contract_end_date, notice_period_days, currency, observations)
  VALUES (c.id, p.id, false, _start_date, _end_date, _notice_days, 'EUR',
    'Auto-generated from awarded Proposal v' || p.version::text)
  RETURNING * INTO ct;

  FOR _line IN SELECT value FROM jsonb_array_elements(_contract_lines) LOOP
    INSERT INTO public.contract_lines (contract_id, client_id, line_type, description,
      amount, currency, billing_frequency, related_license_id, source, source_item_id,
      start_date, end_date)
    VALUES (ct.id, c.id, coalesce(_line->>'line_type', 'other'), _line->>'description',
      (_line->>'amount')::numeric, 'EUR', coalesce(_line->>'billing_frequency', 'Annual'),
      l.id, 'proposal', nullif(_line->>'source_item_id', '')::uuid,
      _start_date, _end_date);
  END LOOP;
  UPDATE public.licenses SET contract_id = ct.id WHERE id = l.id;

  IF _family <> 'Express' THEN
    INSERT INTO public.renewals (client_id, partner_uuid, contract_id, license_id,
      target_type, target_id, renewal_type, renewal_date, notice_period_days,
      alert_window_days, estimated_value, billing_frequency, status, source_proposal_id)
    VALUES (c.id, _partner, ct.id, l.id, 'contract', ct.id,
      CASE WHEN _family = 'Business' THEN 'Business ' || _mode || ' Renewal'
           WHEN _family = 'Professional' THEN _license_type || ' Annual Renewal'
           ELSE _family || ' Renewal' END,
      _end_date, _notice_days, _notice_days, _recurring, 'Annual', 'Upcoming', p.id)
    RETURNING * INTO r;
  END IF;

  UPDATE public.clients SET license_type = _license_type,
    cloud_onpremise = CASE WHEN _hosting = 'On-Premise' THEN 'On-premise' ELSE 'SaaS' END
    WHERE id = c.id;
  UPDATE public.deals SET client_id = c.id, stage = 'Won', status = 'Won',
    probability = 100, stage_entered_at = now(), expected_value = _initial,
    total_value = _initial WHERE id = d.id;
  UPDATE public.proposals SET status = 'Won', client_id = c.id,
    license_id = l.id, contract_id = ct.id, updated_at = now() WHERE id = p.id;

  INSERT INTO public.lifecycle_events (client_id, event_type, event_title,
    event_description, actor_id, source_proposal_id, source_license_id,
    source_contract_id, source_renewal_id, metadata)
  VALUES (c.id, 'proposal_won', 'Proposal awarded and operationalized',
    'Deal ' || d.company_name || ' awarded to Proposal v' || p.version::text,
    auth.uid(), p.id, l.id, ct.id, r.id,
    jsonb_build_object('deal_id', d.id, 'awarded_value', _initial,
      'recurring_value', _recurring, 'mode', _mode));

  RETURN jsonb_build_object('already_awarded', false, 'client_id', c.id,
    'license_id', l.id, 'contract_id', ct.id, 'renewal_id', r.id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.close_renewal_core(_renewal_id uuid, _outcome text, _proposal_id uuid DEFAULT NULL::uuid, _closing_notes text DEFAULT NULL::text, _loss_reason text DEFAULT NULL::text, _effective_date date DEFAULT NULL::date, _next_renewal_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.renewals%ROWTYPE;
  p public.proposals%ROWTYPE;
  c public.contracts%ROWTYPE;
  _actor uuid := auth.uid();
  _actor_name text;
  _client_name text;
  _eff date;
  _next date;
  _interval interval;
  _prev_recurring numeric := 0;
  _new_recurring numeric := 0;
  _one_time numeric := 0;
  _snapshot jsonb;
  _next_id uuid;
  _matched int;
  _plan_change boolean := false;
  _license_id uuid;
  _lic_count int := 0;
  _target_product text;
  _recurring_total numeric := 0;
  _unrelated_recurring numeric := 0;
  _applied_one_time numeric := 0;
  it record;
BEGIN
  IF _outcome NOT IN ('renewed','lost') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME: outcome must be renewed or lost';
  END IF;
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RENEWAL_NOT_FOUND'; END IF;

  IF NOT public.can_manage_client(r.client_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: you cannot close renewals for this client';
  END IF;

  -- idempotency: already closed → return the recorded result
  IF r.closed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'renewal_id', r.id, 'outcome', r.outcome, 'already_closed', true,
      'closed_at', r.closed_at, 'next_renewal_id', r.next_renewal_id,
      'contract_id', r.contract_id, 'license_id', r.license_id,
      'previous_recurring_value', r.previous_recurring_value,
      'renewed_recurring_value', r.renewed_recurring_value,
      'one_time_value', r.one_time_value
    );
  END IF;

  SELECT commercial_name INTO _client_name FROM public.clients WHERE id = r.client_id;
  SELECT coalesce(full_name, email) INTO _actor_name FROM public.profiles WHERE id = _actor;

  IF _proposal_id IS NOT NULL THEN
    SELECT * INTO p FROM public.proposals WHERE id = _proposal_id AND renewal_id = r.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_LINKED: proposal does not belong to this renewal'; END IF;
  ELSE
    SELECT * INTO p FROM public.proposals WHERE renewal_id = r.id
      ORDER BY version DESC, created_at DESC LIMIT 1;
  END IF;

  IF _outcome = 'lost' THEN
    IF _loss_reason IS NULL OR btrim(_loss_reason) = '' THEN
      RAISE EXCEPTION 'LOSS_REASON_REQUIRED';
    END IF;

    UPDATE public.renewals SET
      status = 'Lost', outcome = 'lost', closed_at = now(), closed_by = _actor,
      closing_notes = _closing_notes, loss_reason = _loss_reason,
      closed_proposal_id = p.id, renewal_effective_date = coalesce(_effective_date, r.renewal_date),
      previous_recurring_value = r.estimated_value,
      renewed_recurring_value = NULL, one_time_value = NULL,
      final_value = 0, updated_at = now()
    WHERE id = r.id;

    IF p.id IS NOT NULL THEN
      UPDATE public.proposals SET status = 'Lost', updated_at = now() WHERE id = p.id;
    END IF;

    INSERT INTO public.renewal_activities (renewal_id, action, from_status, to_status, performed_by, notes)
    VALUES (r.id, 'renewal_closed_lost', r.status, 'Lost', coalesce(_actor_name, _actor::text),
            'Lost — ' || _loss_reason || coalesce(' · ' || _closing_notes, ''));

    INSERT INTO public.lifecycle_events (client_id, event_type, event_title, event_description,
      actor_id, actor_name, source_proposal_id, source_renewal_id, source_contract_id, metadata, occurred_at)
    VALUES (r.client_id, 'renewal_lost', 'Renewal lost',
      'Renewal closed as Lost — ' || _loss_reason, _actor, _actor_name, p.id, r.id, r.contract_id,
      jsonb_build_object('outcome','lost','loss_reason',_loss_reason,'notes',_closing_notes,
                         'previous_recurring_value', r.estimated_value),
      coalesce(_effective_date, r.renewal_date, current_date));

    RETURN jsonb_build_object('renewal_id', r.id, 'outcome', 'lost', 'already_closed', false,
                              'proposal_id', p.id, 'next_renewal_id', NULL);
  END IF;

  -- ── Renewed ────────────────────────────────────────────────────────────────
  IF p.id IS NULL THEN RAISE EXCEPTION 'PROPOSAL_REQUIRED: no renewal proposal found'; END IF;
  IF p.status NOT IN ('Ready','Sent','Accepted','Won') THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_ELIGIBLE: proposal must be Ready or later (current: %)', p.status;
  END IF;
  IF p.product_family = 'Business' AND (p.license_model IS NULL OR btrim(p.license_model) = '') THEN
    RAISE EXCEPTION 'VARIANT_UNRESOLVED: the commercial variant must be resolved before closing';
  END IF;
  IF coalesce(p.total_year_1, 0) <= 0 THEN
    RAISE EXCEPTION 'PROPOSAL_VALUE_MISSING: the proposal has no commercial value';
  END IF;

  SELECT * INTO c FROM public.contracts
   WHERE id = coalesce(r.contract_id, p.contract_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO c FROM public.contracts WHERE client_id = r.client_id
      ORDER BY coalesce(contract_end_date, contract_start_date) DESC NULLS LAST, created_at DESC
      LIMIT 1 FOR UPDATE;
  END IF;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND: no contract to renew for this client'; END IF;

  _eff := coalesce(_effective_date, r.renewal_date, current_date);
  _interval := CASE lower(coalesce(r.billing_frequency,''))
                 WHEN 'monthly' THEN interval '1 month'
                 WHEN 'quarterly' THEN interval '3 months'
                 WHEN 'semiannual' THEN interval '6 months'
                 WHEN 'semestral' THEN interval '6 months'
                 WHEN 'annual' THEN interval '1 year'
                 WHEN 'annually' THEN interval '1 year'
                 WHEN 'yearly' THEN interval '1 year'
                 ELSE NULL END;
  _next := coalesce(_next_renewal_date, (_eff + _interval)::date);
  IF _next IS NULL THEN
    RAISE EXCEPTION 'Next renewal date requires confirmation: this contract does not follow a standard period (%).',
      coalesce(r.billing_frequency, 'unknown');
  END IF;
  IF _next <= _eff THEN RAISE EXCEPTION 'INVALID_NEXT_DATE: next renewal date must be after the effective date'; END IF;

  SELECT coalesce(sum(amount) FILTER (
           WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')), 0)
    INTO _prev_recurring
    FROM public.contract_lines WHERE contract_id = c.id;
  IF _prev_recurring = 0 THEN _prev_recurring := coalesce(c.contract_value, c.total_value, 0); END IF;

  _new_recurring := coalesce(p.total_recurring, 0);
  _one_time := greatest(coalesce(p.total_year_1,0) - _new_recurring, 0);

  _snapshot := jsonb_build_object(
    'captured_at', now(),
    'renewal', to_jsonb(r),
    'contract', to_jsonb(c),
    'contract_lines', coalesce((SELECT jsonb_agg(to_jsonb(cl) ORDER BY cl.created_at)
                                FROM public.contract_lines cl WHERE cl.contract_id = c.id), '[]'::jsonb)
  );

  _plan_change := coalesce(p.renewal_change_mode, 'straight') IN ('upgrade','downgrade')
                  AND p.target_plan IS NOT NULL;

  -- ── Canonical license resolution ───────────────────────────────────────────
  _license_id := coalesce(r.license_id, p.license_id);
  IF _license_id IS NULL THEN
    SELECT count(*) INTO _lic_count FROM public.licenses l
     WHERE l.contract_id = c.id
       AND coalesce(l.is_draft,false) = false
       AND l.replaced_by_license_id IS NULL
       AND lower(coalesce(l.license_status,'active')) NOT IN ('cancelled','canceled','terminated','replaced','inactive');
    IF _lic_count = 1 THEN
      SELECT l.id INTO _license_id FROM public.licenses l
       WHERE l.contract_id = c.id
         AND coalesce(l.is_draft,false) = false
         AND l.replaced_by_license_id IS NULL
         AND lower(coalesce(l.license_status,'active')) NOT IN ('cancelled','canceled','terminated','replaced','inactive');
    ELSIF _lic_count > 1 THEN
      RAISE EXCEPTION 'LICENSE_AMBIGUOUS: % current licenses linked to contract %; link the renewal to a license before closing', _lic_count, c.id;
    END IF;
  END IF;
  IF _license_id IS NULL THEN
    SELECT count(*) INTO _lic_count FROM public.licenses l
     WHERE l.client_id = r.client_id
       AND coalesce(l.is_draft,false) = false
       AND l.replaced_by_license_id IS NULL
       AND lower(coalesce(l.license_status,'active')) NOT IN ('cancelled','canceled','terminated','replaced','inactive');
    IF _lic_count = 1 THEN
      SELECT l.id INTO _license_id FROM public.licenses l
       WHERE l.client_id = r.client_id
         AND coalesce(l.is_draft,false) = false
         AND l.replaced_by_license_id IS NULL
         AND lower(coalesce(l.license_status,'active')) NOT IN ('cancelled','canceled','terminated','replaced','inactive');
    ELSIF _lic_count > 1 THEN
      RAISE EXCEPTION 'LICENSE_AMBIGUOUS: % current licenses for this client; link the renewal to a license before closing', _lic_count;
    END IF;
  END IF;
  IF _license_id IS NULL AND (_plan_change OR p.entitlements IS NOT NULL) THEN
    RAISE EXCEPTION 'LICENSE_UNRESOLVED: no current license could be resolved for this renewal';
  END IF;

  -- ── Canonical supersession of equivalent legacy lines ──────────────────────
  IF _plan_change THEN
    DELETE FROM public.contract_lines cl
     WHERE cl.contract_id = c.id
       AND public.renewal_line_class(cl.line_type, cl.description,
             lower(coalesce(cl.billing_frequency,'annual')) NOT IN ('one_time','one-time','once'))
           IN ('core_license','web_access')
       AND (cl.source_item_id IS NULL
            OR cl.source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id))
       AND EXISTS (
         SELECT 1 FROM public.proposal_items pi
          WHERE pi.proposal_id = p.id
            AND coalesce(pi.is_recurring, true)
            AND coalesce(pi.net_total,0) <> 0
            AND public.renewal_line_class(pi.line_type, pi.item_name, true)
                = public.renewal_line_class(cl.line_type, cl.description, true));
  END IF;

  -- apply ONLY the approved proposal lines onto the current contract configuration
  FOR it IN SELECT * FROM public.proposal_items WHERE proposal_id = p.id LOOP
    UPDATE public.contract_lines cl
       SET amount = it.net_total,
           start_date = _eff,
           end_date = (_next - 1),
           billing_frequency = CASE WHEN it.is_recurring THEN coalesce(cl.billing_frequency,'annual') ELSE 'one_time' END,
           source_item_id = it.id,
           updated_at = now()
     WHERE cl.contract_id = c.id
       AND lower(btrim(cl.description)) = lower(btrim(it.item_name));
    GET DIAGNOSTICS _matched = ROW_COUNT;

    IF _matched = 0 AND it.net_total <> 0 THEN
      INSERT INTO public.contract_lines (contract_id, client_id, line_type, description, amount,
        currency, billing_frequency, start_date, end_date, source, source_item_id, notes)
      VALUES (c.id, c.client_id,
        public.renewal_line_type_for(it.item_name, it.category, it.is_recurring),
        it.item_name, it.net_total, 'EUR',
        CASE WHEN it.is_recurring THEN 'annual' ELSE 'one_time' END,
        _eff, (_next - 1), 'renewal', it.id,
        'Added by renewal closure ' || r.id::text);
    END IF;
  END LOOP;

  -- roll the period on untouched recurring lines (straight renewal preservation)
  UPDATE public.contract_lines
     SET start_date = _eff, end_date = (_next - 1), updated_at = now()
   WHERE contract_id = c.id
     AND lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')
     AND (end_date IS NULL OR end_date = c.contract_end_date)
     AND (source_item_id IS NULL OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id));

  -- ── Reconciliation against the approved proposal ───────────────────────────
  SELECT
    coalesce(sum(amount) FILTER (
      WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')), 0),
    coalesce(sum(amount) FILTER (
      WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')
        AND (source_item_id IS NULL OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id))
        AND public.renewal_line_class(line_type, description, true) = 'other'), 0),
    coalesce(sum(amount) FILTER (
      WHERE lower(coalesce(billing_frequency,'annual')) IN ('one_time','one-time','once')
        AND source_item_id IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id)), 0)
    INTO _recurring_total, _unrelated_recurring, _applied_one_time
  FROM public.contract_lines WHERE contract_id = c.id;

  IF abs((_recurring_total - _unrelated_recurring) - _new_recurring) > 0.01 THEN
    RAISE EXCEPTION 'RECONCILIATION_FAILED: contract recurring % (unrelated %) does not match approved recurring %',
      _recurring_total, _unrelated_recurring, _new_recurring;
  END IF;
  IF abs(_applied_one_time - _one_time) > 0.01 THEN
    RAISE EXCEPTION 'RECONCILIATION_FAILED: contract one-time % does not match approved one-time %',
      _applied_one_time, _one_time;
  END IF;

  UPDATE public.contracts SET
    contract_start_date = _eff,
    contract_end_date = (_next - 1),
    contract_value = _recurring_total,
    source_proposal_id = p.id,
    updated_at = now()
  WHERE id = c.id;

  -- The real license configuration only changes when the renewal is Renewed.
  IF _license_id IS NOT NULL THEN
    _target_product := CASE
      WHEN NOT _plan_change THEN NULL
      WHEN coalesce(p.product_family,'Professional') = 'Professional'
        THEN 'Professional ' || p.target_plan::text
      ELSE p.product_family END;

    UPDATE public.licenses SET
      product = coalesce(_target_product, product),
      edition = coalesce(_target_product, edition),
      backoffice_users = coalesce((p.entitlements->'backoffice'->>'total')::int, backoffice_users),
      web_accesses     = coalesce((p.entitlements->'web'->>'total')::int, web_accesses),
      included_backoffice_users = coalesce((p.entitlements->'backoffice'->>'included')::numeric, included_backoffice_users),
      included_web_accesses     = coalesce((p.entitlements->'web'->>'included')::numeric, included_web_accesses),
      billable_backoffice_users = coalesce((p.entitlements->'backoffice'->>'billable')::numeric, billable_backoffice_users),
      billable_web_accesses     = coalesce((p.entitlements->'web'->>'billable')::numeric, billable_web_accesses),
      entitlement_provenance    = coalesce(p.entitlements, entitlement_provenance),
      -- Perpetual (KeepIT) rights are not annual: an S&AT/Web renewal never resets them.
      license_start_date = CASE WHEN private.license_is_perpetual(license_model, periodicity, product, edition) THEN license_start_date ELSE _eff END,
      license_end_date   = CASE WHEN private.license_is_perpetual(license_model, periodicity, product, edition) THEN license_end_date ELSE (_next - 1) END,
      -- Current recurring value follows the reconciled contract lines.
      recurring_contract_value = _recurring_total,
      sat_start_date = CASE WHEN coalesce(sat_active,false) THEN _eff ELSE sat_start_date END,
      sat_end_date   = CASE WHEN coalesce(sat_active,false) THEN (_next - 1) ELSE sat_end_date END,
      contract_id = coalesce(contract_id, c.id),
      updated_at = now()
    WHERE id = _license_id;
  END IF;

  UPDATE public.renewals SET
    status = 'Won', outcome = 'renewed', closed_at = now(), closed_by = _actor,
    closing_notes = _closing_notes, closed_proposal_id = p.id,
    renewal_effective_date = _eff,
    previous_recurring_value = _prev_recurring,
    renewed_recurring_value = _new_recurring,
    one_time_value = _one_time,
    final_value = coalesce(p.total_year_1,0),
    contract_id = c.id,
    license_id = coalesce(license_id, _license_id),
    closure_snapshot = _snapshot,
    updated_at = now()
  WHERE id = r.id;

  UPDATE public.proposals SET status = 'Won', updated_at = now() WHERE id = p.id;

  INSERT INTO public.renewals (client_id, partner_id, partner_uuid, contract_id, license_id,
    renewal_type, renewal_date, status, estimated_value, billing_frequency,
    assigned_owner, assigned_user_id, previous_renewal_id, notes)
  VALUES (r.client_id, r.partner_id, r.partner_uuid, c.id, coalesce(r.license_id, _license_id),
    r.renewal_type, _next, 'Upcoming', _new_recurring, coalesce(r.billing_frequency,'Annual'),
    r.assigned_owner, r.assigned_user_id, r.id,
    'Next cycle created automatically when renewal ' || r.id::text || ' was closed as Renewed.')
  RETURNING id INTO _next_id;

  UPDATE public.renewals SET next_renewal_id = _next_id, updated_at = now() WHERE id = r.id;

  INSERT INTO public.renewal_activities (renewal_id, action, from_status, to_status, performed_by, notes)
  VALUES (r.id, 'renewal_closed_renewed', r.status, 'Won', coalesce(_actor_name, _actor::text),
          'Renewed effective ' || _eff::text || ' · recurring ' || _prev_recurring::text || ' → ' ||
          _new_recurring::text || coalesce(' · ' || _closing_notes, ''));

  INSERT INTO public.lifecycle_events (client_id, event_type, event_title, event_description,
    actor_id, actor_name, source_proposal_id, source_renewal_id, source_contract_id, metadata, occurred_at)
  VALUES (r.client_id, 'renewal_renewed', 'Contract renewed',
    'Renewal closed as Renewed, effective ' || _eff::text || '. Recurring value ' ||
    _prev_recurring::text || ' → ' || _new_recurring::text || '.',
    _actor, _actor_name, p.id, r.id, c.id,
    jsonb_build_object(
      'outcome','renewed',
      'effective_date', _eff,
      'next_renewal_date', _next,
      'previous_recurring_value', _prev_recurring,
      'renewed_recurring_value', _new_recurring,
      'one_time_value', _one_time,
      'license_id', _license_id,
      'notes', _closing_notes,
      'old', jsonb_build_object('contract_start_date', c.contract_start_date,
                                'contract_end_date', c.contract_end_date,
                                'contract_value', c.contract_value),
      'new', jsonb_build_object('contract_start_date', _eff,
                                'contract_end_date', (_next - 1),
                                'contract_value', _recurring_total),
      'next_renewal_id', _next_id,
      'renewal_change_mode', coalesce(p.renewal_change_mode,'straight'),
      'source_plan', p.source_plan,
      'target_plan', CASE WHEN _plan_change THEN p.target_plan ELSE NULL END),
    _eff);

  RETURN jsonb_build_object(
    'renewal_id', r.id, 'outcome', 'renewed', 'already_closed', false,
    'proposal_id', p.id, 'contract_id', c.id, 'license_id', _license_id,
    'effective_date', _eff, 'next_renewal_date', _next, 'next_renewal_id', _next_id,
    'previous_recurring_value', _prev_recurring,
    'renewed_recurring_value', _new_recurring,
    'one_time_value', _one_time);
END;
$function$
;
