-- ── Renewal closing lifecycle ────────────────────────────────────────────────
ALTER TABLE public.renewals
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closing_notes text,
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS closed_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS renewal_effective_date date,
  ADD COLUMN IF NOT EXISTS previous_recurring_value numeric,
  ADD COLUMN IF NOT EXISTS renewed_recurring_value numeric,
  ADD COLUMN IF NOT EXISTS one_time_value numeric,
  ADD COLUMN IF NOT EXISTS previous_renewal_id uuid,
  ADD COLUMN IF NOT EXISTS next_renewal_id uuid,
  ADD COLUMN IF NOT EXISTS closure_snapshot jsonb;

DO $$ BEGIN
  ALTER TABLE public.renewals
    ADD CONSTRAINT renewals_outcome_check CHECK (outcome IS NULL OR outcome IN ('renewed','lost'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- exactly one next cycle per closed renewal
CREATE UNIQUE INDEX IF NOT EXISTS renewals_one_next_cycle_per_previous
  ON public.renewals (previous_renewal_id)
  WHERE previous_renewal_id IS NOT NULL;

-- closed renewals are read-only except administrative notes
CREATE OR REPLACE FUNCTION public.renewals_guard_closed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.closed_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'RENEWAL_CLOSED: a closed renewal cannot be reopened';
  END IF;
  IF (to_jsonb(NEW) - 'closing_notes' - 'notes' - 'updated_at' - 'next_renewal_id' - 'closure_snapshot')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'closing_notes' - 'notes' - 'updated_at' - 'next_renewal_id' - 'closure_snapshot') THEN
    RAISE EXCEPTION 'RENEWAL_CLOSED: closed renewals are read-only (notes only)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renewals_guard_closed ON public.renewals;
CREATE TRIGGER trg_renewals_guard_closed
  BEFORE UPDATE ON public.renewals
  FOR EACH ROW EXECUTE FUNCTION public.renewals_guard_closed();

-- keyword mapping for approved proposal items with no matching contract line
CREATE OR REPLACE FUNCTION public.renewal_line_type_for(_name text, _category text, _recurring boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.close_renewal(
  _renewal_id uuid,
  _outcome text,
  _proposal_id uuid DEFAULT NULL,
  _closing_notes text DEFAULT NULL,
  _loss_reason text DEFAULT NULL,
  _effective_date date DEFAULT NULL,
  _next_renewal_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  _interval := CASE lower(coalesce(r.billing_frequency,'annual'))
                 WHEN 'monthly' THEN interval '1 month'
                 WHEN 'quarterly' THEN interval '3 months'
                 WHEN 'semiannual' THEN interval '6 months'
                 ELSE interval '1 year' END;
  _next := coalesce(_next_renewal_date, (_eff + _interval)::date);
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
     AND (source_item_id IS NULL OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id));

  UPDATE public.contracts SET
    contract_start_date = _eff,
    contract_end_date = (_next - 1),
    contract_value = _new_recurring,
    source_proposal_id = p.id,
    updated_at = now()
  WHERE id = c.id;

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
      'next_renewal_id', _next_id),
    _eff);

  RETURN jsonb_build_object(
    'renewal_id', r.id, 'outcome', 'renewed', 'already_closed', false,
    'proposal_id', p.id, 'contract_id', c.id,
    'effective_date', _eff, 'next_renewal_date', _next, 'next_renewal_id', _next_id,
    'previous_recurring_value', _prev_recurring,
    'renewed_recurring_value', _new_recurring,
    'one_time_value', _one_time);
END;
$$;

REVOKE ALL ON FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) FROM public;
GRANT EXECUTE ON FUNCTION public.close_renewal(uuid,text,uuid,text,text,date,date) TO authenticated;