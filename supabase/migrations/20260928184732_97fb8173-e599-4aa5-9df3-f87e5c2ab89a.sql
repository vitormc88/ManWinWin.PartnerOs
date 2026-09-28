CREATE OR REPLACE FUNCTION public.license_expiry_recipient(_client_id uuid, OUT recipient uuid, OUT rule text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _pu uuid; _am uuid; _mo uuid;
BEGIN
  SELECT partner_uuid, account_manager_id, manager_owner_id INTO _pu, _am, _mo FROM public.clients WHERE id = _client_id;
  IF _pu IS NOT NULL THEN
    SELECT p.id, 'partner_user:'||ur.role INTO recipient, rule
      FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.partner_id = _pu AND coalesce(p.is_active,true)
       AND ur.role::text IN ('partner_admin','partner_manager','partner_sales')
     ORDER BY CASE ur.role::text WHEN 'partner_admin' THEN 1 WHEN 'partner_manager' THEN 2 ELSE 3 END, p.created_at
     LIMIT 1;
    IF recipient IS NOT NULL THEN RETURN; END IF;
    SELECT pr.id, 'partner.assigned_manager_id' INTO recipient, rule FROM public.partners pa
      JOIN public.profiles pr ON pr.id = pa.assigned_manager_id AND coalesce(pr.is_active,true) WHERE pa.id = _pu;
    IF recipient IS NOT NULL THEN RETURN; END IF;
    SELECT pr.id, 'partner.account_owner_id' INTO recipient, rule FROM public.partners pa
      JOIN public.profiles pr ON pr.id = pa.account_owner_id AND coalesce(pr.is_active,true) WHERE pa.id = _pu;
    IF recipient IS NOT NULL THEN RETURN; END IF;
  END IF;
  SELECT id, 'client.account_manager_id' INTO recipient, rule FROM public.profiles WHERE id = _am AND coalesce(is_active,true);
  IF recipient IS NOT NULL THEN RETURN; END IF;
  SELECT id, 'client.manager_owner_id' INTO recipient, rule FROM public.profiles WHERE id = _mo AND coalesce(is_active,true);
  IF recipient IS NOT NULL THEN RETURN; END IF;
  recipient := NULL; rule := 'hq_admins';
END $$;
REVOKE ALL ON FUNCTION public.license_expiry_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.license_expiry_recipient(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_license_expiry(_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  l public.licenses%ROWTYPE; _kind text; _cname text; _pid text;
  _ev record; _days int; _thr int; _owner uuid; _rule text; _key text; _label text;
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
      _thr := CASE WHEN _days <= 7 THEN 7 WHEN _days <= 30 THEN 30 ELSE 60 END;

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

      SELECT recipient, rule INTO _owner, _rule FROM public.license_expiry_recipient(l.client_id);

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
                   'threshold', _thr, 'recipient', coalesce(_owner::text,'hq_admins'), 'rule', _rule, 'result', 'eligible');
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('expiry_candidates_evaluated', _eval, 'expiry_notifications_created', _created,
    'covered_by_renewal', _covered, 'unknown_classification', _unknown, 'excluded', _excluded,
    'dry_run', _dry_run, 'detail', _detail);
END $$;
REVOKE ALL ON FUNCTION public.notify_license_expiry(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_license_expiry(boolean) TO service_role;