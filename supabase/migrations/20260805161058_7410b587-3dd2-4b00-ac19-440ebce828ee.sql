
-- ─────────────────────────────────────────────────────────────────────────
-- Partner Academy — Qualification Module Certification engine
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.academy_missions(id) ON DELETE SET NULL,
  question_code text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('knowledge','understanding','application','scenario_analysis','advanced','record_review')),
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard','expert')),
  question_type text NOT NULL CHECK (question_type IN ('single_choice','multiple_select','ordering','classification','scenario_single_choice','scenario_multiple_select','record_review')),
  question_text text NOT NULL,
  scenario_text text,
  scenario_group text,
  options_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_json jsonb NOT NULL,
  explanation text,
  tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_mandatory boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_questions_module_idx ON public.academy_questions(module_id, status, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_questions TO authenticated;
GRANT ALL ON public.academy_questions TO service_role;
ALTER TABLE public.academy_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Academy admins manage the question bank"
  ON public.academy_questions FOR ALL TO authenticated
  USING (public.is_academy_admin()) WITH CHECK (public.is_academy_admin());

CREATE TABLE IF NOT EXISTS public.academy_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','expired')),
  generated_question_ids uuid[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  expires_at timestamptz NOT NULL,
  raw_score integer NOT NULL DEFAULT 0,
  weighted_score numeric NOT NULL DEFAULT 0,
  scenario_score numeric NOT NULL DEFAULT 0,
  category_scores_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  passed boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_attempts_one_active
  ON public.academy_attempts(user_id, module_id) WHERE status = 'in_progress';

GRANT SELECT ON public.academy_attempts TO authenticated;
GRANT ALL ON public.academy_attempts TO service_role;
ALTER TABLE public.academy_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own attempts"
  ON public.academy_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_academy_admin());

CREATE TABLE IF NOT EXISTS public.academy_attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.academy_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.academy_questions(id) ON DELETE CASCADE,
  selected_answer_json jsonb,
  is_correct boolean,
  awarded_score numeric NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

GRANT ALL ON public.academy_attempt_answers TO service_role;
ALTER TABLE public.academy_attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Academy admins read attempt answers"
  ON public.academy_attempt_answers FOR SELECT TO authenticated
  USING (public.is_academy_admin());

CREATE TABLE IF NOT EXISTS public.academy_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.academy_attempts(id) ON DELETE SET NULL,
  score numeric NOT NULL,
  scenario_score numeric NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  certificate_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','revoked','superseded')),
  module_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_certifications_one_valid
  ON public.academy_certifications(user_id, module_id, module_version) WHERE status = 'valid';

GRANT SELECT ON public.academy_certifications TO authenticated;
GRANT ALL ON public.academy_certifications TO service_role;
ALTER TABLE public.academy_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own certifications"
  ON public.academy_certifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_academy_admin());

DROP TRIGGER IF EXISTS trg_academy_questions_updated_at ON public.academy_questions;
CREATE TRIGGER trg_academy_questions_updated_at BEFORE UPDATE ON public.academy_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_academy_attempts_updated_at ON public.academy_attempts;
CREATE TRIGGER trg_academy_attempts_updated_at BEFORE UPDATE ON public.academy_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Answer comparison ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_answer_is_correct(_type text, _correct jsonb, _given jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE a jsonb; b jsonb;
BEGIN
  IF _given IS NULL OR _correct IS NULL THEN RETURN false; END IF;
  IF _type IN ('multiple_select','scenario_multiple_select')
     OR (jsonb_typeof(_correct) = 'array' AND _type = 'record_review') THEN
    IF jsonb_typeof(_given) <> 'array' OR jsonb_typeof(_correct) <> 'array' THEN RETURN false; END IF;
    SELECT jsonb_agg(v ORDER BY v::text) INTO a FROM (SELECT DISTINCT jsonb_array_elements(_correct) v) x;
    SELECT jsonb_agg(v ORDER BY v::text) INTO b FROM (SELECT DISTINCT jsonb_array_elements(_given) v) y;
    RETURN coalesce(a,'[]'::jsonb) = coalesce(b,'[]'::jsonb);
  END IF;
  -- ordering (exact sequence), classification (exact mapping), single choice
  RETURN _correct = _given;
END $$;

-- ── Blueprint validation ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_cert_blueprint_ok(_ids uuid[])
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH q AS (SELECT * FROM public.academy_questions WHERE id = ANY(_ids))
  SELECT (SELECT count(*) FROM q) = 20
     AND (SELECT count(*) FROM q WHERE tags_json ? 'timd') >= 1
     AND (SELECT count(*) FROM q WHERE tags_json ? 't-form') >= 1
     AND (SELECT count(*) FROM q WHERE tags_json ? 'qnd') >= 2
     AND (SELECT count(*) FROM q WHERE tags_json ? 'partneros') >= 2
     AND (SELECT count(*) FROM q WHERE question_type IN ('multiple_select','scenario_multiple_select')) >= 1
     AND (SELECT count(*) FROM q WHERE question_type IN ('ordering','classification')) >= 1
     AND (SELECT count(*) FROM q WHERE difficulty IN ('hard','expert')) >= 6
     AND coalesce((SELECT max(c) FROM (
           SELECT count(*) c FROM q WHERE scenario_group IS NOT NULL GROUP BY scenario_group
         ) s), 0) <= 2
$$;

-- ── Exam generation ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_cert_select_questions(_module_id uuid, _prev uuid[])
RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ids uuid[]; _try int;
BEGIN
  FOR _try IN 1..200 LOOP
    SELECT array_agg(id) INTO _ids FROM (
      (SELECT id FROM public.academy_questions WHERE module_id=_module_id AND status='published' AND category='knowledge' ORDER BY random() LIMIT 2)
      UNION ALL
      (SELECT id FROM public.academy_questions WHERE module_id=_module_id AND status='published' AND category='understanding' ORDER BY random() LIMIT 4)
      UNION ALL
      (SELECT id FROM public.academy_questions WHERE module_id=_module_id AND status='published' AND category='application' ORDER BY random() LIMIT 5)
      UNION ALL
      (SELECT id FROM public.academy_questions WHERE module_id=_module_id AND status='published' AND category='scenario_analysis' ORDER BY random() LIMIT 6)
      UNION ALL
      (SELECT id FROM public.academy_questions WHERE module_id=_module_id AND status='published' AND category IN ('advanced','record_review') ORDER BY random() LIMIT 3)
    ) picked;

    IF coalesce(array_length(_ids,1),0) = 20
       AND public.academy_cert_blueprint_ok(_ids)
       AND (
         _prev IS NULL OR coalesce(array_length(_prev,1),0) = 0
         OR (SELECT array(SELECT unnest(_ids) ORDER BY 1)) <> (SELECT array(SELECT unnest(_prev) ORDER BY 1))
       )
    THEN
      RETURN (SELECT array_agg(id ORDER BY random()) FROM unnest(_ids) AS t(id));
    END IF;
  END LOOP;

  RAISE EXCEPTION 'The question bank for this module cannot satisfy the certification blueprint yet. Ask an Academy Admin to complete the question bank.';
END $$;

-- ── Eligibility ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_cert_eligibility(_module_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _total int; _done int; _missing jsonb;
  _active uuid; _cert record; _last record;
  _next timestamptz; _state text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_access_academy() THEN RAISE EXCEPTION 'You do not have access to the Partner Academy'; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE mp.is_completed),
         coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'slug', m.slug)
                  ORDER BY m.sort_order) FILTER (WHERE NOT coalesce(mp.is_completed,false)), '[]'::jsonb)
    INTO _total, _done, _missing
  FROM public.academy_missions m
  LEFT JOIN public.academy_mission_progress mp
         ON mp.mission_id = m.id AND mp.user_id = _uid
  WHERE m.module_id = _module_id
    AND m.status = 'published'
    AND m.item_kind IN ('intro','mission','exercise','summary');

  SELECT id INTO _active FROM public.academy_attempts
   WHERE user_id=_uid AND module_id=_module_id AND status='in_progress' AND expires_at > now() LIMIT 1;

  SELECT * INTO _cert FROM public.academy_certifications
   WHERE user_id=_uid AND module_id=_module_id AND status='valid' ORDER BY issued_at DESC LIMIT 1;

  SELECT * INTO _last FROM public.academy_attempts
   WHERE user_id=_uid AND module_id=_module_id AND status='submitted'
   ORDER BY attempt_number DESC LIMIT 1;

  _next := _last.next_attempt_at;

  IF _cert.id IS NOT NULL THEN _state := 'passed';
  ELSIF _active IS NOT NULL THEN _state := 'resume';
  ELSIF _done < _total OR _total = 0 THEN _state := 'locked';
  ELSIF _next IS NOT NULL AND _next > now() THEN _state := 'waiting';
  ELSE _state := 'ready';
  END IF;

  IF _state IN ('ready','waiting') THEN
    INSERT INTO public.academy_module_progress (user_id, module_id, status, progress_pct, started_at)
    VALUES (_uid, _module_id, 'ready_for_certification', public.academy_module_progress_pct(_uid,_module_id), now())
    ON CONFLICT (user_id, module_id) DO UPDATE
      SET status = CASE WHEN public.academy_module_progress.status IN ('certified') THEN public.academy_module_progress.status
                        ELSE 'ready_for_certification' END,
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'state', _state,
    'required_total', _total,
    'required_done', _done,
    'missing_items', _missing,
    'active_attempt_id', _active,
    'next_attempt_at', _next,
    'last_attempt_id', _last.id,
    'attempts_used', coalesce((SELECT count(*) FROM public.academy_attempts WHERE user_id=_uid AND module_id=_module_id AND status='submitted'),0),
    'certification', CASE WHEN _cert.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', _cert.id, 'score', _cert.score, 'scenario_score', _cert.scenario_score,
        'issued_at', _cert.issued_at, 'certificate_reference', _cert.certificate_reference,
        'attempt_id', _cert.attempt_id) END
  );
END $$;

-- ── Start attempt ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_cert_start(_module_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
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

  RETURN _id;
END $$;

-- ── Active attempt state (sanitised: never returns correct answers) ──────
CREATE OR REPLACE FUNCTION public.academy_cert_state(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _a record; _questions jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id AND user_id=_uid;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  IF _a.status = 'in_progress' AND _a.expires_at <= now() THEN
    PERFORM public.academy_cert_submit(_attempt_id);
    SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id;
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'position')::int), '[]'::jsonb) INTO _questions FROM (
    SELECT jsonb_build_object(
      'position', ord,
      'question_id', q.id,
      'question_type', q.question_type,
      'category', q.category,
      'question_text', q.question_text,
      'scenario_text', q.scenario_text,
      'options', CASE WHEN q.question_type = 'ordering' THEN q.options_json
                      ELSE coalesce((SELECT jsonb_agg(o ORDER BY md5(_attempt_id::text || q.id::text || o::text))
                                       FROM jsonb_array_elements(q.options_json) o), '[]'::jsonb) END,
      'answered', (ans.id IS NOT NULL),
      'selected_answer', ans.selected_answer_json
    ) AS x
    FROM unnest(_a.generated_question_ids) WITH ORDINALITY AS g(qid, ord)
    JOIN public.academy_questions q ON q.id = g.qid
    LEFT JOIN public.academy_attempt_answers ans ON ans.attempt_id = _a.id AND ans.question_id = q.id
  ) s;

  RETURN jsonb_build_object(
    'attempt_id', _a.id,
    'module_id', _a.module_id,
    'attempt_number', _a.attempt_number,
    'status', _a.status,
    'started_at', _a.started_at,
    'expires_at', _a.expires_at,
    'server_now', now(),
    'seconds_remaining', greatest(0, floor(extract(epoch FROM (_a.expires_at - now())))::int),
    'total_questions', coalesce(array_length(_a.generated_question_ids,1),0),
    'answered_count', (SELECT count(*) FROM public.academy_attempt_answers WHERE attempt_id=_a.id),
    'questions', CASE WHEN _a.status = 'in_progress' THEN _questions ELSE '[]'::jsonb END
  );
END $$;

-- ── Save one answer (irreversible per question) ──────────────────────────
CREATE OR REPLACE FUNCTION public.academy_cert_answer(_attempt_id uuid, _question_id uuid, _answer jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _a record; _q record; _ok boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id AND user_id=_uid FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF _a.status <> 'in_progress' THEN RAISE EXCEPTION 'This attempt is already closed.'; END IF;
  IF _a.expires_at <= now() THEN
    PERFORM public.academy_cert_submit(_attempt_id);
    RAISE EXCEPTION 'Time is up — the attempt was submitted automatically.';
  END IF;
  IF NOT (_question_id = ANY(_a.generated_question_ids)) THEN
    RAISE EXCEPTION 'That question is not part of this attempt.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academy_attempt_answers WHERE attempt_id=_attempt_id AND question_id=_question_id) THEN
    RAISE EXCEPTION 'This question was already answered and cannot be changed.';
  END IF;

  SELECT * INTO _q FROM public.academy_questions WHERE id=_question_id;
  _ok := public.academy_answer_is_correct(_q.question_type, _q.correct_answer_json, _answer);

  INSERT INTO public.academy_attempt_answers (attempt_id, question_id, selected_answer_json, is_correct, awarded_score)
  VALUES (_attempt_id, _question_id, _answer, _ok, CASE WHEN _ok THEN _q.weight ELSE 0 END);
END $$;

-- ── Submit and score ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.academy_cert_submit(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record; _total_w numeric; _earned_w numeric; _raw int;
  _scen_total numeric; _scen_earned numeric; _cats jsonb;
  _weighted numeric; _scen numeric; _passed boolean;
  _fails int; _next timestamptz; _mod record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id AND user_id=_uid FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF _a.status <> 'in_progress' THEN
    RETURN jsonb_build_object('attempt_id', _a.id, 'already_submitted', true);
  END IF;

  SELECT
    coalesce(sum(q.weight),0),
    coalesce(sum(CASE WHEN ans.is_correct THEN q.weight ELSE 0 END),0),
    coalesce(count(*) FILTER (WHERE ans.is_correct),0),
    coalesce(sum(q.weight) FILTER (WHERE q.category='scenario_analysis'),0),
    coalesce(sum(CASE WHEN ans.is_correct THEN q.weight ELSE 0 END) FILTER (WHERE q.category='scenario_analysis'),0)
  INTO _total_w, _earned_w, _raw, _scen_total, _scen_earned
  FROM unnest(_a.generated_question_ids) AS g(qid)
  JOIN public.academy_questions q ON q.id = g.qid
  LEFT JOIN public.academy_attempt_answers ans ON ans.attempt_id=_a.id AND ans.question_id=q.id;

  SELECT coalesce(jsonb_object_agg(cat, jsonb_build_object('earned', e, 'total', t,
           'pct', CASE WHEN t > 0 THEN round(e / t * 100, 1) ELSE 0 END)), '{}'::jsonb)
    INTO _cats
  FROM (
    SELECT q.category AS cat, coalesce(sum(CASE WHEN ans.is_correct THEN q.weight ELSE 0 END),0) e, sum(q.weight) t
    FROM unnest(_a.generated_question_ids) AS g(qid)
    JOIN public.academy_questions q ON q.id = g.qid
    LEFT JOIN public.academy_attempt_answers ans ON ans.attempt_id=_a.id AND ans.question_id=q.id
    GROUP BY q.category
  ) c;

  _weighted := CASE WHEN _total_w > 0 THEN round(_earned_w / _total_w * 100, 1) ELSE 0 END;
  _scen := CASE WHEN _scen_total > 0 THEN round(_scen_earned / _scen_total * 100, 1) ELSE 0 END;
  _passed := (_weighted >= 80 AND _scen >= 60);

  IF NOT _passed THEN
    SELECT count(*) INTO _fails FROM public.academy_attempts
     WHERE user_id=_uid AND module_id=_a.module_id AND status='submitted' AND NOT passed;
    _fails := _fails + 1;
    _next := now() + CASE WHEN _fails = 1 THEN interval '24 hours'
                          WHEN _fails = 2 THEN interval '72 hours'
                          ELSE interval '7 days' END;
  END IF;

  UPDATE public.academy_attempts
     SET status='submitted', submitted_at=now(), raw_score=_raw, weighted_score=_weighted,
         scenario_score=_scen, category_scores_json=_cats, passed=_passed,
         next_attempt_at=_next, updated_at=now()
   WHERE id=_a.id;

  SELECT * INTO _mod FROM public.academy_modules WHERE id=_a.module_id;

  IF _passed THEN
    INSERT INTO public.academy_certifications
      (user_id, module_id, attempt_id, score, scenario_score, certificate_reference, module_version)
    VALUES (_uid, _a.module_id, _a.id, _weighted, _scen,
            'ACAD-' || upper(left(replace(_a.module_id::text,'-',''),6)) || '-' ||
            upper(left(replace(_a.id::text,'-',''),8)),
            coalesce(_mod.version,1))
    ON CONFLICT DO NOTHING;

    INSERT INTO public.academy_module_progress (user_id, module_id, status, progress_pct, started_at, completed_at)
    VALUES (_uid, _a.module_id, 'certified', public.academy_module_progress_pct(_uid,_a.module_id), now(), now())
    ON CONFLICT (user_id, module_id) DO UPDATE
      SET status='certified', completed_at=coalesce(public.academy_module_progress.completed_at, now()), updated_at=now();
  ELSE
    INSERT INTO public.academy_module_progress (user_id, module_id, status, progress_pct, started_at)
    VALUES (_uid, _a.module_id, 'certification_failed', public.academy_module_progress_pct(_uid,_a.module_id), now())
    ON CONFLICT (user_id, module_id) DO UPDATE
      SET status = CASE WHEN public.academy_module_progress.status='certified' THEN 'certified' ELSE 'certification_failed' END,
          updated_at=now();
  END IF;

  RETURN jsonb_build_object('attempt_id', _a.id, 'passed', _passed,
    'weighted_score', _weighted, 'scenario_score', _scen);
END $$;

-- ── Result (own attempt only; never exposes correct answers) ─────────────
CREATE OR REPLACE FUNCTION public.academy_cert_result(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _a record; _weak jsonb; _cert record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id AND (user_id=_uid OR public.is_academy_admin());
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;

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

  SELECT * INTO _cert FROM public.academy_certifications
   WHERE attempt_id=_a.id AND status='valid' LIMIT 1;

  RETURN jsonb_build_object(
    'attempt_id', _a.id, 'module_id', _a.module_id, 'attempt_number', _a.attempt_number,
    'status', _a.status, 'passed', _a.passed, 'raw_score', _a.raw_score,
    'weighted_score', _a.weighted_score, 'scenario_score', _a.scenario_score,
    'category_scores', _a.category_scores_json, 'submitted_at', _a.submitted_at,
    'next_attempt_at', _a.next_attempt_at, 'total_questions', coalesce(array_length(_a.generated_question_ids,1),0),
    'weak_areas', _weak,
    'certification', CASE WHEN _cert.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _cert.id, 'certificate_reference', _cert.certificate_reference,
      'issued_at', _cert.issued_at, 'score', _cert.score, 'scenario_score', _cert.scenario_score) END
  );
END $$;

-- ── Least-privilege execution ────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.academy_cert_select_questions(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_cert_blueprint_ok(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_answer_is_correct(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_cert_eligibility(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_start(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_answer(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_submit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_cert_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_answer(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_result(uuid) TO authenticated;
