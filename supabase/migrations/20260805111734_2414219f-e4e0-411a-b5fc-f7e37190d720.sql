-- ─────────────────────────────────────────────────────────────
-- Partner Academy — pre-content hardening (additive, idempotent)
-- ─────────────────────────────────────────────────────────────

-- 1. Resource type alignment with the editor vocabulary
UPDATE public.academy_resources SET resource_type = 'pdf'      WHERE resource_type = 'file';
UPDATE public.academy_resources SET resource_type = 'template' WHERE resource_type = 'markdown';
UPDATE public.academy_resources SET resource_type = 'link'
  WHERE resource_type NOT IN ('pdf','checklist','word','powerpoint','template','video','link');

ALTER TABLE public.academy_resources DROP CONSTRAINT IF EXISTS academy_resources_resource_type_check;
ALTER TABLE public.academy_resources ADD CONSTRAINT academy_resources_resource_type_check
  CHECK (resource_type = ANY (ARRAY['pdf','checklist','word','powerpoint','template','video','link']));

ALTER TABLE public.academy_resources DROP CONSTRAINT IF EXISTS academy_resources_external_url_scheme;
ALTER TABLE public.academy_resources ADD CONSTRAINT academy_resources_external_url_scheme
  CHECK (external_url IS NULL OR external_url = '' OR external_url ~* '^https?://[^\s]+$');

-- 2. Resource parent coherence: a mission resource resolves through its module
CREATE OR REPLACE FUNCTION public.academy_resources_normalize_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _mission_module uuid;
BEGIN
  IF NEW.mission_id IS NOT NULL THEN
    SELECT module_id INTO _mission_module FROM public.academy_missions WHERE id = NEW.mission_id;
    IF _mission_module IS NULL THEN
      RAISE EXCEPTION 'Mission % not found for resource', NEW.mission_id;
    END IF;
    IF NEW.module_id IS NOT NULL AND NEW.module_id <> _mission_module THEN
      RAISE EXCEPTION 'Resource module does not match the mission module';
    END IF;
    NEW.module_id := _mission_module;
  ELSIF NEW.module_id IS NULL THEN
    RAISE EXCEPTION 'A resource must belong to a module or a mission';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_academy_resources_normalize_parent ON public.academy_resources;
CREATE TRIGGER trg_academy_resources_normalize_parent
  BEFORE INSERT OR UPDATE ON public.academy_resources
  FOR EACH ROW EXECUTE FUNCTION public.academy_resources_normalize_parent();

UPDATE public.academy_resources r
   SET module_id = m.module_id
  FROM public.academy_missions m
 WHERE r.mission_id = m.id AND r.module_id IS DISTINCT FROM m.module_id;

-- 3. Non-negative / sane numeric checks
ALTER TABLE public.academy_phases   DROP CONSTRAINT IF EXISTS academy_phases_sort_order_check;
ALTER TABLE public.academy_phases   ADD  CONSTRAINT academy_phases_sort_order_check   CHECK (sort_order >= 0);
ALTER TABLE public.academy_modules  DROP CONSTRAINT IF EXISTS academy_modules_sane_numbers;
ALTER TABLE public.academy_modules  ADD  CONSTRAINT academy_modules_sane_numbers
  CHECK (sort_order >= 0 AND estimated_duration_minutes >= 0 AND version >= 1);
ALTER TABLE public.academy_missions DROP CONSTRAINT IF EXISTS academy_missions_sane_numbers;
ALTER TABLE public.academy_missions ADD  CONSTRAINT academy_missions_sane_numbers
  CHECK (sort_order >= 0 AND estimated_duration_minutes >= 0 AND mission_number >= 0 AND version >= 1);
ALTER TABLE public.academy_resources DROP CONSTRAINT IF EXISTS academy_resources_sort_order_check;
ALTER TABLE public.academy_resources ADD  CONSTRAINT academy_resources_sort_order_check CHECK (sort_order >= 0);

CREATE INDEX IF NOT EXISTS academy_missions_module_sort_idx  ON public.academy_missions (module_id, sort_order);
CREATE INDEX IF NOT EXISTS academy_resources_module_sort_idx ON public.academy_resources (module_id, sort_order);
CREATE INDEX IF NOT EXISTS academy_resources_mission_idx     ON public.academy_resources (mission_id);
CREATE INDEX IF NOT EXISTS academy_mission_progress_user_idx ON public.academy_mission_progress (user_id, module_id);

-- 4. Relational integrity: mission_id and module_id can no longer disagree
ALTER TABLE public.academy_missions DROP CONSTRAINT IF EXISTS academy_missions_id_module_id_key;
ALTER TABLE public.academy_missions ADD  CONSTRAINT academy_missions_id_module_id_key UNIQUE (id, module_id);

UPDATE public.academy_mission_progress p
   SET module_id = m.module_id
  FROM public.academy_missions m
 WHERE p.mission_id = m.id AND p.module_id IS DISTINCT FROM m.module_id;

ALTER TABLE public.academy_mission_progress DROP CONSTRAINT IF EXISTS academy_mission_progress_mission_id_fkey;
ALTER TABLE public.academy_mission_progress DROP CONSTRAINT IF EXISTS academy_mission_progress_mission_module_fkey;
ALTER TABLE public.academy_mission_progress ADD  CONSTRAINT academy_mission_progress_mission_module_fkey
  FOREIGN KEY (mission_id, module_id) REFERENCES public.academy_missions (id, module_id) ON DELETE CASCADE;

-- 5. Module progress status vocabulary: "completed" is not "certified"
ALTER TABLE public.academy_module_progress DROP CONSTRAINT IF EXISTS academy_module_progress_status_check;
ALTER TABLE public.academy_module_progress ADD  CONSTRAINT academy_module_progress_status_check
  CHECK (status = ANY (ARRAY['not_started','in_progress','completed','ready_for_certification','certification_failed','certified']));

-- 6. Visibility: published children stay hidden under non-published parents
DROP POLICY IF EXISTS academy_modules_read_published ON public.academy_modules;
CREATE POLICY academy_modules_read_published ON public.academy_modules FOR SELECT TO authenticated
USING (
  public.is_academy_admin()
  OR (status = 'published' AND (
        phase_id IS NULL
        OR EXISTS (SELECT 1 FROM public.academy_phases p WHERE p.id = phase_id AND p.status = 'published')
     ))
);

DROP POLICY IF EXISTS academy_missions_read_published ON public.academy_missions;
CREATE POLICY academy_missions_read_published ON public.academy_missions FOR SELECT TO authenticated
USING (
  public.is_academy_admin()
  OR (status = 'published' AND EXISTS (
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
  OR (status = 'published'
      AND EXISTS (
        SELECT 1 FROM public.academy_modules m
        WHERE m.id = module_id AND m.status = 'published'
          AND (m.phase_id IS NULL OR EXISTS (
                SELECT 1 FROM public.academy_phases p WHERE p.id = m.phase_id AND p.status = 'published')))
      AND (mission_id IS NULL OR EXISTS (
        SELECT 1 FROM public.academy_missions ms WHERE ms.id = mission_id AND ms.status = 'published')))
);

-- 7. Progress is read-only over the Data API; writes go through RPCs only
DROP POLICY IF EXISTS academy_mission_progress_own ON public.academy_mission_progress;
CREATE POLICY academy_mission_progress_read_own ON public.academy_mission_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS academy_module_progress_own ON public.academy_module_progress;
CREATE POLICY academy_module_progress_read_own ON public.academy_module_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.academy_phases, public.academy_modules, public.academy_missions,
              public.academy_resources, public.academy_mission_progress,
              public.academy_module_progress FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.academy_mission_progress FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.academy_module_progress  FROM authenticated;
GRANT SELECT ON public.academy_mission_progress TO authenticated;
GRANT SELECT ON public.academy_module_progress  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_phases    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_modules   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_missions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_resources TO authenticated;
GRANT ALL ON public.academy_phases, public.academy_modules, public.academy_missions,
             public.academy_resources, public.academy_mission_progress,
             public.academy_module_progress TO service_role;

-- 8. Server-authoritative progress helpers
CREATE OR REPLACE FUNCTION public.academy_module_progress_pct(_user_id uuid, _module_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 0 THEN 0
              ELSE round((count(*) FILTER (WHERE mp.is_completed)::numeric / count(*)) * 100)::int END
  FROM public.academy_missions m
  LEFT JOIN public.academy_mission_progress mp
    ON mp.mission_id = m.id AND mp.user_id = _user_id
  WHERE m.module_id = _module_id
    AND m.status = 'published'
    AND m.is_required
    AND m.item_kind <> 'certification'
$$;

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

-- 9. Transactional, admin-only reordering
CREATE OR REPLACE FUNCTION public.academy_swap_sort_order(_entity text, _a uuid, _b uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _table text;
BEGIN
  IF NOT public.is_academy_admin() THEN
    RAISE EXCEPTION 'Only Academy admins can reorder content';
  END IF;
  _table := CASE _entity
    WHEN 'phases'    THEN 'academy_phases'
    WHEN 'modules'   THEN 'academy_modules'
    WHEN 'missions'  THEN 'academy_missions'
    WHEN 'resources' THEN 'academy_resources'
  END;
  IF _table IS NULL THEN RAISE EXCEPTION 'Unknown Academy entity %', _entity; END IF;
  IF _a = _b THEN RETURN; END IF;

  EXECUTE format(
    'UPDATE public.%I t SET sort_order = c.so, updated_at = now() FROM (
        SELECT $1::uuid AS id, (SELECT sort_order FROM public.%I WHERE id = $2) AS so
        UNION ALL
        SELECT $2::uuid, (SELECT sort_order FROM public.%I WHERE id = $1)
     ) c WHERE t.id = c.id AND c.so IS NOT NULL', _table, _table, _table)
  USING _a, _b;
END $$;

REVOKE ALL ON FUNCTION public.academy_complete_mission(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_set_checklist_state(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_swap_sort_order(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_module_progress_pct(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_complete_mission(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_set_checklist_state(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_swap_sort_order(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_module_progress_pct(uuid, uuid) TO authenticated;

-- 10. Academy attachments in the existing private training-assets bucket
DROP POLICY IF EXISTS academy_assets_admin_insert ON storage.objects;
CREATE POLICY academy_assets_admin_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'training-assets'
            AND (storage.foldername(name))[1] = 'academy'
            AND public.is_academy_admin());

DROP POLICY IF EXISTS academy_assets_admin_update ON storage.objects;
CREATE POLICY academy_assets_admin_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'training-assets'
       AND (storage.foldername(name))[1] = 'academy'
       AND public.is_academy_admin())
WITH CHECK (bucket_id = 'training-assets'
            AND (storage.foldername(name))[1] = 'academy'
            AND public.is_academy_admin());

DROP POLICY IF EXISTS academy_assets_admin_delete ON storage.objects;
CREATE POLICY academy_assets_admin_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'training-assets'
       AND (storage.foldername(name))[1] = 'academy'
       AND public.is_academy_admin());