-- 1. Canonical milestone calendar in the renewal automation ------------------
CREATE OR REPLACE FUNCTION public.renewal_automation_run(_batch_size integer DEFAULT 200, _lead_days integer DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _cycles int := 0; _owners int := 0; _tasks int := 0; _notifs int := 0; _errors int := 0;
  _errlog jsonb := '[]'::jsonb;
  c record; r record;
  _target date; _new_id uuid; _owner uuid; _owner_name text; _due date;
  _client_name text; _prop_status text; _key text;
  _cycle_days int; _freq text; _offsets int[]; _labels text[]; _keys text[]; _i int; _made int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('renewal_automation_run')) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another run in progress');
  END IF;

  -- create renewal cycles from real contract dates -----------------------------
  FOR c IN
    SELECT ct.id, ct.client_id, ct.contract_start_date, ct.contract_end_date,
           ct.contract_value, ct.total_value,
           cl.partner_uuid AS c_partner_uuid, cl.partner_id AS c_partner_id, cl.commercial_name
      FROM public.contracts ct
      JOIN public.clients cl ON cl.id = ct.client_id
     WHERE ct.contract_end_date IS NOT NULL
       AND coalesce(cl.is_inactive,false) = false
       AND lower(coalesce(cl.status,'active')) NOT IN ('inactive','terminated','churned','cancelled','closed')
       AND (ct.contract_end_date + 1) <= current_date + _lead_days
       AND (ct.contract_end_date + 1) >= current_date - 30
     ORDER BY ct.contract_end_date
     LIMIT _batch_size
  LOOP
    BEGIN
      _target := c.contract_end_date + 1;
      _new_id := NULL;

      -- period is observed from the contract, never used to move its dates
      _cycle_days := CASE
        WHEN c.contract_start_date IS NOT NULL AND c.contract_end_date > c.contract_start_date
          THEN (c.contract_end_date - c.contract_start_date) + 1
        ELSE NULL END;
      _freq := CASE
        WHEN _cycle_days IS NULL THEN NULL
        WHEN _cycle_days <= 45  THEN 'Monthly'
        WHEN _cycle_days <= 135 THEN 'Quarterly'
        WHEN _cycle_days <= 225 THEN 'Semiannual'
        WHEN _cycle_days <= 400 THEN 'Annual'
        ELSE 'Multi-year' END;

      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.renewals rr
         WHERE rr.closed_at IS NULL
           AND rr.status NOT IN ('Won','Lost','Renewed','Completed','Cancelled')
           AND (rr.contract_id = c.id
                OR (rr.client_id = c.client_id
                    AND rr.renewal_date BETWEEN _target - 45 AND _target + 45)));
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.renewals
                             WHERE client_id = c.client_id AND renewal_date = _target);

      INSERT INTO public.renewals (client_id, partner_id, partner_uuid, contract_id, renewal_type,
              renewal_date, status, estimated_value, billing_frequency, automation_source, notes)
      VALUES (c.client_id, c.c_partner_id, c.c_partner_uuid, c.id, 'Commercial', _target, 'Upcoming',
              coalesce(c.contract_value, c.total_value, 0), _freq, 'auto_contract',
              'Renewal cycle created automatically from contract ' || c.id::text
              || CASE WHEN _cycle_days IS NULL THEN ' (contract period unknown)'
                      ELSE ' (' || _cycle_days || '-day contract period)' END)
      ON CONFLICT DO NOTHING
      RETURNING id INTO _new_id;

      IF _new_id IS NOT NULL THEN
        _cycles := _cycles + 1;
        INSERT INTO public.renewal_activities (renewal_id, action, to_status, performed_by, notes)
        VALUES (_new_id, 'renewal_cycle_created', 'Upcoming', 'automation',
                'Created from contract ' || c.id::text || ' ending ' || c.contract_end_date::text
                || coalesce(' · period ' || _cycle_days || ' days', ' · period unknown'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      _errlog := _errlog || jsonb_build_object('contract_id', c.id, 'error', SQLERRM);
    END;
  END LOOP;

  -- ownership, tasks and notifications for open cycles -------------------------
  FOR r IN
    SELECT rn.*, cl.commercial_name,
           (SELECT ct.contract_start_date FROM public.contracts ct WHERE ct.id = rn.contract_id) AS contract_start
      FROM public.renewals rn
      JOIN public.clients cl ON cl.id = rn.client_id
     WHERE rn.closed_at IS NULL
       AND rn.status NOT IN ('Won','Lost','Renewed','Completed','Cancelled')
       AND rn.renewal_date IS NOT NULL
       AND rn.renewal_date <= current_date + _lead_days
     ORDER BY rn.renewal_date
     LIMIT _batch_size
  LOOP
    BEGIN
      _client_name := coalesce(r.commercial_name, 'Client');
      _owner := r.assigned_user_id;

      IF _owner IS NULL THEN
        _owner := public.resolve_renewal_owner(r.id);
        IF _owner IS NOT NULL THEN
          SELECT coalesce(full_name, email) INTO _owner_name FROM public.profiles WHERE id = _owner;
          UPDATE public.renewals
             SET assigned_user_id = _owner, assigned_owner = coalesce(_owner_name, assigned_owner),
                 updated_at = now()
           WHERE id = r.id;
          _owners := _owners + 1;
          INSERT INTO public.renewal_activities (renewal_id, action, performed_by, notes)
          VALUES (r.id, 'owner_assigned', 'automation',
                  'Owner resolved automatically: ' || coalesce(_owner_name, _owner::text));
          IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'owner_assigned', _owner,
               'Renewal assigned to you',
               'You are the owner of the renewal for ' || _client_name || ' due ' || r.renewal_date::text)
          THEN _notifs := _notifs + 1; END IF;
        ELSE
          _notifs := _notifs + public.renewal_notify_hq(r.id, r.client_id, r.partner_id, 'unassigned_hq',
            'Renewal without owner',
            'Renewal for ' || _client_name || ' is due ' || r.renewal_date::text);
        END IF;
      END IF;

      -- APPROVED milestone calendar: 120 / 90 / 60 / 30 days, then overdue.
      -- The contract period is never used to invent a different calendar.
      _offsets := ARRAY[120, 90, 60, 30];
      _labels  := ARRAY['Start renewal preparation',
                        'Review contract and prepare renewal proposal',
                        'Renewal proposal / follow-up checkpoint',
                        'Renewal decision and escalation checkpoint'];
      _keys    := ARRAY['m120','m90','m60','m30'];
      _made := 0;

      FOR _i IN 1 .. 4 LOOP
        _due := r.renewal_date - _offsets[_i];
        CONTINUE WHEN _due < current_date;                                 -- obsolete, never back-dated
        CONTINUE WHEN r.contract_start IS NOT NULL AND _due < r.contract_start;
        _made := _made + 1;
        _key := 'renewal:' || r.id::text || ':' || _keys[_i];
        INSERT INTO public.manual_tasks (title, description, task_type, priority, status, task_status,
                due_date, owner_user_id, related_source, related_type, related_entity_id,
                related_route, related_company, automation_key)
        VALUES (_labels[_i] || ' — ' || _client_name,
                'Automatic renewal milestone (' || _offsets[_i] || ' days before ' || r.renewal_date::text || ')',
                'renewal',
                CASE WHEN _offsets[_i] <= 30 THEN 'High' ELSE 'Medium' END,
                'To Do', 'Open', _due::timestamptz, _owner, 'renewal', 'renewal', r.id,
                '/renewals?renewal=' || r.id::text, _client_name, _key)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN _tasks := _tasks + 1; END IF;

        IF _due <= current_date AND _owner IS NOT NULL THEN
          IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'milestone_' || _keys[_i], _owner,
               _labels[_i], _client_name || ' — renewal due ' || r.renewal_date::text)
          THEN _notifs := _notifs + 1; END IF;
        END IF;
      END LOOP;

      -- first tracked with less than 30 days left: one immediate action, no fake history
      IF _made = 0 AND r.renewal_date >= current_date THEN
        _key := 'renewal:' || r.id::text || ':action';
        INSERT INTO public.manual_tasks (title, description, task_type, priority, status, task_status,
                due_date, owner_user_id, related_source, related_type, related_entity_id,
                related_route, related_company, automation_key)
        VALUES ('Action required — renewal decision — ' || _client_name,
                'Renewal due ' || r.renewal_date::text || ' — tracked inside the final 30 days',
                'renewal', 'High', 'To Do', 'Open', current_date::timestamptz, _owner,
                'renewal', 'renewal', r.id, '/renewals?renewal=' || r.id::text, _client_name, _key)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN _tasks := _tasks + 1; END IF;
        IF _owner IS NOT NULL THEN
          IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'action_required', _owner,
               'Action required — renewal decision',
               _client_name || ' — renewal due ' || r.renewal_date::text)
          THEN _notifs := _notifs + 1; END IF;
        END IF;
      END IF;

      -- overdue escalation: fired once the date passed while tracked, and seeded
      -- upfront for cycles first tracked inside the final 30 days
      IF (r.renewal_date < current_date AND r.created_at::date <= r.renewal_date)
         OR (_made = 0 AND r.renewal_date >= current_date) THEN
        _key := 'renewal:' || r.id::text || ':overdue';
        INSERT INTO public.manual_tasks (title, description, task_type, priority, status, task_status,
                due_date, owner_user_id, related_source, related_type, related_entity_id,
                related_route, related_company, automation_key)
        VALUES ('Overdue renewal — ' || _client_name,
                'Escalation for renewal date ' || r.renewal_date::text,
                'renewal', 'Critical', 'To Do', 'Open', r.renewal_date::timestamptz, _owner,
                'renewal', 'renewal', r.id, '/renewals?renewal=' || r.id::text, _client_name, _key)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN _tasks := _tasks + 1; END IF;

        IF r.renewal_date < current_date THEN
          IF _owner IS NOT NULL THEN
            IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'overdue', _owner,
                 'Renewal overdue', _client_name || ' renewal was due ' || r.renewal_date::text, 'warning')
            THEN _notifs := _notifs + 1; END IF;
          END IF;
          _notifs := _notifs + public.renewal_notify_hq(r.id, r.client_id, r.partner_id, 'overdue_hq',
            'Renewal overdue', _client_name || ' renewal was due ' || r.renewal_date::text);
        END IF;
      END IF;

      -- proposal ready
      SELECT status INTO _prop_status FROM public.proposals
       WHERE renewal_id = r.id ORDER BY version DESC, created_at DESC LIMIT 1;
      IF _prop_status IN ('Ready','Sent','Accepted') AND _owner IS NOT NULL THEN
        IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'proposal_ready', _owner,
             'Renewal proposal ready', 'The renewal proposal for ' || _client_name || ' is ' || _prop_status)
        THEN _notifs := _notifs + 1; END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      _errlog := _errlog || jsonb_build_object('renewal_id', r.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('ran_at', now(), 'cycles_created', _cycles, 'owners_resolved', _owners,
                            'tasks_created', _tasks, 'notifications_created', _notifs,
                            'errors', _errors, 'error_log', _errlog);
END;
$fn$;

REVOKE ALL ON FUNCTION public.renewal_automation_run(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renewal_automation_run(integer, integer) TO service_role;

-- 2. close_renewal: explicit dates preserved, clearer confirmation message ----
DO $mig$
DECLARE
  def text;
  newdef text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'close_renewal';
  IF def IS NULL THEN RAISE EXCEPTION 'close_renewal not found'; END IF;

  newdef := replace(def,
    'A next renewal date is required: this contract does not follow a standard period (%).',
    'Next renewal date requires confirmation: this contract does not follow a standard period (%).');
  IF newdef = def THEN RAISE EXCEPTION 'message replacement did not match'; END IF;
  def := newdef;

  newdef := replace(def,
$old$   WHERE contract_id = c.id
     AND lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')
     AND (source_item_id IS NULL OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id));$old$,
$new$   WHERE contract_id = c.id
     AND lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')
     AND (end_date IS NULL OR end_date = c.contract_end_date)
     AND (source_item_id IS NULL OR source_item_id NOT IN (SELECT id FROM public.proposal_items WHERE proposal_id = p.id));$new$);
  IF newdef = def THEN RAISE EXCEPTION 'line-date replacement did not match'; END IF;

  EXECUTE newdef;
END
$mig$;