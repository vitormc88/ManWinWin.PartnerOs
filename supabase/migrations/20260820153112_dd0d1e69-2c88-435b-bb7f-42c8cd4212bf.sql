-- ─────────────────────────────────────────────────────────────────────────
-- Academy P1 — canonical certificates, immutable attempt snapshots,
-- server-authoritative sequencing.
-- Idempotent and guarded.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Canonical certificate ownership -------------------------------------
-- Certificates are audit records: a learner row must never silently vanish,
-- so deletion of the auth user is RESTRICTed rather than cascaded.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'academy_certifications_user_id_fkey'
       AND conrelid = 'public.academy_certifications'::regclass
  ) THEN
    ALTER TABLE public.academy_certifications
      ADD CONSTRAINT academy_certifications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'academy_certifications_user_id_fkey'
       AND conrelid = 'public.academy_certifications'::regclass
       AND NOT convalidated
  ) AND NOT EXISTS (
    SELECT 1 FROM public.academy_certifications c
     WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id)
  ) THEN
    ALTER TABLE public.academy_certifications
      VALIDATE CONSTRAINT academy_certifications_user_id_fkey;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS academy_certifications_reference_uidx
  ON public.academy_certifications (certificate_reference);

-- 2) Immutable per-attempt question snapshots ----------------------------
CREATE TABLE IF NOT EXISTS public.academy_attempt_snapshots (
  attempt_id        uuid NOT NULL REFERENCES public.academy_attempts(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL,
  position          int  NOT NULL,
  question_code     text NOT NULL,
  question_version  int  NOT NULL DEFAULT 1,
  module_id         uuid NOT NULL,
  module_version    int  NOT NULL DEFAULT 1,
  mission_id        uuid,
  mission_title     text,
  category          text NOT NULL,
  difficulty        text NOT NULL,
  question_type     text NOT NULL,
  question_text     text NOT NULL,
  scenario_text     text,
  options_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_json jsonb NOT NULL DEFAULT 'null'::jsonb,
  explanation       text,
  weight            numeric NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

ALTER TABLE public.academy_attempt_snapshots ENABLE ROW LEVEL SECURITY;

-- No direct API access at all: the snapshot carries correct answers and must
-- only ever be reached through SECURITY DEFINER certification functions.
REVOKE ALL ON public.academy_attempt_snapshots FROM PUBLIC;
REVOKE ALL ON public.academy_attempt_snapshots FROM anon;
REVOKE ALL ON public.academy_attempt_snapshots FROM authenticated;
GRANT ALL ON public.academy_attempt_snapshots TO service_role;

-- Belt and braces: snapshots are append-only even for privileged roles.
CREATE OR REPLACE FUNCTION public.academy_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Attempt snapshots are immutable';
END $$;

DROP TRIGGER IF EXISTS academy_attempt_snapshots_immutable ON public.academy_attempt_snapshots;
CREATE TRIGGER academy_attempt_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.academy_attempt_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.academy_snapshots_immutable();

-- 3) Snapshot writer, used by the certification engine only ---------------
CREATE OR REPLACE FUNCTION public.academy_snapshot_attempt(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _a record; _mv int;
BEGIN
  SELECT * INTO _a FROM public.academy_attempts WHERE id = _attempt_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.academy_attempt_snapshots WHERE attempt_id = _attempt_id) THEN
    RETURN;
  END IF;

  SELECT coalesce(version, 1) INTO _mv FROM public.academy_modules WHERE id = _a.module_id;

  INSERT INTO public.academy_attempt_snapshots (
    attempt_id, question_id, position, question_code, question_version,
    module_id, module_version, mission_id, mission_title, category, difficulty,
    question_type, question_text, scenario_text, options_json,
    correct_answer_json, explanation, weight
  )
  SELECT _attempt_id, q.id, g.ord, q.question_code, coalesce(q.version, 1),
         _a.module_id, coalesce(_mv, 1), q.mission_id, m.title, q.category, q.difficulty,
         q.question_type, q.question_text, q.scenario_text, q.options_json,
         q.correct_answer_json, q.explanation, q.weight
    FROM unnest(_a.generated_question_ids) WITH ORDINALITY AS g(qid, ord)
    JOIN public.academy_questions q ON q.id = g.qid
    LEFT JOIN public.academy_missions m ON m.id = q.mission_id
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.academy_snapshot_attempt(uuid) FROM PUBLIC, anon, authenticated;

-- 4) Capture the snapshot the moment an attempt is generated --------------
CREATE OR REPLACE FUNCTION public.academy_cert_start(_module_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _elig jsonb; _state text; _prev uuid[]; _ids uuid[]; _n int; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || _module_id::text, 42));

  UPDATE public.academy_attempts SET status='expired', updated_at=now()
   WHERE user_id=_uid AND module_id=_module_id AND status='in_progress' AND expires_at <= now();

  _elig := public.academy_cert_eligibility(_module_id);
  _state := _elig->>'state';

  IF _state = 'resume' THEN RETURN (_elig->>'active_attempt_id')::uuid; END IF;
  IF _state = 'passed' THEN RAISE EXCEPTION 'You have already passed this certification.'; END IF;
  IF _state = 'locked' THEN RAISE EXCEPTION 'Complete every required learning item before starting the certification.'; END IF;
  IF _state = 'waiting' THEN
    RAISE EXCEPTION 'You can retake this certification after %', to_char((_elig->>'next_attempt_at')::timestamptz, 'YYYY-MM-DD HH24:MI');
  END IF;

  SELECT generated_question_ids INTO _prev FROM public.academy_attempts
   WHERE user_id=_uid AND module_id=_module_id ORDER BY attempt_number DESC LIMIT 1;

  _ids := public.academy_cert_select_questions(_module_id, _prev);

  SELECT coalesce(max(attempt_number),0)+1 INTO _n FROM public.academy_attempts
   WHERE user_id=_uid AND module_id=_module_id;

  INSERT INTO public.academy_attempts (user_id, module_id, attempt_number, generated_question_ids, started_at, expires_at)
  VALUES (_uid, _module_id, _n, _ids, now(), now() + interval '25 minutes')
  RETURNING id INTO _id;

  -- Immutable audit copy, taken before any question can change.
  PERFORM public.academy_snapshot_attempt(_id);

  RETURN _id;
END $$;

-- 5) Results read historical wording/mapping from the snapshot ------------
CREATE OR REPLACE FUNCTION public.academy_cert_result(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _a record; _weak jsonb; _cert record; _has_snapshot boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id AND (user_id=_uid OR public.is_academy_admin());
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.academy_attempt_snapshots WHERE attempt_id=_a.id) INTO _has_snapshot;

  IF _has_snapshot THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('mission_id', w.mission_id,
                                                 'title', coalesce(w.mission_title, m.title, 'Unmapped'),
                                                 'slug', coalesce(m.slug, ''),
                                                 'missed', w.missed) ORDER BY coalesce(m.sort_order, 999)), '[]'::jsonb)
      INTO _weak
    FROM (
      SELECT s.mission_id, max(s.mission_title) AS mission_title, count(*) AS missed
        FROM public.academy_attempt_snapshots s
        LEFT JOIN public.academy_attempt_answers ans
               ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
       WHERE s.attempt_id = _a.id AND s.mission_id IS NOT NULL
         AND coalesce(ans.is_correct, false) = false
       GROUP BY s.mission_id
    ) w
    LEFT JOIN public.academy_missions m ON m.id = w.mission_id;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('mission_id', m.id, 'title', m.title, 'slug', m.slug,
                                                 'missed', w.missed) ORDER BY m.sort_order), '[]'::jsonb)
      INTO _weak
    FROM (
      SELECT q.mission_id, count(*) missed
      FROM unnest(_a.generated_question_ids) AS g(qid)
      JOIN public.academy_questions q ON q.id=g.qid
      LEFT JOIN public.academy_attempt_answers ans ON ans.attempt_id=_a.id AND ans.question_id=q.id
      WHERE q.mission_id IS NOT NULL AND coalesce(ans.is_correct,false) = false
      GROUP BY q.mission_id
    ) w
    JOIN public.academy_missions m ON m.id = w.mission_id;
  END IF;

  SELECT * INTO _cert FROM public.academy_certifications
   WHERE attempt_id=_a.id AND status='valid' LIMIT 1;

  RETURN jsonb_build_object(
    'attempt_id', _a.id, 'module_id', _a.module_id, 'attempt_number', _a.attempt_number,
    'status', _a.status, 'passed', _a.passed, 'raw_score', _a.raw_score,
    'weighted_score', _a.weighted_score, 'scenario_score', _a.scenario_score,
    'category_scores', _a.category_scores_json, 'submitted_at', _a.submitted_at,
    'next_attempt_at', _a.next_attempt_at, 'total_questions', coalesce(array_length(_a.generated_question_ids,1),0),
    'has_snapshot', _has_snapshot,
    'weak_areas', _weak,
    'certification', CASE WHEN _cert.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _cert.id, 'certificate_reference', _cert.certificate_reference,
      'issued_at', _cert.issued_at, 'score', _cert.score, 'scenario_score', _cert.scenario_score) END
  );
END $$;

-- 6) Admin audit view of an attempt, from the snapshot --------------------
CREATE OR REPLACE FUNCTION public.academy_attempt_audit(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _rows jsonb; _has boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_academy_admin() THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.academy_attempt_snapshots WHERE attempt_id=_attempt_id) INTO _has;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'position', s.position, 'question_code', s.question_code,
           'question_version', s.question_version, 'module_version', s.module_version,
           'mission_id', s.mission_id, 'mission_title', s.mission_title,
           'category', s.category, 'difficulty', s.difficulty, 'question_type', s.question_type,
           'question_text', s.question_text, 'scenario_text', s.scenario_text,
           'options', s.options_json, 'correct_answer', s.correct_answer_json,
           'explanation', s.explanation, 'weight', s.weight,
           'selected_answer', ans.selected_answer_json, 'is_correct', coalesce(ans.is_correct,false)
         ) ORDER BY s.position), '[]'::jsonb)
    INTO _rows
  FROM public.academy_attempt_snapshots s
  LEFT JOIN public.academy_attempt_answers ans
         ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
  WHERE s.attempt_id = _attempt_id;

  RETURN jsonb_build_object('attempt_id', _attempt_id, 'has_snapshot', _has, 'questions', _rows);
END $$;

REVOKE ALL ON FUNCTION public.academy_attempt_audit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_attempt_audit(uuid) TO authenticated;

-- 7) Certificate surfaces -------------------------------------------------
CREATE OR REPLACE FUNCTION public.academy_my_certificates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'certificate_reference', c.certificate_reference,
           'user_id', c.user_id,
           'learner_name', coalesce(p.full_name, 'Academy learner'),
           'partner_id', p.partner_id,
           'partner_name', pa.company_name,
           'module_id', c.module_id,
           'module_title', m.title,
           'module_slug', m.slug,
           'module_version', c.module_version,
           'score', c.score,
           'scenario_score', c.scenario_score,
           'issued_at', c.issued_at,
           'status', c.status,
           'attempt_id', c.attempt_id
         ) ORDER BY c.issued_at DESC), '[]'::jsonb)
    INTO _rows
  FROM public.academy_certifications c
  JOIN public.academy_modules m ON m.id = c.module_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.partners pa ON pa.id = p.partner_id
  WHERE c.user_id = _uid;

  RETURN _rows;
END $$;

REVOKE ALL ON FUNCTION public.academy_my_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_my_certificates() TO authenticated;

-- Management surface: HQ/Academy admins see everything, partner users see the
-- Academy certificates of their own partner's people. Partner association is
-- derived at read time from profiles.partner_id — never duplicated.
CREATE OR REPLACE FUNCTION public.academy_managed_certificates(_partner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _admin boolean; _mine uuid; _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _admin := public.is_academy_admin() OR public.is_hq_user();
  _mine  := public.get_user_partner_id(_uid);

  IF NOT _admin THEN
    IF _mine IS NULL THEN RETURN '[]'::jsonb; END IF;
    IF _partner_id IS NOT NULL AND _partner_id <> _mine THEN
      RAISE EXCEPTION 'Not authorised';
    END IF;
    _partner_id := _mine;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'certificate_reference', c.certificate_reference,
           'user_id', c.user_id,
           'learner_name', coalesce(p.full_name, 'Academy learner'),
           'learner_email', CASE WHEN _admin THEN p.email ELSE NULL END,
           'partner_id', p.partner_id,
           'partner_name', pa.company_name,
           'module_id', c.module_id,
           'module_title', m.title,
           'module_slug', m.slug,
           'module_version', c.module_version,
           'score', c.score,
           'scenario_score', c.scenario_score,
           'issued_at', c.issued_at,
           'status', c.status,
           'attempt_id', c.attempt_id
         ) ORDER BY c.issued_at DESC), '[]'::jsonb)
    INTO _rows
  FROM public.academy_certifications c
  JOIN public.academy_modules m ON m.id = c.module_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.partners pa ON pa.id = p.partner_id
  WHERE (_partner_id IS NULL OR p.partner_id = _partner_id);

  RETURN _rows;
END $$;

REVOKE ALL ON FUNCTION public.academy_managed_certificates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_managed_certificates(uuid) TO authenticated;

-- Public verification: minimized payload only. No email, no user id, no
-- attempt data, no answers.
CREATE OR REPLACE FUNCTION public.academy_verify_certificate(_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _c record;
BEGIN
  IF _reference IS NULL OR btrim(_reference) = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT c.certificate_reference, c.issued_at, c.status, c.module_version,
         coalesce(p.full_name, 'Academy learner') AS learner_name,
         m.title AS module_title
    INTO _c
  FROM public.academy_certifications c
  JOIN public.academy_modules m ON m.id = c.module_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE upper(btrim(c.certificate_reference)) = upper(btrim(_reference))
  LIMIT 1;

  IF _c.certificate_reference IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'certificate_reference', _c.certificate_reference,
    'learner_name', _c.learner_name,
    'module_title', _c.module_title,
    'module_version', _c.module_version,
    'issued_at', _c.issued_at,
    'status', _c.status,
    'valid', (_c.status = 'valid')
  );
END $$;

REVOKE ALL ON FUNCTION public.academy_verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_verify_certificate(text) TO anon, authenticated;

-- 8) Server-authoritative learner sequencing ------------------------------
CREATE OR REPLACE FUNCTION public.academy_item_access(_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean;
  _rows jsonb := '[]'::jsonb;
  _r record;
  _prev_required_done boolean := true;
  _prev_title text;
  _all_required_done boolean := true;
  _missing text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _admin := public.is_academy_admin();
  IF NOT _admin AND NOT public.can_access_academy() THEN
    RAISE EXCEPTION 'You do not have access to the Partner Academy';
  END IF;

  SELECT bool_and(coalesce(mp.is_completed, false)),
         min(m.title) FILTER (WHERE NOT coalesce(mp.is_completed, false))
    INTO _all_required_done, _missing
  FROM public.academy_missions m
  LEFT JOIN public.academy_mission_progress mp
         ON mp.mission_id = m.id AND mp.user_id = _uid
  WHERE m.module_id = _module_id AND m.status = 'published'
    AND m.item_kind IN ('intro','mission','exercise','summary');
  _all_required_done := coalesce(_all_required_done, false);

  FOR _r IN
    SELECT m.id, m.slug, m.title, m.item_kind, m.sort_order,
           coalesce(mp.is_completed, false) AS done
      FROM public.academy_missions m
      LEFT JOIN public.academy_mission_progress mp
             ON mp.mission_id = m.id AND mp.user_id = _uid
     WHERE m.module_id = _module_id AND m.status = 'published'
     ORDER BY m.sort_order
  LOOP
    IF _admin THEN
      _rows := _rows || jsonb_build_object('mission_id', _r.id, 'slug', _r.slug,
        'unlocked', true, 'reason', 'admin_preview');
    ELSIF _r.item_kind = 'certification' THEN
      _rows := _rows || jsonb_build_object('mission_id', _r.id, 'slug', _r.slug,
        'unlocked', _all_required_done,
        'reason', CASE WHEN _all_required_done THEN 'open' ELSE 'requires_all_learning_items' END,
        'blocked_by', CASE WHEN _all_required_done THEN NULL ELSE _missing END);
    ELSIF _r.item_kind IN ('intro','mission','exercise','summary') THEN
      _rows := _rows || jsonb_build_object('mission_id', _r.id, 'slug', _r.slug,
        'unlocked', _prev_required_done,
        'reason', CASE WHEN _prev_required_done THEN 'open' ELSE 'requires_previous_item' END,
        'blocked_by', CASE WHEN _prev_required_done THEN NULL ELSE _prev_title END);
      _prev_required_done := _r.done;
      _prev_title := _r.title;
    ELSE
      -- Optional items (e.g. the Qualification Checklist) never gate anything
      -- and are never gated.
      _rows := _rows || jsonb_build_object('mission_id', _r.id, 'slug', _r.slug,
        'unlocked', true, 'reason', 'optional');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'module_id', _module_id,
    'is_admin', _admin,
    'all_required_done', _all_required_done,
    'items', _rows
  );
END $$;

REVOKE ALL ON FUNCTION public.academy_item_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_item_access(uuid) TO authenticated;

-- Completion follows the same rule: only required items gate each other.
CREATE OR REPLACE FUNCTION public.academy_complete_mission(_mission_id uuid, _completed boolean)
RETURNS TABLE(out_module_id uuid, out_progress_pct integer, out_status text, out_is_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  SELECT m.id, m.module_id, m.status, m.item_kind, m.sort_order, mo.status AS module_status
    INTO _m
    FROM public.academy_missions m
    JOIN public.academy_modules mo ON mo.id = m.module_id
   WHERE m.id = _mission_id;

  IF _m.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF _m.status <> 'published' OR _m.module_status <> 'published' THEN
    RAISE EXCEPTION 'Mission is not published';
  END IF;

  IF _completed
     AND _m.item_kind IN ('intro','mission','exercise','summary')
     AND NOT public.is_academy_admin() THEN
    SELECT p.id INTO _prev_id
      FROM public.academy_missions p
     WHERE p.module_id = _m.module_id AND p.status = 'published'
       AND p.item_kind IN ('intro','mission','exercise','summary')
       AND p.sort_order < _m.sort_order
     ORDER BY p.sort_order DESC LIMIT 1;
    IF _prev_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.academy_mission_progress mp
       WHERE mp.user_id = _uid AND mp.mission_id = _prev_id AND mp.is_completed
    ) THEN
      RAISE EXCEPTION 'This item unlocks after the previous learning item is completed';
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
