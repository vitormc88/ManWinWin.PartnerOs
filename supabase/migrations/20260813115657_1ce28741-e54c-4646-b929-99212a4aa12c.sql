-- Renewal plan changes (upgrade / downgrade)
-- 1. Structured provenance on proposals and proposal lines.
-- 2. save_renewal_proposal persists the new proposal columns.
-- 3. close_renewal applies the plan change to the real license/contract.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS renewal_change_mode text NOT NULL DEFAULT 'straight',
  ADD COLUMN IF NOT EXISTS source_plan integer,
  ADD COLUMN IF NOT EXISTS target_plan integer;

ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_renewal_change_mode_check;
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_renewal_change_mode_check
  CHECK (renewal_change_mode IN ('straight','upgrade','downgrade'));

ALTER TABLE public.proposal_items
  ADD COLUMN IF NOT EXISTS pricing_rule_code text,
  ADD COLUMN IF NOT EXISTS pricing_rule_id uuid,
  ADD COLUMN IF NOT EXISTS source_plan integer,
  ADD COLUMN IF NOT EXISTS target_plan integer,
  ADD COLUMN IF NOT EXISTS line_type text,
  ADD COLUMN IF NOT EXISTS change_kind text,
  ADD COLUMN IF NOT EXISTS gross_delta numeric;

ALTER TABLE public.proposal_items DROP CONSTRAINT IF EXISTS proposal_items_change_kind_check;
ALTER TABLE public.proposal_items
  ADD CONSTRAINT proposal_items_change_kind_check
  CHECK (change_kind IS NULL OR change_kind IN ('unchanged','plan_change','implementation_delta'));

COMMENT ON COLUMN public.proposal_items.gross_delta IS
  'Incremental value of this line versus the current contract (renewal plan changes).';

CREATE OR REPLACE FUNCTION public.close_renewal(_renewal_id uuid, _outcome text, _proposal_id uuid DEFAULT NULL::uuid, _closing_notes text DEFAULT NULL::text, _loss_reason text DEFAULT NULL::text, _effective_date date DEFAULT NULL::date, _next_renewal_date date DEFAULT NULL::date)
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
      'contract_id', r.contract_id,
      'previous_recurring_value', r.previous_recurring_value,
      'renewed_recurring_value', r.renewed_recurring_value,
      'one_time_value', r.one_time_value
    );
  END IF;

  SELECT commercial_name INTO _client_name FROM public.clients WHERE id = r.client_id;
  SELECT coalesce(full_name, email) INTO _actor_name FROM public.profiles WHERE id = _actor;

  -- resolve the closing proposal (optional for Lost)
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

  -- immutable snapshot of the pre-renewal commercial state
  _snapshot := jsonb_build_object(
    'captured_at', now(),
    'renewal', to_jsonb(r),
    'contract', to_jsonb(c),
    'contract_lines', coalesce((SELECT jsonb_agg(to_jsonb(cl) ORDER BY cl.created_at)
                                FROM public.contract_lines cl WHERE cl.contract_id = c.id), '[]'::jsonb)
  );

  -- ── Renewal plan change (upgrade / downgrade) ──────────────────────────────
  -- The superseded core-license lines are removed BEFORE the approved proposal
  -- lines are applied, so the new plan line replaces them instead of stacking
  -- on top. The pre-change state is preserved in closure_snapshot above.
  _plan_change := coalesce(p.renewal_change_mode, 'straight') IN ('upgrade','downgrade')
                  AND p.target_plan IS NOT NULL;
  _license_id := coalesce(r.license_id, p.license_id);

  IF _plan_change THEN
    DELETE FROM public.contract_lines
     WHERE contract_id = c.id
       AND line_type = 'license'
       AND (source_item_id IS NULL
            OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id));
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

  UPDATE public.contracts SET
    contract_start_date = _eff,
    contract_end_date = (_next - 1),
    contract_value = _new_recurring,
    source_proposal_id = p.id,
    updated_at = now()
  WHERE id = c.id;

  -- The real license configuration only changes when the renewal is Renewed.
  IF _plan_change AND _license_id IS NOT NULL THEN
    UPDATE public.licenses SET
      product = 'Professional ' || p.target_plan::text,
      edition = 'Professional ' || p.target_plan::text,
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
    closure_snapshot = _snapshot,
    updated_at = now()
  WHERE id = r.id;

  UPDATE public.proposals SET status = 'Won', updated_at = now() WHERE id = p.id;

  INSERT INTO public.renewals (client_id, partner_id, partner_uuid, contract_id, license_id,
    renewal_type, renewal_date, status, estimated_value, billing_frequency,
    assigned_owner, assigned_user_id, previous_renewal_id, notes)
  VALUES (r.client_id, r.partner_id, r.partner_uuid, c.id, r.license_id,
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
      'notes', _closing_notes,
      'old', jsonb_build_object('contract_start_date', c.contract_start_date,
                                'contract_end_date', c.contract_end_date,
                                'contract_value', c.contract_value),
      'new', jsonb_build_object('contract_start_date', _eff,
                                'contract_end_date', (_next - 1),
                                'contract_value', _new_recurring),
      'next_renewal_id', _next_id,
      'renewal_change_mode', coalesce(p.renewal_change_mode,'straight'),
      'source_plan', p.source_plan,
      'target_plan', CASE WHEN _plan_change THEN p.target_plan ELSE NULL END),
    _eff);

  RETURN jsonb_build_object(
    'renewal_id', r.id, 'outcome', 'renewed', 'already_closed', false,
    'proposal_id', p.id, 'contract_id', c.id,
    'effective_date', _eff, 'next_renewal_date', _next, 'next_renewal_id', _next_id,
    'previous_recurring_value', _prev_recurring,
    'renewed_recurring_value', _new_recurring,
    'one_time_value', _one_time);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_renewal_proposal(_renewal_id uuid, _proposal_id uuid, _payload jsonb, _items jsonb, _performed_by text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _client_id uuid;
  _partner uuid;
  _existing uuid;
  _target uuid;
  _row public.proposals%ROWTYPE;
  _item public.proposal_items%ROWTYPE;
  _e jsonb;
  _is_update boolean;
  _owner_renewal uuid;
  _found boolean;
BEGIN
  SELECT r.client_id INTO _client_id FROM public.renewals r WHERE r.id = _renewal_id;
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Renewal % not found', _renewal_id USING ERRCODE = 'no_data_found';
  END IF;

  _partner := public.renewal_canonical_partner(_renewal_id);

  IF NOT public.can_access_renewal_proposal(_renewal_id, _client_id, _partner) THEN
    RAISE EXCEPTION 'Not authorized for renewal %', _renewal_id USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO _existing FROM public.proposals WHERE renewal_id = _renewal_id FOR UPDATE;

  -- Ownership guard: a supplied proposal id must already belong to THIS renewal.
  IF _proposal_id IS NOT NULL THEN
    SELECT p.renewal_id, true INTO _owner_renewal, _found
    FROM public.proposals p WHERE p.id = _proposal_id FOR UPDATE;

    IF NOT COALESCE(_found, false) THEN
      RAISE EXCEPTION 'Proposal % not found', _proposal_id USING ERRCODE = 'no_data_found';
    END IF;

    IF _owner_renewal IS DISTINCT FROM _renewal_id THEN
      RAISE EXCEPTION 'Proposal % does not belong to renewal %', _proposal_id, _renewal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF _proposal_id IS NOT NULL AND _existing IS NOT NULL AND _existing <> _proposal_id THEN
    RAISE EXCEPTION 'Renewal % already has proposal %', _renewal_id, _existing
      USING ERRCODE = 'unique_violation';
  END IF;

  _target := COALESCE(_proposal_id, _existing);
  _is_update := _target IS NOT NULL;

  _payload := _payload
    || jsonb_build_object(
         'source_type', 'renewal',
         'renewal_id', _renewal_id,
         'client_id', _client_id,
         'partner_uuid', _partner,
         'lead_id', NULL,
         'deal_id', NULL
       );

  IF _is_update THEN
    SELECT * INTO _row FROM public.proposals WHERE id = _target;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proposal % not found', _target USING ERRCODE = 'no_data_found';
    END IF;
    _row := jsonb_populate_record(_row, _payload - 'id' - 'created_at' - 'updated_at');
    _row.id := _target;
    UPDATE public.proposals SET
      source_type = _row.source_type, renewal_id = _row.renewal_id, client_id = _row.client_id,
      partner_uuid = _row.partner_uuid, lead_id = NULL, deal_id = NULL,
      version = _row.version, language = _row.language, plan = _row.plan, status = _row.status,
      hosting = _row.hosting, product_family = _row.product_family, license_model = _row.license_model,
      proposal_mode = _row.proposal_mode, deployment = _row.deployment, business_config = _row.business_config,
      client_name = _row.client_name, project_name = _row.project_name, country = _row.country,
      proposal_date = _row.proposal_date, validity_days = _row.validity_days, payment_terms = _row.payment_terms,
      notes = _row.notes, implementation_type = _row.implementation_type, per_diem = _row.per_diem,
      discount_pct = _row.discount_pct, discount_scope = _row.discount_scope,
      software_discount_pct = _row.software_discount_pct, services_discount_pct = _row.services_discount_pct,
      include_requests_module = _row.include_requests_module, web_users = _row.web_users,
      service_days = _row.service_days, software_subtotal = _row.software_subtotal,
      services_subtotal = _row.services_subtotal, discount_amount = _row.discount_amount,
      total_year_1 = _row.total_year_1, total_recurring = _row.total_recurring,
      contract_id = _row.contract_id, license_id = _row.license_id,
      renewal_change_mode = _row.renewal_change_mode,
      source_plan = _row.source_plan, target_plan = _row.target_plan,
      updated_at = now()
    WHERE id = _target;
    DELETE FROM public.proposal_items WHERE proposal_id = _target;
  ELSE
    _row := jsonb_populate_record(NULL::public.proposals, _payload - 'id' - 'created_at' - 'updated_at');
    _row.id := gen_random_uuid();
    _row.created_at := now();
    _row.updated_at := now();
    INSERT INTO public.proposals SELECT (_row).*;
    _target := _row.id;
  END IF;

  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' THEN
    FOR _e IN SELECT jsonb_array_elements(_items) LOOP
      _item := jsonb_populate_record(NULL::public.proposal_items, _e - 'id' - 'proposal_id' - 'created_at');
      _item.id := gen_random_uuid();
      _item.proposal_id := _target;
      _item.created_at := now();
      INSERT INTO public.proposal_items SELECT (_item).*;
    END LOOP;
  END IF;

  PERFORM public.link_renewal_proposal(
    _renewal_id,
    _target,
    CASE WHEN _is_update THEN 'proposal_updated' ELSE 'proposal_created' END,
    _performed_by,
    _notes
  );

  RETURN _target;
END;
$function$;