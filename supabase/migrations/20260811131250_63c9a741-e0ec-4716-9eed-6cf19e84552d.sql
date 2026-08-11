-- ─────────────────────────────────────────────────────────────
-- Renewal Operations & Automation
-- ─────────────────────────────────────────────────────────────

-- 1. Identity / idempotency keys ------------------------------------------------
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS automation_source text;

CREATE UNIQUE INDEX IF NOT EXISTS renewals_unique_contract_cycle
  ON public.renewals (contract_id, renewal_date)
  WHERE contract_id IS NOT NULL AND renewal_date IS NOT NULL;

ALTER TABLE public.manual_tasks ADD COLUMN IF NOT EXISTS automation_key text;
CREATE UNIQUE INDEX IF NOT EXISTS manual_tasks_automation_key_uq
  ON public.manual_tasks (automation_key) WHERE automation_key IS NOT NULL;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uq
  ON public.notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 2. Canonical operational state (derived, never stale) -------------------------
CREATE OR REPLACE FUNCTION public.renewal_operational_state(
  _status text, _closed_at timestamptz, _outcome text, _renewal_date date, _proposal_status text
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _outcome = 'renewed' OR _status IN ('Won','Renewed','Completed') THEN 'Renewed'
    WHEN _outcome = 'lost' OR _status = 'Lost' THEN 'Lost'
    WHEN _renewal_date IS NOT NULL AND _renewal_date < current_date THEN 'Overdue'
    WHEN _status = 'In Negotiation' THEN 'In Negotiation'
    WHEN _proposal_status IN ('Ready','Sent','Accepted') THEN 'Proposal Ready'
    WHEN _proposal_status = 'Draft' THEN 'In Preparation'
    WHEN _renewal_date IS NOT NULL AND _renewal_date <= current_date + 60 THEN 'Action Required'
    ELSE 'Upcoming'
  END
$$;

-- 3. Server-side owner resolution -----------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_renewal_owner(_renewal_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.renewals%ROWTYPE;
  _owner uuid;
BEGIN
  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- keep the current owner when still eligible
  IF r.assigned_user_id IS NOT NULL THEN
    SELECT p.id INTO _owner FROM public.profiles p
     WHERE p.id = r.assigned_user_id AND coalesce(p.is_active,true)
       AND (coalesce(p.is_hq,false) OR r.partner_uuid IS NULL OR p.partner_id = r.partner_uuid);
    IF _owner IS NOT NULL THEN RETURN _owner; END IF;
  END IF;

  -- partner-managed client → eligible partner user
  IF r.partner_uuid IS NOT NULL THEN
    SELECT p.id INTO _owner
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.partner_id = r.partner_uuid AND coalesce(p.is_active,true)
     ORDER BY CASE ur.role::text
                WHEN 'partner_admin' THEN 1
                WHEN 'partner_manager' THEN 2
                WHEN 'partner_sales' THEN 3
                ELSE 9 END, p.created_at
     LIMIT 1;
    IF _owner IS NOT NULL THEN RETURN _owner; END IF;

    -- HQ manager responsible for the partner
    SELECT pr.id INTO _owner
      FROM public.partners pa
      JOIN public.profiles pr ON pr.id = pa.assigned_manager_id
     WHERE pa.id = r.partner_uuid AND coalesce(pr.is_active,true);
    IF _owner IS NOT NULL THEN RETURN _owner; END IF;
  END IF;

  -- HQ account owner on the client
  SELECT pr.id INTO _owner
    FROM public.clients cl
    JOIN public.profiles pr ON pr.id = coalesce(cl.account_manager_id, cl.manager_owner_id)
   WHERE cl.id = r.client_id AND coalesce(pr.is_active,true);

  RETURN _owner; -- NULL ⇒ Unassigned — HQ action required
END;
$$;

-- 4. Deduplicated notification helper -------------------------------------------
CREATE OR REPLACE FUNCTION public.renewal_notify(
  _renewal_id uuid, _client_id uuid, _partner_id text, _event text,
  _recipient uuid, _title text, _message text, _type text DEFAULT 'info'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF _recipient IS NULL THEN RETURN false; END IF;
  INSERT INTO public.notifications (title, message, type, category, target_user_id, partner_id,
                                    client_id, renewal_id, action_url, dedupe_key)
  VALUES (_title, _message, _type, 'renewal', _recipient::text, _partner_id, _client_id, _renewal_id,
          '/renewals?renewal=' || _renewal_id::text,
          'renewal:' || _renewal_id::text || ':' || _event || ':' || _recipient::text)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.renewal_notify_hq(
  _renewal_id uuid, _client_id uuid, _partner_id text, _event text,
  _title text, _message text, _type text DEFAULT 'warning'
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c int := 0; a record;
BEGIN
  FOR a IN SELECT p.id FROM public.profiles p
            JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'hq_admin'
           WHERE coalesce(p.is_active,true)
  LOOP
    IF public.renewal_notify(_renewal_id,_client_id,_partner_id,_event,a.id,_title,_message,_type) THEN
      _c := _c + 1;
    END IF;
  END LOOP;
  RETURN _c;
END;
$$;

-- 5. The scheduler entry point ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.renewal_automation_run(
  _batch_size int DEFAULT 200, _lead_days int DEFAULT 120
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cycles int := 0; _owners int := 0; _tasks int := 0; _notifs int := 0; _errors int := 0;
  _errlog jsonb := '[]'::jsonb;
  c record; r record; m record;
  _target date; _new_id uuid; _owner uuid; _owner_name text; _due date;
  _client_name text; _prop_status text; _key text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('renewal_automation_run')) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another run in progress');
  END IF;

  -- 5a. create renewal cycles from real contract dates -------------------------
  FOR c IN
    SELECT ct.id, ct.client_id, ct.contract_end_date, ct.contract_value, ct.total_value,
           cl.partner_uuid AS c_partner_uuid, cl.partner_id AS c_partner_id, cl.commercial_name
      FROM public.contracts ct
      JOIN public.clients cl ON cl.id = ct.client_id
     WHERE ct.contract_end_date IS NOT NULL
       AND coalesce(cl.is_inactive,false) = false
       AND lower(coalesce(cl.status,'active')) NOT IN ('inactive','terminated','churned','cancelled','closed')
       AND (ct.contract_end_date + 1) <= current_date + _lead_days
       AND (ct.contract_end_date + 1) >= current_date - 365
     ORDER BY ct.contract_end_date
     LIMIT _batch_size
  LOOP
    BEGIN
      _target := c.contract_end_date + 1;
      _new_id := NULL;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.renewals
                             WHERE client_id = c.client_id AND renewal_date = _target);
      INSERT INTO public.renewals (client_id, partner_id, partner_uuid, contract_id, renewal_type,
              renewal_date, status, estimated_value, billing_frequency, automation_source, notes)
      VALUES (c.client_id, c.c_partner_id, c.c_partner_uuid, c.id, 'Commercial', _target, 'Upcoming',
              coalesce(c.contract_value, c.total_value, 0), 'Annual', 'auto_contract',
              'Renewal cycle created automatically from contract ' || c.id::text)
      ON CONFLICT DO NOTHING
      RETURNING id INTO _new_id;

      IF _new_id IS NOT NULL THEN
        _cycles := _cycles + 1;
        INSERT INTO public.renewal_activities (renewal_id, action, to_status, performed_by, notes)
        VALUES (_new_id, 'renewal_cycle_created', 'Upcoming', 'automation',
                'Created from contract ' || c.id::text || ' ending ' || c.contract_end_date::text);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      _errlog := _errlog || jsonb_build_object('contract_id', c.id, 'error', SQLERRM);
    END;
  END LOOP;

  -- 5b. ownership, tasks and notifications for open cycles ---------------------
  FOR r IN
    SELECT rn.*, cl.commercial_name
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
          _notifs := _notifs + public.renewal_notify_hq(r.id, r.client_id, r.partner_id, 'unassigned',
            'Renewal unassigned — HQ action required',
            'No eligible owner could be resolved for ' || _client_name || ' (due ' || r.renewal_date::text || ')');
        END IF;
      END IF;

      -- cycle-created notification (once per recipient)
      IF _owner IS NOT NULL THEN
        IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'cycle_created', _owner,
             'Renewal cycle opened',
             'Renewal for ' || _client_name || ' is due ' || r.renewal_date::text)
        THEN _notifs := _notifs + 1; END IF;
      END IF;

      -- milestone task series (never obsolete/back-dated)
      FOR m IN SELECT * FROM (VALUES
          (120, 'm120', 'Start renewal preparation'),
          (90,  'm90',  'Review contract and prepare renewal proposal'),
          (60,  'm60',  'Renewal proposal / follow-up checkpoint'),
          (30,  'm30',  'Renewal decision and escalation checkpoint')
        ) v(offset_days, mkey, label)
      LOOP
        _due := r.renewal_date - m.offset_days;
        CONTINUE WHEN _due < current_date;
        _key := 'renewal:' || r.id::text || ':' || m.mkey;
        INSERT INTO public.manual_tasks (title, description, task_type, priority, status, task_status,
                due_date, owner_user_id, related_source, related_type, related_entity_id,
                related_route, related_company, automation_key)
        VALUES (m.label || ' — ' || _client_name,
                'Automatic renewal milestone (' || m.offset_days || ' days before ' || r.renewal_date::text || ')',
                'renewal',
                CASE WHEN m.offset_days <= 30 THEN 'High' ELSE 'Medium' END,
                'To Do', 'Open', _due::timestamptz, _owner, 'renewal', 'renewal', r.id,
                '/renewals?renewal=' || r.id::text, _client_name, _key)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN _tasks := _tasks + 1; END IF;

        IF _due <= current_date AND _owner IS NOT NULL THEN
          IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'milestone_' || m.mkey, _owner,
               m.label, _client_name || ' — renewal due ' || r.renewal_date::text)
          THEN _notifs := _notifs + 1; END IF;
        END IF;
      END LOOP;

      -- overdue escalation
      IF r.renewal_date < current_date THEN
        _key := 'renewal:' || r.id::text || ':overdue';
        INSERT INTO public.manual_tasks (title, description, task_type, priority, status, task_status,
                due_date, owner_user_id, related_source, related_type, related_entity_id,
                related_route, related_company, automation_key)
        VALUES ('Overdue renewal — ' || _client_name,
                'Renewal date ' || r.renewal_date::text || ' passed while the cycle is still open',
                'renewal', 'Critical', 'To Do', 'Open', r.renewal_date::timestamptz, _owner,
                'renewal', 'renewal', r.id, '/renewals?renewal=' || r.id::text, _client_name, _key)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN _tasks := _tasks + 1; END IF;

        IF _owner IS NOT NULL THEN
          IF public.renewal_notify(r.id, r.client_id, r.partner_id, 'overdue', _owner,
               'Renewal overdue', _client_name || ' renewal was due ' || r.renewal_date::text, 'warning')
          THEN _notifs := _notifs + 1; END IF;
        END IF;
        _notifs := _notifs + public.renewal_notify_hq(r.id, r.client_id, r.partner_id, 'overdue_hq',
          'Renewal overdue', _client_name || ' renewal was due ' || r.renewal_date::text);
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
$$;

-- 6. Authorized owner reassignment ------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_renewal_owner(
  _renewal_id uuid, _new_owner uuid, _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.renewals%ROWTYPE;
  _actor uuid := auth.uid();
  _actor_name text; _prev_name text; _new_name text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO r FROM public.renewals WHERE id = _renewal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RENEWAL_NOT_FOUND'; END IF;
  IF NOT public.can_manage_client(r.client_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: you cannot manage renewals for this client';
  END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'RENEWAL_CLOSED: closed renewals are read-only'; END IF;

  IF _new_owner IS NOT NULL THEN
    SELECT coalesce(full_name, email) INTO _new_name FROM public.profiles p
     WHERE p.id = _new_owner AND coalesce(p.is_active,true)
       AND (coalesce(p.is_hq,false) OR r.partner_uuid IS NULL OR p.partner_id = r.partner_uuid);
    IF _new_name IS NULL THEN RAISE EXCEPTION 'OWNER_NOT_ELIGIBLE: user cannot own this renewal'; END IF;
  END IF;

  SELECT coalesce(full_name, email) INTO _prev_name FROM public.profiles WHERE id = r.assigned_user_id;
  SELECT coalesce(full_name, email) INTO _actor_name FROM public.profiles WHERE id = _actor;

  UPDATE public.renewals
     SET assigned_user_id = _new_owner, assigned_owner = _new_name, updated_at = now()
   WHERE id = _renewal_id;

  -- move only still-open operational tasks
  UPDATE public.manual_tasks
     SET owner_user_id = _new_owner, updated_at = now()
   WHERE automation_key LIKE 'renewal:' || _renewal_id::text || ':%'
     AND task_status <> 'Completed';

  INSERT INTO public.renewal_activities (renewal_id, action, performed_by, notes)
  VALUES (_renewal_id, 'owner_reassigned', coalesce(_actor_name, _actor::text),
          'Owner ' || coalesce(_prev_name,'Unassigned') || ' → ' || coalesce(_new_name,'Unassigned') ||
          coalesce(' · ' || _reason, ''));

  PERFORM public.renewal_notify(r.id, r.client_id, r.partner_id,
    'owner_changed_' || to_char(now(),'YYYYMMDDHH24MISS'), _new_owner,
    'Renewal assigned to you', 'You are now the owner of a renewal due ' || coalesce(r.renewal_date::text,'—'));

  RETURN jsonb_build_object('renewal_id', _renewal_id, 'previous_owner', r.assigned_user_id,
                            'new_owner', _new_owner, 'actor', _actor, 'at', now(), 'reason', _reason);
END;
$$;

-- 7. Closure cleanup (atomic with close_renewal) -----------------------------------
CREATE OR REPLACE FUNCTION public.renewals_closure_cleanup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _client_name text; _event text; _label text;
BEGIN
  IF NEW.closed_at IS NULL OR OLD.closed_at IS NOT NULL THEN RETURN NEW; END IF;

  UPDATE public.manual_tasks
     SET task_status = 'Completed', status = 'Cancelled', completed_at = now(), updated_at = now(),
         description = coalesce(description,'') || ' · Closed automatically when the renewal was closed.'
   WHERE automation_key LIKE 'renewal:' || NEW.id::text || ':%'
     AND task_status <> 'Completed';

  SELECT commercial_name INTO _client_name FROM public.clients WHERE id = NEW.client_id;
  _event := CASE WHEN NEW.outcome = 'renewed' THEN 'closed_renewed' ELSE 'closed_lost' END;
  _label := CASE WHEN NEW.outcome = 'renewed' THEN 'Renewal closed as Renewed' ELSE 'Renewal closed as Lost' END;

  PERFORM public.renewal_notify(NEW.id, NEW.client_id, NEW.partner_id, _event,
    NEW.assigned_user_id, _label, coalesce(_client_name,'Client') || ' — renewal cycle closed',
    CASE WHEN NEW.outcome = 'renewed' THEN 'success' ELSE 'warning' END);
  PERFORM public.renewal_notify_hq(NEW.id, NEW.client_id, NEW.partner_id, _event || '_hq',
    _label, coalesce(_client_name,'Client') || ' — renewal cycle closed',
    CASE WHEN NEW.outcome = 'renewed' THEN 'success' ELSE 'info' END);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renewals_closure_cleanup ON public.renewals;
CREATE TRIGGER trg_renewals_closure_cleanup
AFTER UPDATE OF closed_at ON public.renewals
FOR EACH ROW EXECUTE FUNCTION public.renewals_closure_cleanup();

-- 8. Grants -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.renewal_automation_run(int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renewal_automation_run(int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_renewal_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_renewal_owner(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.renewal_operational_state(text,timestamptz,text,date,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.renewal_notify(uuid,uuid,text,text,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renewal_notify_hq(uuid,uuid,text,text,text,text,text) FROM PUBLIC;