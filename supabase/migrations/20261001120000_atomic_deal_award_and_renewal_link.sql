-- A deal award is one commercial transaction, not a sequence of browser writes.
-- Existing legacy rows are left untouched; the unique indexes protect new awards.
CREATE UNIQUE INDEX IF NOT EXISTS licenses_one_operational_per_deal
  ON public.licenses (deal_id)
  WHERE deal_id IS NOT NULL AND is_draft = false;

CREATE UNIQUE INDEX IF NOT EXISTS licenses_one_operational_per_source_proposal
  ON public.licenses (source_proposal_id)
  WHERE source_proposal_id IS NOT NULL AND is_draft = false;

CREATE UNIQUE INDEX IF NOT EXISTS proposals_one_award_per_deal
  ON public.proposals (deal_id)
  WHERE source_type = 'deal' AND status = 'Won' AND deal_id IS NOT NULL;

-- Legacy callers may omit deal_id on a proposal-derived license. Resolve it
-- before the unique deal constraint so a second proposal cannot create a second
-- operational license for the same opportunity.
CREATE OR REPLACE FUNCTION public.set_license_source_deal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE _source_deal uuid;
BEGIN
  IF NEW.source_proposal_id IS NULL THEN RETURN NEW; END IF;
  SELECT deal_id INTO _source_deal FROM public.proposals
    WHERE id = NEW.source_proposal_id AND source_type = 'deal';
  IF _source_deal IS NULL THEN RETURN NEW; END IF;
  IF NEW.deal_id IS NOT NULL AND NEW.deal_id <> _source_deal THEN
    RAISE EXCEPTION 'LICENSE_DEAL_PROPOSAL_MISMATCH';
  END IF;
  NEW.deal_id := _source_deal;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS licenses_set_source_deal ON public.licenses;
CREATE TRIGGER licenses_set_source_deal
BEFORE INSERT OR UPDATE OF source_proposal_id, deal_id ON public.licenses
FOR EACH ROW EXECUTE FUNCTION public.set_license_source_deal();
REVOKE ALL ON FUNCTION public.set_license_source_deal() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.award_deal_proposal(
  _deal_id uuid,
  _proposal_id uuid,
  _existing_client_id uuid,
  _license jsonb,
  _contract_lines jsonb,
  _start_date date DEFAULT CURRENT_DATE,
  _notice_days integer DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
     OR NOT public.has_module_access('renewals', 'edit')
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
$function$;

REVOKE ALL ON FUNCTION public.award_deal_proposal(uuid, uuid, uuid, jsonb, jsonb, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_deal_proposal(uuid, uuid, uuid, jsonb, jsonb, date, integer) TO authenticated;

-- source_proposal_id may initially point to the originating deal proposal.
-- A renewal proposal is allowed to replace that origin link, but never a different
-- renewal proposal; the origin remains on the license and its lifecycle event.
CREATE OR REPLACE FUNCTION public.link_renewal_proposal(
  _renewal_id uuid, _proposal_id uuid, _action text,
  _performed_by text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _prop public.proposals%ROWTYPE;
  _linked uuid;
  _linked_source text;
BEGIN
  SELECT * INTO _prop FROM public.proposals WHERE id = _proposal_id;
  IF NOT FOUND OR _prop.renewal_id IS DISTINCT FROM _renewal_id OR _prop.source_type <> 'renewal' THEN
    RAISE EXCEPTION 'PROPOSAL_NOT_FROM_RENEWAL';
  END IF;
  IF NOT public.can_access_renewal_proposal(_renewal_id, _prop.client_id, _prop.partner_uuid) THEN
    RAISE EXCEPTION 'Not authorized for renewal %', _renewal_id USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('proposal_created', 'proposal_updated') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;
  SELECT source_proposal_id INTO _linked FROM public.renewals WHERE id = _renewal_id FOR UPDATE;
  IF _linked IS NOT NULL AND _linked <> _proposal_id THEN
    SELECT source_type INTO _linked_source FROM public.proposals WHERE id = _linked;
    IF _linked_source IS DISTINCT FROM 'deal' THEN
      RAISE EXCEPTION 'Renewal % is already linked to proposal %', _renewal_id, _linked
        USING ERRCODE = '23505';
    END IF;
  END IF;
  IF _linked IS DISTINCT FROM _proposal_id THEN
    UPDATE public.renewals SET source_proposal_id = _proposal_id WHERE id = _renewal_id;
  END IF;
  INSERT INTO public.renewal_activities (renewal_id, action, performed_by, notes)
  VALUES (_renewal_id, _action, _performed_by, _notes);
  RETURN _proposal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_renewal_proposal(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_renewal_proposal(uuid, uuid, text, text, text) TO authenticated;
