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
        _r := CASE WHEN _dry_run THEN jsonb_build_object('skipped','dry_run')
                   ELSE public.renewal_automation_run(200, 120, NULL::uuid[]) END;
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
REVOKE ALL ON FUNCTION public.notifications_daily_run(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_daily_run(boolean) TO service_role;