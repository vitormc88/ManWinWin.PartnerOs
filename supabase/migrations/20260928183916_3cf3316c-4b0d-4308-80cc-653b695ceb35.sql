-- Phase 3 — Scheduler and date-based notifications (TEST). Cron NOT created here.
-- Rollback: DROP FUNCTION public.notifications_daily_run(boolean), public.notify_license_expiry(boolean),
--           public.notify_overdue_tasks(boolean), public.license_expiry_kind(public.licenses);

CREATE OR REPLACE FUNCTION public.license_expiry_kind(l public.licenses)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _m text; _keep boolean; _use boolean; _saas boolean; _perp boolean;
BEGIN
  IF coalesce(l.is_draft,false) THEN RETURN 'excluded_draft'; END IF;
  IF l.replaced_by_license_id IS NOT NULL
     OR lower(coalesce(l.license_status,'active')) IN ('replaced','superseded') THEN RETURN 'excluded_replaced'; END IF;
  IF lower(coalesce(l.license_status,'active')) <> 'active' THEN RETURN 'excluded_inactive'; END IF;
  IF EXISTS (SELECT 1 FROM public.clients c WHERE c.id = l.client_id
              AND (coalesce(c.is_inactive,false)
                   OR lower(coalesce(c.status,'active')) IN ('inactive','terminated','churned','cancelled','closed')))
    THEN RETURN 'excluded_client_inactive'; END IF;

  _m := upper(regexp_replace(coalesce(l.license_model,'')||' '||coalesce(l.product,'')||' '||coalesce(l.edition,''), '[^A-Za-z]', '', 'g'));
  _keep := _m LIKE '%KEEPIT%';
  _use  := _m LIKE '%USEIT%';
  _saas := lower(coalesce(l.deployment_type,'')) = 'saas' OR upper(coalesce(l.license_model,'')) = 'SAAS';
  _perp := lower(coalesce(l.periodicity,'')) = 'perpetual';

  IF _keep AND _use THEN RETURN 'unknown'; END IF;
  IF _keep THEN RETURN CASE WHEN _saas THEN 'keepit_saas' ELSE 'perpetual' END; END IF;
  IF _use THEN
    IF _perp THEN RETURN 'unknown'; END IF;
    RETURN CASE WHEN _saas THEN 'saas' ELSE 'useit_term' END;
  END IF;
  IF _perp THEN RETURN CASE WHEN _saas THEN 'unknown' ELSE 'perpetual' END; END IF;
  IF _saas THEN RETURN 'saas'; END IF;
  RETURN 'unknown';   -- legacy / ambiguous: a date alone never proves expiry
END $$;

-- Overdue tasks ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_overdue_tasks(_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t record; _found int := 0; _created int := 0; _key text;
BEGIN
  FOR t IN
    SELECT 'lead_tasks' src, lt.id, lt.title, lt.assigned_user_id who, lt.due_date due,
           '/incoming-leads/'||lt.lead_id link
      FROM public.lead_tasks lt
     WHERE lt.due_date IS NOT NULL AND lt.due_date < current_date AND lt.assigned_user_id IS NOT NULL
       AND lower(coalesce(lt.status,'')) NOT IN ('done','completed','cancelled')
    UNION ALL
    SELECT 'deal_tasks', dt.id, dt.title, dt.assigned_user_id, dt.due_date, '/deals/'||dt.deal_id
      FROM public.deal_tasks dt
     WHERE dt.due_date IS NOT NULL AND dt.due_date < current_date AND dt.assigned_user_id IS NOT NULL
       AND NOT coalesce(dt.is_completed,false)
       AND lower(coalesce(dt.status,'')) NOT IN ('done','completed','cancelled')
    UNION ALL
    SELECT 'manual_tasks', mt.id, mt.title, mt.owner_user_id, (mt.due_date AT TIME ZONE 'UTC')::date,
           coalesce(nullif(mt.related_route,''),'/tasks')
      FROM public.manual_tasks mt
     WHERE mt.due_date IS NOT NULL AND (mt.due_date AT TIME ZONE 'UTC')::date < current_date
       AND mt.owner_user_id IS NOT NULL
       AND lower(coalesce(mt.status,'')) NOT IN ('done','completed','cancelled')
       AND lower(coalesce(mt.task_status,'')) NOT IN ('done','completed','cancelled')
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.who AND coalesce(p.is_active,true));
    _found := _found + 1;
    _key := 'task.overdue:'||t.src||':'||t.id||':'||t.due;   -- re-armed by a new due date
    IF _dry_run THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE dedupe_key = _key) THEN _created := _created + 1; END IF;
    ELSIF public.notify('task.overdue', t.who, 'Task overdue',
            '"'||coalesce(t.title,'Task')||'" was due '||t.due||'.',
            'important', t.src, t.id, t.link, _key, true, 'warning', 'task_overdue') THEN
      _created := _created + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('overdue_tasks_found', _found, 'overdue_notifications_created', _created, 'dry_run', _dry_run);
END $$;

-- Licence / SaaS / S&TA expiry --------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_license_expiry(_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  l public.licenses%ROWTYPE; _kind text; _cname text; _pid text;
  _ev record; _days int; _thr int; _owner uuid; _key text; _label text;
  _eval int := 0; _created int := 0; _covered int := 0; _unknown int := 0; _excluded int := 0;
  _detail jsonb := '[]'::jsonb; a record;
BEGIN
  FOR l IN SELECT * FROM public.licenses LOOP
    _kind := public.license_expiry_kind(l);
    IF _kind LIKE 'excluded%' THEN _excluded := _excluded + 1; CONTINUE; END IF;
    IF _kind = 'unknown' THEN _unknown := _unknown + 1; END IF;
    SELECT commercial_name, partner_id INTO _cname, _pid FROM public.clients WHERE id = l.client_id;

    FOR _ev IN
      SELECT * FROM (VALUES
        ('license', CASE WHEN _kind IN ('saas','keepit_saas','useit_term') THEN l.license_end_date END,
         CASE _kind WHEN 'useit_term' THEN 'UseIT term' ELSE 'SaaS service' END),
        ('sat', CASE WHEN coalesce(l.sat_active,false) THEN l.sat_end_date END, 'S&TA')
      ) v(component, end_date, label)
      WHERE v.end_date IS NOT NULL
    LOOP
      _days := _ev.end_date - current_date;
      CONTINUE WHEN _days < 0 OR _days > 60;
      _eval := _eval + 1;
      _thr := CASE WHEN _days <= 7 THEN 7 WHEN _days <= 30 THEN 30 ELSE 60 END;  -- catch-up: smallest due threshold only

      IF EXISTS (SELECT 1 FROM public.renewals rr
                  WHERE rr.closed_at IS NULL
                    AND rr.status NOT IN ('Won','Lost','Renewed','Completed','Cancelled')
                    AND ((l.contract_id IS NOT NULL AND rr.contract_id = l.contract_id)
                         OR (rr.client_id = l.client_id
                             AND rr.renewal_date BETWEEN _ev.end_date + 1 - 45 AND _ev.end_date + 1 + 45))) THEN
        _covered := _covered + 1;
        _detail := _detail || jsonb_build_object('license_id', l.id, 'component', _ev.component, 'kind', _kind, 'result', 'covered_by_renewal');
        CONTINUE;
      END IF;

      -- owner of an active renewal for this client (existing ownership logic), else HQ admins
      SELECT public.resolve_renewal_owner(rr.id) INTO _owner FROM public.renewals rr
       WHERE rr.client_id = l.client_id AND rr.closed_at IS NULL
         AND rr.status NOT IN ('Won','Lost','Renewed','Completed','Cancelled')
       ORDER BY abs(rr.renewal_date - _ev.end_date) LIMIT 1;

      _label := _ev.label || ' expires in ' || _days || ' day' || CASE WHEN _days = 1 THEN '' ELSE 's' END;
      FOR a IN
        SELECT _owner AS id WHERE _owner IS NOT NULL
        UNION ALL
        SELECT DISTINCT p.id FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'hq_admin'
         WHERE _owner IS NULL AND coalesce(p.is_active,true)
      LOOP
        _key := 'expiry:'||_ev.component||':'||l.id||':'||_ev.end_date||':'||_thr||':'||a.id;
        IF _dry_run THEN
          IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE dedupe_key = _key) THEN _created := _created + 1; END IF;
        ELSIF public.notify('expiry.'||_ev.component||'.'||_thr, a.id, _label,
                coalesce(_cname,'Client')||' — '||_label||' (ends '||_ev.end_date||').',
                'action_required', 'license', l.id, '/clients/'||l.client_id, _key, true, 'warning', 'license_expiry',
                _pid, l.client_id, NULL) THEN
          _created := _created + 1;
        END IF;
      END LOOP;
      _detail := _detail || jsonb_build_object('license_id', l.id, 'component', _ev.component, 'kind', _kind,
                   'threshold', _thr, 'recipient', coalesce(_owner::text,'hq_admins'), 'result', 'eligible');
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('expiry_candidates_evaluated', _eval, 'expiry_notifications_created', _created,
    'covered_by_renewal', _covered, 'unknown_classification', _unknown, 'excluded', _excluded,
    'dry_run', _dry_run, 'detail', _detail);
END $$;

-- Orchestrator -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_daily_run(_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _s jsonb := jsonb_build_object('ran_at', now(), 'dry_run', _dry_run);
        _r jsonb; _fail jsonb := '{}'::jsonb; _step text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('notifications_daily_run')) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another run in progress');
  END IF;

  FOREACH _step IN ARRAY ARRAY['renewals','overdue_tasks','license_expiry'] LOOP
    BEGIN
      IF _step = 'renewals' THEN
        _r := CASE WHEN _dry_run THEN jsonb_build_object('skipped','dry_run') ELSE public.renewal_automation_run() END;
      ELSIF _step = 'overdue_tasks' THEN _r := public.notify_overdue_tasks(_dry_run);
      ELSE _r := public.notify_license_expiry(_dry_run) - 'detail';
      END IF;
      _s := _s || jsonb_build_object(_step, _r);
    EXCEPTION WHEN OTHERS THEN
      _fail := _fail || jsonb_build_object(_step, SQLERRM);
      IF NOT _dry_run THEN
        BEGIN
          PERFORM public.notify_hq_admins('scheduler.step_failed', 'Daily notifications step failed: '||_step,
            'The '||_step||' step of the daily notifications run failed. Check the audit log.', NULL,
            'scheduler.failed:'||_step||':'||current_date, true, 'action_required');
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END IF;
    END;
  END LOOP;

  _s := _s || jsonb_build_object('failures', _fail,
          'status', CASE WHEN _fail = '{}'::jsonb THEN 'completed' ELSE 'completed_with_failures' END);
  IF NOT _dry_run THEN
    INSERT INTO public.audit_logs (entity_type, action_type, new_value, notes)
    VALUES ('notifications_daily_run', 'scheduler_run', _s, _s->>'status');
  END IF;
  RETURN _s;
END $$;

REVOKE ALL ON FUNCTION public.license_expiry_kind(public.licenses) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_overdue_tasks(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_license_expiry(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notifications_daily_run(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.license_expiry_kind(public.licenses) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_overdue_tasks(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_license_expiry(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_daily_run(boolean) TO service_role;