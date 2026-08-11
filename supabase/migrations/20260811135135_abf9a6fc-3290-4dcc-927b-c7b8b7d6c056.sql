-- ============================================================================
-- ISOLATED VERIFICATION RUN "ZZV811" (test environment only, removed after)
-- ============================================================================

-- 1. scoped automation: allows manual execution against isolated fixtures only
CREATE OR REPLACE FUNCTION public.renewal_automation_run(_batch_size integer DEFAULT 200, _lead_days integer DEFAULT 120, _client_ids uuid[] DEFAULT NULL)
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

  FOR c IN
    SELECT ct.id, ct.client_id, ct.contract_start_date, ct.contract_end_date,
           ct.contract_value, ct.total_value,
           cl.partner_uuid AS c_partner_uuid, cl.partner_id AS c_partner_id, cl.commercial_name
      FROM public.contracts ct
      JOIN public.clients cl ON cl.id = ct.client_id
     WHERE ct.contract_end_date IS NOT NULL
       AND (_client_ids IS NULL OR cl.id = ANY(_client_ids))
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

  FOR r IN
    SELECT rn.*, cl.commercial_name,
           (SELECT ct.contract_start_date FROM public.contracts ct WHERE ct.id = rn.contract_id) AS contract_start
      FROM public.renewals rn
      JOIN public.clients cl ON cl.id = rn.client_id
     WHERE rn.closed_at IS NULL
       AND (_client_ids IS NULL OR cl.id = ANY(_client_ids))
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

      _offsets := ARRAY[120, 90, 60, 30];
      _labels  := ARRAY['Start renewal preparation',
                        'Review contract and prepare renewal proposal',
                        'Renewal proposal / follow-up checkpoint',
                        'Renewal decision and escalation checkpoint'];
      _keys    := ARRAY['m120','m90','m60','m30'];
      _made := 0;

      FOR _i IN 1 .. 4 LOOP
        _due := r.renewal_date - _offsets[_i];
        CONTINUE WHEN _due < current_date;
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
                            'errors', _errors, 'error_log', _errlog,
                            'scoped', _client_ids IS NOT NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION public.renewal_automation_run(integer, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renewal_automation_run(integer, integer, uuid[]) TO service_role;

-- 2. evidence table (temporary, dropped in the cleanup migration)
CREATE TABLE IF NOT EXISTS public.zz_verify_run (
  scenario text PRIMARY KEY,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zz_verify_run TO service_role;
ALTER TABLE public.zz_verify_run ENABLE ROW LEVEL SECURITY;

-- 3. fixtures + runs
DO $run$
DECLARE
  P_OWN uuid := 'a1000000-0000-0000-0000-000000000003';  -- partner having an eligible user
  U_OWN uuid := '75d5f3c4-8793-40c6-9b56-906333bfefbc';  -- ZZ Fixture Own Partner
  U_OTHER uuid := '512e8c9d-9b5c-4c27-966e-b137b33e4e98';-- unrelated partner user
  U_HQ uuid := '0ff00d5c-53ae-4a29-9b2a-d9e4ed3c51c5';   -- HQ admin actor
  P_NONE uuid := 'f0000000-0000-4000-8000-0000000000ff'; -- fixture partner without users
  ids uuid[];
  cid uuid; ctid uuid; rid uuid; pid uuid;
  res jsonb; res2 jsonb;
  m record;
  _err text;
  d date := current_date;
BEGIN
  -- pre-test aggregates ------------------------------------------------------
  INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('00_pre_counts', jsonb_build_object(
    'clients', (SELECT count(*) FROM public.clients),
    'contracts', (SELECT count(*) FROM public.contracts),
    'contract_lines', (SELECT count(*) FROM public.contract_lines),
    'renewals', (SELECT count(*) FROM public.renewals),
    'proposals', (SELECT count(*) FROM public.proposals),
    'manual_tasks', (SELECT count(*) FROM public.manual_tasks),
    'notifications', (SELECT count(*) FROM public.notifications),
    'renewal_activities', (SELECT count(*) FROM public.renewal_activities),
    'lifecycle_events', (SELECT count(*) FROM public.lifecycle_events),
    'partners', (SELECT count(*) FROM public.partners),
    'open_renewals', (SELECT count(*) FROM public.renewals WHERE closed_at IS NULL),
    'overdue_renewals', (SELECT count(*) FROM public.renewals WHERE closed_at IS NULL AND renewal_date < current_date),
    'max_updated_renewal', (SELECT max(updated_at) FROM public.renewals),
    'max_updated_contract', (SELECT max(updated_at) FROM public.contracts)
  ));

  INSERT INTO public.partners(id, company_name, country, status)
  VALUES (P_NONE, 'ZZV811 Partner Without Users', 'PT', 'Active') ON CONFLICT DO NOTHING;

  -- fixture clients / contracts ---------------------------------------------
  -- (code, commercial name, start, end, partner)
  FOR m IN
    SELECT * FROM (VALUES
      ('ZZV811-01','ZZV811 Annual 120',        d - 245,  d + 119, P_OWN),
      ('ZZV811-02','ZZV811 Multi-year',        d - 976,  d + 119, P_OWN),
      ('ZZV811-03','ZZV811 Six months',        DATE '2026-10-10', DATE '2027-04-10', P_OWN),
      ('ZZV811-04','ZZV811 Month end',         DATE '2026-08-31', DATE '2027-02-28', P_OWN),
      ('ZZV811-05','ZZV811 Leap boundary',     DATE '2027-02-28', DATE '2028-02-29', P_OWN),
      ('ZZV811-06','ZZV811 Tracked at 75',     d - 290,  d + 74,  P_OWN),
      ('ZZV811-07','ZZV811 Tracked at 45',     d - 320,  d + 44,  P_OWN),
      ('ZZV811-08','ZZV811 Tracked at 15',     d - 350,  d + 14,  P_OWN),
      ('ZZV811-09','ZZV811 Overdue tracked',   d - 370,  d - 6,   P_OWN),
      ('ZZV811-10','ZZV811 No eligible owner', d - 245,  d + 119, P_NONE),
      ('ZZV811-11','ZZV811 Close renewed',     d - 245,  d + 119, P_OWN),
      ('ZZV811-12','ZZV811 Close lost',        d - 245,  d + 119, P_OWN),
      ('ZZV811-13','ZZV811 Irregular closure', DATE '2026-10-10', DATE '2027-04-10', P_OWN)
    ) AS t(code, name, sd, ed, pu)
  LOOP
    INSERT INTO public.clients(client_code, commercial_name, status, partner_uuid, country)
    VALUES (m.code, m.name, 'Active', m.pu, 'PT') RETURNING id INTO cid;
    INSERT INTO public.contracts(client_id, contract_start_date, contract_end_date, contract_value, total_value)
    VALUES (cid, m.sd, m.ed, 10000, 10000) RETURNING id INTO ctid;
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('fx_' || m.code, jsonb_build_object(
      'client_id', cid, 'contract_id', ctid, 'start', m.sd, 'end', m.ed, 'partner', m.pu));
  END LOOP;

  SELECT array_agg(id) INTO ids FROM public.clients WHERE client_code LIKE 'ZZV811-%';

  -- an already tracked, now overdue cycle (created before its renewal date)
  SELECT id INTO cid FROM public.clients WHERE client_code = 'ZZV811-09';
  SELECT id INTO ctid FROM public.contracts WHERE client_id = cid;
  INSERT INTO public.renewals(client_id, partner_uuid, contract_id, renewal_type, renewal_date, status,
                              estimated_value, billing_frequency, automation_source, created_at)
  VALUES (cid, P_OWN, ctid, 'Commercial', d - 5, 'Upcoming', 10000, 'Annual', 'zzv811_fixture', now() - interval '60 days');

  -- unrelated fixture manual task and a normal pipeline fixture proposal
  SELECT id INTO cid FROM public.clients WHERE client_code = 'ZZV811-01';
  INSERT INTO public.manual_tasks(title, description, task_type, priority, status, task_status, due_date,
                                  related_source, related_company, automation_key)
  VALUES ('ZZV811 unrelated manual task', 'must stay untouched', 'other', 'Low', 'To Do', 'Open',
          (d + 10)::timestamptz, 'manual', 'ZZV811', 'zzv811:manual');
  INSERT INTO public.deals(company_name, stage, status) VALUES ('ZZV811 Pipeline Fixture Deal', 'Open Lead', 'Open')
  RETURNING id INTO pid;
  INSERT INTO public.proposals(version, language, status, hosting, client_name, proposal_date, validity_days,
          include_requests_module, web_users, discount_scope, software_discount_pct, services_discount_pct,
          product_family, source_type, deal_id, total_year_1, total_recurring)
  VALUES (1,'en','Draft','On-Premise','ZZV811 Pipeline Fixture', d, 30, false, 0, 'none', 0, 0,
          'Professional','deal', pid, 5000, 5000);

  -- RUN 1 (manual, isolated scope) ------------------------------------------
  res := public.renewal_automation_run(200, 120, ids);
  INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('10_run_1', res);

  -- RUN 2 (idempotency)
  res2 := public.renewal_automation_run(200, 120, ids);
  INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('11_run_2_idempotency', res2);

  -- per-client evidence ------------------------------------------------------
  INSERT INTO public.zz_verify_run(scenario, detail)
  SELECT '20_scenario_' || cl.client_code, jsonb_build_object(
    'contract_start', ct.contract_start_date,
    'contract_end', ct.contract_end_date,
    'cycles', (SELECT count(*) FROM public.renewals rn WHERE rn.client_id = cl.id),
    'renewal_dates', (SELECT jsonb_agg(rn.renewal_date ORDER BY rn.renewal_date) FROM public.renewals rn WHERE rn.client_id = cl.id),
    'frequency', (SELECT jsonb_agg(DISTINCT rn.billing_frequency) FROM public.renewals rn WHERE rn.client_id = cl.id),
    'owner', (SELECT jsonb_agg(DISTINCT coalesce(pr.full_name,'Unassigned'))
                FROM public.renewals rn LEFT JOIN public.profiles pr ON pr.id = rn.assigned_user_id
               WHERE rn.client_id = cl.id),
    'tasks', (SELECT jsonb_agg(jsonb_build_object('title', mt.title, 'due', mt.due_date::date, 'key', mt.automation_key, 'route', mt.related_route) ORDER BY mt.due_date)
                FROM public.manual_tasks mt JOIN public.renewals rn ON rn.id = mt.related_entity_id
               WHERE rn.client_id = cl.id),
    'notifications', (SELECT count(*) FROM public.notifications nt JOIN public.renewals rn ON rn.id = nt.renewal_id WHERE rn.client_id = cl.id),
    'notification_recipients', (SELECT jsonb_agg(DISTINCT coalesce(pr.full_name, nt.target_user_id))
                FROM public.notifications nt JOIN public.renewals rn ON rn.id = nt.renewal_id
                LEFT JOIN public.profiles pr ON pr.id::text = nt.target_user_id
               WHERE rn.client_id = cl.id),
    'deep_link', (SELECT DISTINCT nt.action_url FROM public.notifications nt JOIN public.renewals rn ON rn.id = nt.renewal_id WHERE rn.client_id = cl.id LIMIT 1),
    'duplicate_tasks', (SELECT count(*) FROM (SELECT mt.automation_key FROM public.manual_tasks mt JOIN public.renewals rn ON rn.id = mt.related_entity_id
               WHERE rn.client_id = cl.id GROUP BY mt.automation_key HAVING count(*) > 1) x)
  )
  FROM public.clients cl JOIN public.contracts ct ON ct.client_id = cl.id
  WHERE cl.client_code LIKE 'ZZV811-%';

  -- authorized reassignment (HQ actor) --------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', U_HQ, 'role','authenticated')::text, true);
  SELECT rn.id INTO rid FROM public.renewals rn JOIN public.clients cl ON cl.id = rn.client_id
   WHERE cl.client_code = 'ZZV811-01' LIMIT 1;
  BEGIN
    PERFORM public.reassign_renewal_owner(rid, U_OWN);
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('30_reassign_authorized', jsonb_build_object(
      'ok', true, 'owner', (SELECT full_name FROM public.profiles pr JOIN public.renewals rn ON rn.assigned_user_id = pr.id WHERE rn.id = rid)));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('30_reassign_authorized', jsonb_build_object('ok', false, 'error', SQLERRM));
  END;

  -- unrelated partner attempts closure --------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', U_OTHER, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.close_renewal(rid, 'lost', NULL, NULL, 'test');
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('31_unrelated_partner', jsonb_build_object('blocked', false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('31_unrelated_partner', jsonb_build_object('blocked', true, 'error', SQLERRM));
  END;

  -- anonymous caller ---------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.close_renewal(rid, 'lost', NULL, NULL, 'test');
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('32_anonymous', jsonb_build_object('blocked', false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('32_anonymous', jsonb_build_object('blocked', true, 'error', SQLERRM));
  END;

  -- close as Renewed (HQ) ----------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', U_HQ, 'role','authenticated')::text, true);
  SELECT cl.id, rn.id INTO cid, rid FROM public.clients cl JOIN public.renewals rn ON rn.client_id = cl.id
   WHERE cl.client_code = 'ZZV811-11' LIMIT 1;
  INSERT INTO public.proposals(version, language, status, hosting, client_name, proposal_date, validity_days,
          include_requests_module, web_users, discount_scope, software_discount_pct, services_discount_pct,
          product_family, source_type, client_id, renewal_id, total_year_1, total_recurring)
  VALUES (1,'en','Ready','On-Premise','ZZV811 Close renewed', d, 30, false, 0,'none',0,0,
          'Professional','renewal', cid, rid, 12000, 12000) RETURNING id INTO pid;
  BEGIN
    res := public.close_renewal(rid, 'renewed', pid, 'fixture closure', NULL, (d + 120), (d + 485));
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('40_close_renewed', res
      || jsonb_build_object('contract_after', (SELECT jsonb_build_object('start', contract_start_date, 'end', contract_end_date)
                                                 FROM public.contracts WHERE client_id = cid),
                            'next_cycles', (SELECT count(*) FROM public.renewals WHERE client_id = cid AND closed_at IS NULL)));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('40_close_renewed', jsonb_build_object('error', SQLERRM));
  END;

  -- close as Lost ------------------------------------------------------------
  SELECT cl.id, rn.id INTO cid, rid FROM public.clients cl JOIN public.renewals rn ON rn.client_id = cl.id
   WHERE cl.client_code = 'ZZV811-12' LIMIT 1;
  BEGIN
    res := public.close_renewal(rid, 'lost', NULL, 'fixture lost', 'Budget frozen');
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('41_close_lost', res
      || jsonb_build_object('open_after', (SELECT count(*) FROM public.renewals WHERE client_id = cid AND closed_at IS NULL)));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('41_close_lost', jsonb_build_object('error', SQLERRM));
  END;

  -- irregular period closed without an explicit next date --------------------
  SELECT cl.id INTO cid FROM public.clients cl WHERE cl.client_code = 'ZZV811-13';
  SELECT id INTO ctid FROM public.contracts WHERE client_id = cid;
  INSERT INTO public.renewals(client_id, partner_uuid, contract_id, renewal_type, renewal_date, status,
                              estimated_value, billing_frequency, automation_source)
  VALUES (cid, P_OWN, ctid, 'Commercial', DATE '2027-04-11', 'Upcoming', 10000, 'Semiannual-irregular', 'zzv811_fixture')
  RETURNING id INTO rid;
  INSERT INTO public.proposals(version, language, status, hosting, client_name, proposal_date, validity_days,
          include_requests_module, web_users, discount_scope, software_discount_pct, services_discount_pct,
          product_family, source_type, client_id, renewal_id, total_year_1, total_recurring)
  VALUES (1,'en','Ready','On-Premise','ZZV811 Irregular', d, 30, false, 0,'none',0,0,
          'Professional','renewal', cid, rid, 9000, 9000);
  BEGIN
    res := public.close_renewal(rid, 'renewed');
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('42_irregular_needs_next_date', jsonb_build_object('blocked', false, 'result', res));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('42_irregular_needs_next_date', jsonb_build_object('blocked', true, 'error', SQLERRM));
  END;
  -- with the explicit approved dates it must copy them exactly
  BEGIN
    res := public.close_renewal(rid, 'renewed', NULL, NULL, NULL, DATE '2027-04-11', DATE '2027-10-11');
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('43_irregular_explicit_dates', res
      || jsonb_build_object('contract_after', (SELECT jsonb_build_object('start', contract_start_date, 'end', contract_end_date)
                                                 FROM public.contracts WHERE client_id = cid)));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('43_irregular_explicit_dates', jsonb_build_object('error', SQLERRM));
  END;

  PERFORM set_config('request.jwt.claims', '', true);

  -- untouched controls -------------------------------------------------------
  INSERT INTO public.zz_verify_run(scenario, detail) VALUES ('50_controls', jsonb_build_object(
    'unrelated_manual_task_status', (SELECT task_status FROM public.manual_tasks WHERE automation_key = 'zzv811:manual'),
    'pipeline_proposal_status', (SELECT status FROM public.proposals WHERE client_name = 'ZZV811 Pipeline Fixture'),
    'non_fixture_renewals_touched', (SELECT count(*) FROM public.renewals rn
        WHERE rn.updated_at > (SELECT (detail->>'max_updated_renewal')::timestamptz FROM public.zz_verify_run WHERE scenario='00_pre_counts')
          AND rn.client_id NOT IN (SELECT id FROM public.clients WHERE client_code LIKE 'ZZV811-%')),
    'non_fixture_contracts_touched', (SELECT count(*) FROM public.contracts ct
        WHERE ct.updated_at > (SELECT (detail->>'max_updated_contract')::timestamptz FROM public.zz_verify_run WHERE scenario='00_pre_counts')
          AND ct.client_id NOT IN (SELECT id FROM public.clients WHERE client_code LIKE 'ZZV811-%')),
    'fixture_tasks', (SELECT count(*) FROM public.manual_tasks mt WHERE mt.related_entity_id IN
        (SELECT id FROM public.renewals WHERE client_id IN (SELECT id FROM public.clients WHERE client_code LIKE 'ZZV811-%'))),
    'fixture_notifications', (SELECT count(*) FROM public.notifications nt WHERE nt.renewal_id IN
        (SELECT id FROM public.renewals WHERE client_id IN (SELECT id FROM public.clients WHERE client_code LIKE 'ZZV811-%')))
  ));
END
$run$;