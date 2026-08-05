-- ── Analytics permission grants ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_analytics_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'academy_analytics_view',
    'academy_attempt_detail_view',
    'academy_correct_answers_view',
    'academy_question_analytics_view'
  )),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_analytics_grants TO authenticated;
GRANT ALL ON public.academy_analytics_grants TO service_role;
ALTER TABLE public.academy_analytics_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academy admins manage analytics grants" ON public.academy_analytics_grants;
CREATE POLICY "Academy admins manage analytics grants"
ON public.academy_analytics_grants FOR ALL TO authenticated
USING (public.is_academy_admin() OR user_id = auth.uid())
WITH CHECK (public.is_academy_admin());

DROP TRIGGER IF EXISTS trg_academy_analytics_grants_updated ON public.academy_analytics_grants;
CREATE TRIGGER trg_academy_analytics_grants_updated
BEFORE UPDATE ON public.academy_analytics_grants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Attempt detail access log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_attempt_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  subject_user_id uuid,
  included_correct_answers boolean NOT NULL DEFAULT false,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.academy_attempt_access_log TO authenticated;
GRANT ALL ON public.academy_attempt_access_log TO service_role;
ALTER TABLE public.academy_attempt_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academy admins read attempt access log" ON public.academy_attempt_access_log;
CREATE POLICY "Academy admins read attempt access log"
ON public.academy_attempt_access_log FOR SELECT TO authenticated
USING (public.is_academy_admin());

-- ── Permission helper ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_academy_analytics_perm(_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_academy_admin() THEN true
    WHEN _perm = 'academy_analytics_view'
      AND (public.has_role(auth.uid(), 'partner_manager'::app_role)
           OR EXISTS (SELECT 1 FROM public.partners p WHERE public.is_partner_manager_for_partner(auth.uid(), p.id)))
      THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.academy_analytics_grants g
      WHERE g.user_id = auth.uid() AND g.permission = _perm
    )
  END
$$;
REVOKE ALL ON FUNCTION public.has_academy_analytics_perm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_academy_analytics_perm(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_my_analytics_perms()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'academy_analytics_view', public.has_academy_analytics_perm('academy_analytics_view'),
    'academy_attempt_detail_view', public.has_academy_analytics_perm('academy_attempt_detail_view'),
    'academy_correct_answers_view', public.has_academy_analytics_perm('academy_correct_answers_view'),
    'academy_question_analytics_view', public.has_academy_analytics_perm('academy_question_analytics_view'),
    'is_academy_admin', public.is_academy_admin()
  )
$$;
REVOKE ALL ON FUNCTION public.academy_my_analytics_perms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_my_analytics_perms() TO authenticated;

-- ── Visible learner scope ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_visible_learners()
RETURNS TABLE(user_id uuid, partner_id uuid, full_name text, email text, is_hq boolean, is_active boolean, country text, partner_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.partner_id, p.full_name, p.email, coalesce(p.is_hq,false), coalesce(p.is_active,true),
         pa.country, pa.company_name
  FROM public.profiles p
  LEFT JOIN public.partners pa ON pa.id = p.partner_id
  WHERE auth.uid() IS NOT NULL
    AND (
      public.is_academy_admin()
      OR p.id = auth.uid()
      OR (p.partner_id IS NOT NULL AND public.is_partner_manager_for_partner(auth.uid(), p.partner_id))
    )
$$;
REVOKE ALL ON FUNCTION public.academy_visible_learners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_visible_learners() TO authenticated;

-- ── Overview ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_analytics_overview(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _partner uuid := nullif(_filters->>'partner_id','')::uuid;
  _user uuid := nullif(_filters->>'user_id','')::uuid;
  _module uuid := nullif(_filters->>'module_id','')::uuid;
  _cert text := nullif(_filters->>'certification_status','');
  _from timestamptz := nullif(_filters->>'date_from','')::timestamptz;
  _to timestamptz := nullif(_filters->>'date_to','')::timestamptz;
  _country text := nullif(_filters->>'country','');
  _role text := nullif(_filters->>'role','');
  _out jsonb;
BEGIN
  IF NOT public.has_academy_analytics_perm('academy_analytics_view') THEN
    RAISE EXCEPTION 'Not authorized to view Academy analytics';
  END IF;

  WITH learners AS (
    SELECT l.* FROM public.academy_visible_learners() l
    WHERE (_partner IS NULL OR l.partner_id = _partner)
      AND (_user IS NULL OR l.user_id = _user)
      AND (_country IS NULL OR l.country = _country)
      AND (_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = l.user_id AND ur.role::text = _role))
  ),
  mp AS (
    SELECT p.* FROM public.academy_module_progress p JOIN learners l ON l.user_id = p.user_id
    WHERE (_module IS NULL OR p.module_id = _module)
      AND (_from IS NULL OR p.updated_at >= _from)
      AND (_to IS NULL OR p.updated_at <= _to)
  ),
  att AS (
    SELECT a.* FROM public.academy_attempts a JOIN learners l ON l.user_id = a.user_id
    WHERE a.status = 'submitted'
      AND (_module IS NULL OR a.module_id = _module)
      AND (_from IS NULL OR a.submitted_at >= _from)
      AND (_to IS NULL OR a.submitted_at <= _to)
  ),
  certs AS (
    SELECT c.* FROM public.academy_certifications c JOIN learners l ON l.user_id = c.user_id
    WHERE c.status = 'valid'
      AND (_module IS NULL OR c.module_id = _module)
      AND (_from IS NULL OR c.issued_at >= _from)
      AND (_to IS NULL OR c.issued_at <= _to)
  ),
  activity AS (
    SELECT l.user_id,
      greatest(
        coalesce((SELECT max(x.updated_at) FROM public.academy_module_progress x WHERE x.user_id = l.user_id), '-infinity'),
        coalesce((SELECT max(x.updated_at) FROM public.academy_mission_progress x WHERE x.user_id = l.user_id), '-infinity'),
        coalesce((SELECT max(x.updated_at) FROM public.academy_attempts x WHERE x.user_id = l.user_id), '-infinity')
      ) AS last_activity
    FROM learners l
  ),
  scoped AS (
    SELECT l.* FROM learners l
    WHERE _cert IS NULL
       OR (_cert = 'passed' AND EXISTS (SELECT 1 FROM certs c WHERE c.user_id = l.user_id))
       OR (_cert = 'not_passed' AND NOT EXISTS (SELECT 1 FROM certs c WHERE c.user_id = l.user_id))
  ),
  first_pass AS (
    SELECT a.user_id, a.module_id, min(a.attempt_number) AS attempts_to_pass
    FROM att a WHERE a.passed GROUP BY 1,2
  )
  SELECT jsonb_build_object(
    'total_learners', (SELECT count(*) FROM scoped),
    'total_active_learners', (SELECT count(*) FROM activity a JOIN scoped s ON s.user_id=a.user_id WHERE a.last_activity > '-infinity'),
    'modules_started', (SELECT count(*) FROM mp WHERE mp.user_id IN (SELECT user_id FROM scoped)),
    'modules_completed', (SELECT count(*) FROM mp WHERE mp.user_id IN (SELECT user_id FROM scoped) AND mp.status IN ('completed','certified')),
    'certifications_passed', (SELECT count(*) FROM certs WHERE certs.user_id IN (SELECT user_id FROM scoped)),
    'attempts_total', (SELECT count(*) FROM att WHERE att.user_id IN (SELECT user_id FROM scoped)),
    'pass_rate', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE passed)::numeric / count(*) * 100, 1) ELSE 0 END
                    FROM att WHERE att.user_id IN (SELECT user_id FROM scoped)),
    'average_score', (SELECT coalesce(round(avg(weighted_score), 1), 0) FROM att WHERE att.user_id IN (SELECT user_id FROM scoped)),
    'average_attempts_before_passing', (SELECT coalesce(round(avg(attempts_to_pass), 2), 0) FROM first_pass WHERE first_pass.user_id IN (SELECT user_id FROM scoped)),
    'inactive_7', (SELECT count(*) FROM activity a JOIN scoped s ON s.user_id=a.user_id WHERE a.last_activity < now() - interval '7 days'),
    'inactive_14', (SELECT count(*) FROM activity a JOIN scoped s ON s.user_id=a.user_id WHERE a.last_activity < now() - interval '14 days'),
    'inactive_30', (SELECT count(*) FROM activity a JOIN scoped s ON s.user_id=a.user_id WHERE a.last_activity < now() - interval '30 days'),
    'by_partner', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'partner_name')
      FROM (
        SELECT jsonb_build_object(
          'partner_id', s.partner_id,
          'partner_name', coalesce(s.partner_name, 'ManWinWin HQ'),
          'country', s.country,
          'users', count(*),
          'avg_progress', coalesce(round(avg((SELECT coalesce(avg(m.progress_pct),0) FROM mp m WHERE m.user_id = s.user_id)), 1), 0),
          'completed_modules', (SELECT count(*) FROM mp m WHERE m.user_id = ANY(array_agg(s.user_id)) AND m.status IN ('completed','certified')),
          'certifications_passed', (SELECT count(*) FROM certs c WHERE c.user_id = ANY(array_agg(s.user_id)))
        ) AS x
        FROM scoped s GROUP BY s.partner_id, s.partner_name, s.country
      ) t), '[]'::jsonb),
    'by_module', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'title')
      FROM (
        SELECT jsonb_build_object(
          'module_id', mo.id,
          'title', mo.title,
          'slug', mo.slug,
          'started', (SELECT count(*) FROM mp m WHERE m.module_id = mo.id AND m.user_id IN (SELECT user_id FROM scoped)),
          'completed', (SELECT count(*) FROM mp m WHERE m.module_id = mo.id AND m.status IN ('completed','certified') AND m.user_id IN (SELECT user_id FROM scoped)),
          'avg_progress', (SELECT coalesce(round(avg(m.progress_pct),1),0) FROM mp m WHERE m.module_id = mo.id AND m.user_id IN (SELECT user_id FROM scoped)),
          'certifications_passed', (SELECT count(*) FROM certs c WHERE c.module_id = mo.id AND c.user_id IN (SELECT user_id FROM scoped)),
          'pass_rate', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE a.passed)::numeric/count(*)*100,1) ELSE 0 END
                          FROM att a WHERE a.module_id = mo.id AND a.user_id IN (SELECT user_id FROM scoped))
        ) AS x
        FROM public.academy_modules mo
        WHERE mo.status = 'published' AND (_module IS NULL OR mo.id = _module)
      ) t), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.academy_analytics_overview(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_analytics_overview(jsonb) TO authenticated;

-- ── Partner view ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_analytics_partners(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _country text := nullif(_filters->>'country','');
  _partner uuid := nullif(_filters->>'partner_id','')::uuid;
  _out jsonb;
BEGIN
  IF NOT public.has_academy_analytics_perm('academy_analytics_view') THEN
    RAISE EXCEPTION 'Not authorized to view Academy analytics';
  END IF;

  WITH learners AS (
    SELECT l.*,
      greatest(
        coalesce((SELECT max(x.updated_at) FROM public.academy_module_progress x WHERE x.user_id = l.user_id), '-infinity'),
        coalesce((SELECT max(x.updated_at) FROM public.academy_mission_progress x WHERE x.user_id = l.user_id), '-infinity'),
        coalesce((SELECT max(x.updated_at) FROM public.academy_attempts x WHERE x.user_id = l.user_id), '-infinity')
      ) AS last_activity,
      (SELECT coalesce(round(avg(m.progress_pct),1),0) FROM public.academy_module_progress m WHERE m.user_id = l.user_id) AS avg_progress,
      (SELECT count(*) FROM public.academy_module_progress m WHERE m.user_id = l.user_id AND m.status IN ('completed','certified')) AS completed_modules,
      (SELECT count(*) FROM public.academy_certifications c WHERE c.user_id = l.user_id AND c.status='valid') AS certs_passed,
      (SELECT count(*) FROM public.academy_attempts a WHERE a.user_id = l.user_id AND a.status='submitted') AS attempts,
      (SELECT count(*) FROM public.academy_attempts a WHERE a.user_id = l.user_id AND a.status='submitted' AND a.passed) AS attempts_passed
    FROM public.academy_visible_learners() l
    WHERE (_country IS NULL OR l.country = _country)
      AND (_partner IS NULL OR l.partner_id = _partner)
  )
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'partner_name'), '[]'::jsonb) INTO _out
  FROM (
    SELECT jsonb_build_object(
      'partner_id', partner_id,
      'partner_name', coalesce(partner_name, 'ManWinWin HQ'),
      'country', max(country),
      'total_users', count(*),
      'active_users', count(*) FILTER (WHERE last_activity > now() - interval '30 days'),
      'avg_progress', round(avg(avg_progress), 1),
      'completed_modules', sum(completed_modules),
      'certifications_passed', sum(certs_passed),
      'pass_rate', CASE WHEN sum(attempts) > 0 THEN round(sum(attempts_passed)::numeric / sum(attempts) * 100, 1) ELSE 0 END,
      'last_activity', nullif(max(last_activity), '-infinity'),
      'users_requiring_attention', count(*) FILTER (
        WHERE last_activity < now() - interval '14 days' OR (attempts > 0 AND attempts_passed = 0))
    ) AS x
    FROM learners GROUP BY partner_id, partner_name
  ) t;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.academy_analytics_partners(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_analytics_partners(jsonb) TO authenticated;

-- ── Learner list ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_analytics_learners(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _partner uuid := nullif(_filters->>'partner_id','')::uuid;
  _country text := nullif(_filters->>'country','');
  _role text := nullif(_filters->>'role','');
  _cert text := nullif(_filters->>'certification_status','');
  _out jsonb;
BEGIN
  IF NOT public.has_academy_analytics_perm('academy_analytics_view') THEN
    RAISE EXCEPTION 'Not authorized to view Academy analytics';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'full_name'), '[]'::jsonb) INTO _out FROM (
    SELECT jsonb_build_object(
      'user_id', l.user_id,
      'full_name', coalesce(l.full_name, l.email, 'Unknown user'),
      'email', l.email,
      'partner_id', l.partner_id,
      'partner_name', coalesce(l.partner_name, 'ManWinWin HQ'),
      'country', l.country,
      'is_active', l.is_active,
      'roles', coalesce((SELECT jsonb_agg(ur.role::text) FROM public.user_roles ur WHERE ur.user_id = l.user_id), '[]'::jsonb),
      'avg_progress', (SELECT coalesce(round(avg(m.progress_pct),1),0) FROM public.academy_module_progress m WHERE m.user_id = l.user_id),
      'modules_completed', (SELECT count(*) FROM public.academy_module_progress m WHERE m.user_id = l.user_id AND m.status IN ('completed','certified')),
      'certifications_passed', (SELECT count(*) FROM public.academy_certifications c WHERE c.user_id = l.user_id AND c.status='valid'),
      'attempts', (SELECT count(*) FROM public.academy_attempts a WHERE a.user_id = l.user_id AND a.status='submitted'),
      'last_activity', nullif(greatest(
        coalesce((SELECT max(x2.updated_at) FROM public.academy_module_progress x2 WHERE x2.user_id = l.user_id), '-infinity'),
        coalesce((SELECT max(x2.updated_at) FROM public.academy_mission_progress x2 WHERE x2.user_id = l.user_id), '-infinity'),
        coalesce((SELECT max(x2.updated_at) FROM public.academy_attempts x2 WHERE x2.user_id = l.user_id), '-infinity')
      ), '-infinity')
    ) AS x
    FROM public.academy_visible_learners() l
    WHERE (_partner IS NULL OR l.partner_id = _partner)
      AND (_country IS NULL OR l.country = _country)
      AND (_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = l.user_id AND ur.role::text = _role))
      AND (_cert IS NULL
           OR (_cert = 'passed' AND EXISTS (SELECT 1 FROM public.academy_certifications c WHERE c.user_id = l.user_id AND c.status='valid'))
           OR (_cert = 'not_passed' AND NOT EXISTS (SELECT 1 FROM public.academy_certifications c WHERE c.user_id = l.user_id AND c.status='valid')))
  ) t;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.academy_analytics_learners(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_analytics_learners(jsonb) TO authenticated;

-- ── User learning profile ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_analytics_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _l record; _out jsonb;
BEGIN
  IF NOT public.has_academy_analytics_perm('academy_analytics_view') THEN
    RAISE EXCEPTION 'Not authorized to view Academy analytics';
  END IF;
  SELECT * INTO _l FROM public.academy_visible_learners() l WHERE l.user_id = _user_id;
  IF _l.user_id IS NULL THEN RAISE EXCEPTION 'Learner not found or not visible to you'; END IF;

  SELECT jsonb_build_object(
    'user_id', _l.user_id,
    'full_name', coalesce(_l.full_name, _l.email, 'Unknown user'),
    'email', _l.email,
    'partner_id', _l.partner_id,
    'partner_name', coalesce(_l.partner_name, 'ManWinWin HQ'),
    'country', _l.country,
    'roles', coalesce((SELECT jsonb_agg(ur.role::text) FROM public.user_roles ur WHERE ur.user_id = _user_id), '[]'::jsonb),
    'last_activity', nullif(greatest(
      coalesce((SELECT max(x.updated_at) FROM public.academy_module_progress x WHERE x.user_id = _user_id), '-infinity'),
      coalesce((SELECT max(x.updated_at) FROM public.academy_mission_progress x WHERE x.user_id = _user_id), '-infinity'),
      coalesce((SELECT max(x.updated_at) FROM public.academy_attempts x WHERE x.user_id = _user_id), '-infinity')
    ), '-infinity'),
    'learning_minutes', coalesce((
      SELECT sum(m.estimated_duration_minutes)
      FROM public.academy_mission_progress mp
      JOIN public.academy_missions m ON m.id = mp.mission_id
      WHERE mp.user_id = _user_id AND mp.is_completed), 0),
    'modules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'module_id', mo.id, 'title', mo.title, 'slug', mo.slug,
        'status', coalesce(mp.status, 'not_started'),
        'progress_pct', coalesce(mp.progress_pct, 0),
        'started_at', mp.started_at, 'completed_at', mp.completed_at,
        'certified', EXISTS (SELECT 1 FROM public.academy_certifications c WHERE c.user_id=_user_id AND c.module_id=mo.id AND c.status='valid')
      ) ORDER BY mo.sort_order)
      FROM public.academy_modules mo
      LEFT JOIN public.academy_module_progress mp ON mp.module_id = mo.id AND mp.user_id = _user_id
      WHERE mo.status = 'published'), '[]'::jsonb),
    'attempts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'attempt_id', a.id, 'module_id', a.module_id,
        'module_title', (SELECT title FROM public.academy_modules WHERE id = a.module_id),
        'attempt_number', a.attempt_number, 'status', a.status, 'passed', a.passed,
        'weighted_score', a.weighted_score, 'scenario_score', a.scenario_score,
        'raw_score', a.raw_score, 'category_scores', a.category_scores_json,
        'started_at', a.started_at, 'submitted_at', a.submitted_at,
        'next_attempt_at', a.next_attempt_at,
        'total_questions', coalesce(array_length(a.generated_question_ids,1),0)
      ) ORDER BY a.attempt_number DESC)
      FROM public.academy_attempts a WHERE a.user_id = _user_id), '[]'::jsonb),
    'weak_missions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('mission_id', m.id, 'title', m.title, 'slug', m.slug, 'missed', w.missed)
             ORDER BY w.missed DESC)
      FROM (
        SELECT q.mission_id, count(*) AS missed
        FROM public.academy_attempts a
        JOIN unnest(a.generated_question_ids) AS g(qid) ON true
        JOIN public.academy_questions q ON q.id = g.qid
        LEFT JOIN public.academy_attempt_answers ans ON ans.attempt_id = a.id AND ans.question_id = q.id
        WHERE a.user_id = _user_id AND a.status = 'submitted'
          AND q.mission_id IS NOT NULL AND coalesce(ans.is_correct,false) = false
        GROUP BY q.mission_id
      ) w JOIN public.academy_missions m ON m.id = w.mission_id), '[]'::jsonb),
    'next_retake_at', (SELECT max(a.next_attempt_at) FROM public.academy_attempts a
                        WHERE a.user_id = _user_id AND a.status='submitted' AND NOT coalesce(a.passed,false))
  ) INTO _out;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.academy_analytics_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_analytics_user(uuid) TO authenticated;

-- ── Attempt detail (logged) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_analytics_attempt(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _a record; _reveal boolean; _out jsonb;
BEGIN
  IF NOT public.has_academy_analytics_perm('academy_attempt_detail_view') THEN
    RAISE EXCEPTION 'Not authorized to open certification attempt details';
  END IF;
  SELECT a.* INTO _a FROM public.academy_attempts a
   WHERE a.id = _attempt_id
     AND a.user_id IN (SELECT user_id FROM public.academy_visible_learners());
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found or not visible to you'; END IF;

  _reveal := public.has_academy_analytics_perm('academy_correct_answers_view');

  INSERT INTO public.academy_attempt_access_log (attempt_id, viewer_id, subject_user_id, included_correct_answers)
  VALUES (_attempt_id, auth.uid(), _a.user_id, _reveal);

  SELECT jsonb_build_object(
    'attempt_id', _a.id,
    'user_id', _a.user_id,
    'learner_name', (SELECT coalesce(full_name, email) FROM public.profiles WHERE id = _a.user_id),
    'module_id', _a.module_id,
    'module_title', (SELECT title FROM public.academy_modules WHERE id = _a.module_id),
    'attempt_number', _a.attempt_number,
    'status', _a.status, 'passed', _a.passed,
    'raw_score', _a.raw_score, 'weighted_score', _a.weighted_score,
    'scenario_score', _a.scenario_score, 'category_scores', _a.category_scores_json,
    'started_at', _a.started_at, 'submitted_at', _a.submitted_at,
    'next_attempt_at', _a.next_attempt_at,
    'reveals_correct_answers', _reveal,
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'position', ord,
        'question_id', q.id,
        'question_code', q.question_code,
        'question_text', q.question_text,
        'scenario_text', q.scenario_text,
        'category', q.category,
        'question_type', q.question_type,
        'difficulty', q.difficulty,
        'weight', q.weight,
        'mission_title', (SELECT title FROM public.academy_missions WHERE id = q.mission_id),
        'options', q.options_json,
        'selected_answer', ans.selected_answer_json,
        'is_correct', coalesce(ans.is_correct, false),
        'awarded_score', coalesce(ans.awarded_score, 0),
        'answered_at', ans.answered_at,
        'response_seconds', CASE WHEN ans.answered_at IS NULL THEN NULL ELSE
          greatest(0, extract(epoch FROM (ans.answered_at - coalesce(
            (SELECT max(p.answered_at) FROM public.academy_attempt_answers p
              WHERE p.attempt_id = _a.id AND p.answered_at < ans.answered_at), _a.started_at)))::int) END,
        'correct_answer', CASE WHEN _reveal THEN q.correct_answer_json ELSE NULL END,
        'explanation', CASE WHEN _reveal THEN q.explanation ELSE NULL END
      ) ORDER BY ord)
      FROM unnest(_a.generated_question_ids) WITH ORDINALITY AS g(qid, ord)
      JOIN public.academy_questions q ON q.id = g.qid
      LEFT JOIN public.academy_attempt_answers ans ON ans.attempt_id = _a.id AND ans.question_id = q.id
    ), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.academy_analytics_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_analytics_attempt(uuid) TO authenticated;

-- ── Question analytics ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_analytics_questions(_module_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_academy_analytics_perm('academy_question_analytics_view') THEN
    RAISE EXCEPTION 'Not authorized to view Academy question analytics';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'question_code'), '[]'::jsonb) INTO _out FROM (
    SELECT jsonb_build_object(
      'question_id', q.id,
      'question_code', q.question_code,
      'question_text', q.question_text,
      'module_id', q.module_id,
      'module_title', (SELECT title FROM public.academy_modules WHERE id = q.module_id),
      'mission_title', (SELECT title FROM public.academy_missions WHERE id = q.mission_id),
      'category', q.category,
      'question_type', q.question_type,
      'difficulty', q.difficulty,
      'weight', q.weight,
      'status', q.status,
      'updated_at', q.updated_at,
      'times_used', u.times_used,
      'times_answered', coalesce(s.answered, 0),
      'correct_rate', CASE WHEN coalesce(s.answered,0) > 0 THEN round(s.correct::numeric / s.answered * 100, 1) ELSE NULL END,
      'incorrect_rate', CASE WHEN coalesce(s.answered,0) > 0 THEN round((s.answered - s.correct)::numeric / s.answered * 100, 1) ELSE NULL END,
      'avg_response_seconds', s.avg_seconds,
      'pass_correlation', jsonb_build_object(
        'correct_in_passed', coalesce(s.correct_passed, 0),
        'correct_in_failed', coalesce(s.correct_failed, 0),
        'answered_in_passed', coalesce(s.answered_passed, 0),
        'answered_in_failed', coalesce(s.answered_failed, 0)),
      'option_distribution', coalesce(d.dist, '[]'::jsonb)
    ) AS x
    FROM public.academy_questions q
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS times_used
      FROM public.academy_attempts a
      WHERE q.id = ANY(a.generated_question_ids)
    ) u ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS answered,
             count(*) FILTER (WHERE ans.is_correct)::int AS correct,
             count(*) FILTER (WHERE a.passed)::int AS answered_passed,
             count(*) FILTER (WHERE NOT coalesce(a.passed,false))::int AS answered_failed,
             count(*) FILTER (WHERE ans.is_correct AND a.passed)::int AS correct_passed,
             count(*) FILTER (WHERE ans.is_correct AND NOT coalesce(a.passed,false))::int AS correct_failed,
             round(avg(greatest(0, extract(epoch FROM (ans.answered_at - coalesce(
               (SELECT max(p.answered_at) FROM public.academy_attempt_answers p
                 WHERE p.attempt_id = ans.attempt_id AND p.answered_at < ans.answered_at), a.started_at)))))::numeric, 1) AS avg_seconds
      FROM public.academy_attempt_answers ans
      JOIN public.academy_attempts a ON a.id = ans.attempt_id
      WHERE ans.question_id = q.id
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('option', opt, 'count', cnt) ORDER BY cnt DESC) AS dist
      FROM (
        SELECT CASE WHEN jsonb_typeof(ans.selected_answer_json) = 'array'
                    THEN e.value #>> '{}' ELSE ans.selected_answer_json #>> '{}' END AS opt,
               count(*)::int AS cnt
        FROM public.academy_attempt_answers ans
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(ans.selected_answer_json) = 'array' THEN ans.selected_answer_json ELSE '[]'::jsonb END) e ON true
        WHERE ans.question_id = q.id
        GROUP BY 1
      ) o WHERE opt IS NOT NULL
    ) d ON true
    WHERE (_module_id IS NULL OR q.module_id = _module_id)
  ) t;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.academy_analytics_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_analytics_questions(uuid) TO authenticated;