-- Partner Academy — final hardening (additive, idempotent)

-- 1. Effective Academy access (reuses the authoritative permission model)
CREATE OR REPLACE FUNCTION public.can_access_academy()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_academy_admin()
      OR public.can_view_module(auth.uid(), 'onboarding')
$$;

REVOKE ALL ON FUNCTION public.can_access_academy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_academy() TO authenticated;

-- 2. Published SELECT policies require effective Academy access
DROP POLICY IF EXISTS academy_phases_read_published ON public.academy_phases;
CREATE POLICY academy_phases_read_published ON public.academy_phases FOR SELECT TO authenticated
USING (public.is_academy_admin() OR (status = 'published' AND public.can_access_academy()));

DROP POLICY IF EXISTS academy_modules_read_published ON public.academy_modules;
CREATE POLICY academy_modules_read_published ON public.academy_modules FOR SELECT TO authenticated
USING (
  public.is_academy_admin()
  OR (status = 'published' AND public.can_access_academy() AND (
        phase_id IS NULL
        OR EXISTS (SELECT 1 FROM public.academy_phases p WHERE p.id = phase_id AND p.status = 'published')
     ))
);

DROP POLICY IF EXISTS academy_missions_read_published ON public.academy_missions;
CREATE POLICY academy_missions_read_published ON public.academy_missions FOR SELECT TO authenticated
USING (
  public.is_academy_admin()
  OR (status = 'published' AND public.can_access_academy() AND EXISTS (
        SELECT 1 FROM public.academy_modules m
        WHERE m.id = module_id AND m.status = 'published'
          AND (m.phase_id IS NULL OR EXISTS (
                SELECT 1 FROM public.academy_phases p WHERE p.id = m.phase_id AND p.status = 'published'))
     ))
);

DROP POLICY IF EXISTS academy_resources_read_published ON public.academy_resources;
CREATE POLICY academy_resources_read_published ON public.academy_resources FOR SELECT TO authenticated
USING (
  public.is_academy_admin()
  OR (status = 'published' AND public.can_access_academy()
      AND EXISTS (
        SELECT 1 FROM public.academy_modules m
        WHERE m.id = module_id AND m.status = 'published'
          AND (m.phase_id IS NULL OR EXISTS (
                SELECT 1 FROM public.academy_phases p WHERE p.id = m.phase_id AND p.status = 'published')))
      AND (mission_id IS NULL OR EXISTS (
        SELECT 1 FROM public.academy_missions ms WHERE ms.id = mission_id AND ms.status = 'published')))
);

-- 3. Learner RPCs enforce the same effective access
CREATE OR REPLACE FUNCTION public.academy_complete_mission(_mission_id uuid, _completed boolean)
RETURNS TABLE (out_module_id uuid, out_progress_pct integer, out_status text, out_is_completed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _m record;
  _prev_id uuid;
  _pct int;
  _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_access_academy() THEN
    RAISE EXCEPTION 'You do not have access to the Partner Academy';
  END IF;

  SELECT m.id, m.module_id, m.status, m.is_locked, m.sort_order, mo.status AS module_status
    INTO _m
    FROM public.academy_missions m
    JOIN public.academy_modules mo ON mo.id = m.module_id
   WHERE m.id = _mission_id;

  IF _m.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF _m.status <> 'published' OR _m.module_status <> 'published' THEN
    RAISE EXCEPTION 'Mission is not published';
  END IF;

  IF _m.is_locked AND _completed THEN
    SELECT p.id INTO _prev_id
      FROM public.academy_missions p
     WHERE p.module_id = _m.module_id AND p.status = 'published' AND p.sort_order < _m.sort_order
     ORDER BY p.sort_order DESC LIMIT 1;
    IF _prev_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.academy_mission_progress mp
       WHERE mp.user_id = _uid AND mp.mission_id = _prev_id AND mp.is_completed
    ) THEN
      RAISE EXCEPTION 'This mission unlocks after the previous mission is completed';
    END IF;
  END IF;

  INSERT INTO public.academy_mission_progress (user_id, mission_id, module_id, is_completed, completed_at)
  VALUES (_uid, _m.id, _m.module_id, _completed, CASE WHEN _completed THEN now() END)
  ON CONFLICT (user_id, mission_id) DO UPDATE
    SET is_completed = EXCLUDED.is_completed,
        completed_at = EXCLUDED.completed_at,
        module_id    = EXCLUDED.module_id,
        updated_at   = now();

  _pct := public.academy_module_progress_pct(_uid, _m.module_id);
  _status := CASE WHEN _pct >= 100 THEN 'completed' WHEN _pct > 0 THEN 'in_progress' ELSE 'not_started' END;

  INSERT INTO public.academy_module_progress (user_id, module_id, status, progress_pct, started_at, completed_at)
  VALUES (_uid, _m.module_id, _status, _pct, now(), CASE WHEN _pct >= 100 THEN now() END)
  ON CONFLICT (user_id, module_id) DO UPDATE
    SET status = CASE WHEN public.academy_module_progress.status = 'certified'
                      THEN 'certified' ELSE EXCLUDED.status END,
        progress_pct = EXCLUDED.progress_pct,
        started_at   = COALESCE(public.academy_module_progress.started_at, EXCLUDED.started_at),
        completed_at = EXCLUDED.completed_at,
        updated_at   = now();

  RETURN QUERY SELECT _m.module_id, _pct, _status, _completed;
END $$;

CREATE OR REPLACE FUNCTION public.academy_set_checklist_state(_mission_id uuid, _state jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _module_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_access_academy() THEN
    RAISE EXCEPTION 'You do not have access to the Partner Academy';
  END IF;
  IF _state IS NULL OR jsonb_typeof(_state) <> 'object' THEN
    RAISE EXCEPTION 'Invalid checklist state';
  END IF;

  SELECT m.module_id INTO _module_id
    FROM public.academy_missions m
    JOIN public.academy_modules mo ON mo.id = m.module_id
   WHERE m.id = _mission_id AND m.status = 'published' AND mo.status = 'published';

  IF _module_id IS NULL THEN RAISE EXCEPTION 'Mission not found or not published'; END IF;

  INSERT INTO public.academy_mission_progress (user_id, mission_id, module_id, checklist_state)
  VALUES (_uid, _mission_id, _module_id, _state)
  ON CONFLICT (user_id, mission_id) DO UPDATE
    SET checklist_state = EXCLUDED.checklist_state,
        module_id       = EXCLUDED.module_id,
        updated_at      = now();
END $$;

-- 4. Optimistic-concurrency admin update (atomic compare-and-update)
CREATE OR REPLACE FUNCTION public.academy_update_record(
  _entity text,
  _id uuid,
  _patch jsonb,
  _expected_updated_at timestamptz
)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _table text;
  _assignments text;
  _new timestamptz;
BEGIN
  IF NOT public.is_academy_admin() THEN
    RAISE EXCEPTION 'Only Academy admins can edit content';
  END IF;

  _table := CASE _entity
    WHEN 'academy_phases'    THEN 'academy_phases'
    WHEN 'academy_modules'   THEN 'academy_modules'
    WHEN 'academy_missions'  THEN 'academy_missions'
    WHEN 'academy_resources' THEN 'academy_resources'
  END;
  IF _table IS NULL THEN RAISE EXCEPTION 'Unknown Academy entity %', _entity; END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'Invalid patch payload';
  END IF;

  SELECT string_agg(format('%I = ($1->>%L)::%s', c.column_name, c.column_name, c.data_type), ', ')
    INTO _assignments
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = _table
    AND c.column_name NOT IN ('id', 'created_at', 'updated_at')
    AND _patch ? c.column_name;

  IF _assignments IS NULL THEN
    RAISE EXCEPTION 'No updatable fields supplied';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET %s, updated_at = now()
      WHERE id = $2 AND (updated_at = $3 OR ($3 IS NULL AND updated_at IS NULL))
      RETURNING updated_at', _table, _assignments)
  INTO _new
  USING _patch, _id, _expected_updated_at;

  IF _new IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE 1=0) THEN NULL; END IF;
    RAISE EXCEPTION 'ACADEMY_CONFLICT: this record changed on the server since you opened it. Refresh and reapply your changes.';
  END IF;

  RETURN _new;
END $$;

-- 5. Least-privilege EXECUTE grants on every Academy SECURITY DEFINER helper
REVOKE ALL ON FUNCTION public.academy_module_progress_pct(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_complete_mission(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_set_checklist_state(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_swap_sort_order(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_update_record(text, uuid, jsonb, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_academy_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academy_complete_mission(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_set_checklist_state(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_swap_sort_order(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_update_record(text, uuid, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_academy_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_module_progress_pct(uuid, uuid) TO service_role;