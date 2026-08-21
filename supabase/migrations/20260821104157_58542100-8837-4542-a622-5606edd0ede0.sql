CREATE OR REPLACE FUNCTION public.academy_cert_default_settings()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'version', 1,
    'question_count', 20,
    'pass_score', 80,
    'scenario_pass_score', 60,
    'scoring_mode', 'weighted',
    'time_limit_minutes', 25,
    'estimated_minutes_min', 20,
    'estimated_minutes_max', 25,
    'retry_wait_hours', jsonb_build_array(24, 72, 168),
    'allowed_categories', jsonb_build_array('knowledge','understanding','application','scenario_analysis','advanced','record_review'),
    'allowed_difficulties', 'null'::jsonb,
    'blueprint', jsonb_build_array(
      jsonb_build_object('categories', jsonb_build_array('knowledge'), 'count', 2),
      jsonb_build_object('categories', jsonb_build_array('understanding'), 'count', 4),
      jsonb_build_object('categories', jsonb_build_array('application'), 'count', 5),
      jsonb_build_object('categories', jsonb_build_array('scenario_analysis'), 'count', 6),
      jsonb_build_object('categories', jsonb_build_array('advanced','record_review'), 'count', 3)
    ),
    'constraints', jsonb_build_object(
      'required_tags', jsonb_build_object('timd', 1, 't-form', 1, 'qnd', 2, 'partneros', 2),
      'min_multiple_select', 1,
      'min_ordering_or_classification', 1,
      'min_hard_or_expert', 6,
      'max_per_scenario_group', 2
    )
  )
$fn$;

CREATE OR REPLACE FUNCTION public.academy_cert_settings_error(_s jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
DECLARE _g jsonb; _sum int := 0; _allowed text[]; _diffs text[];
BEGIN
  IF _s IS NULL OR _s = '{}'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(_s) <> 'object' THEN RETURN 'certification_settings must be an object'; END IF;

  IF NOT (_s ? 'question_count') OR (_s->>'question_count')::numeric < 1 THEN
    RETURN 'question_count must be a positive integer';
  END IF;
  IF NOT (_s ? 'pass_score') OR (_s->>'pass_score')::numeric <= 0 OR (_s->>'pass_score')::numeric > 100 THEN
    RETURN 'pass_score must be between 1 and 100';
  END IF;
  IF _s ? 'scenario_pass_score' AND jsonb_typeof(_s->'scenario_pass_score') NOT IN ('null','number') THEN
    RETURN 'scenario_pass_score must be a number or null';
  END IF;
  IF _s ? 'scoring_mode' AND coalesce(_s->>'scoring_mode','') NOT IN ('weighted','raw_percentage') THEN
    RETURN 'scoring_mode must be either weighted or raw_percentage';
  END IF;
  IF _s ? 'time_limit_minutes' AND (_s->>'time_limit_minutes')::numeric < 1 THEN
    RETURN 'time_limit_minutes must be a positive integer';
  END IF;
  IF _s ? 'retry_wait_hours' THEN
    IF jsonb_typeof(_s->'retry_wait_hours') <> 'array'
       OR jsonb_array_length(_s->'retry_wait_hours') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(_s->'retry_wait_hours') h
                   WHERE jsonb_typeof(h) <> 'number' OR (h#>>'{}')::numeric <= 0) THEN
      RETURN 'retry_wait_hours must be a non-empty array of positive numbers';
    END IF;
  END IF;

  IF jsonb_typeof(_s->'allowed_categories') = 'array' THEN
    SELECT array_agg(value) INTO _allowed FROM jsonb_array_elements_text(_s->'allowed_categories');
  END IF;
  IF _s ? 'allowed_difficulties' AND jsonb_typeof(_s->'allowed_difficulties') = 'array' THEN
    SELECT array_agg(value) INTO _diffs FROM jsonb_array_elements_text(_s->'allowed_difficulties');
    IF EXISTS (SELECT 1 FROM unnest(_diffs) d WHERE d NOT IN ('easy','medium','hard','expert')) THEN
      RETURN 'allowed_difficulties contains an unknown difficulty';
    END IF;
  END IF;

  IF jsonb_typeof(_s->'blueprint') <> 'array' OR jsonb_array_length(_s->'blueprint') = 0 THEN
    RETURN 'blueprint must be a non-empty array';
  END IF;
  FOR _g IN SELECT * FROM jsonb_array_elements(_s->'blueprint') LOOP
    IF jsonb_typeof(_g->'categories') <> 'array' OR jsonb_array_length(_g->'categories') = 0 THEN
      RETURN 'each blueprint group needs a non-empty categories array';
    END IF;
    IF NOT (_g ? 'count') OR (_g->>'count')::numeric < 1 THEN
      RETURN 'each blueprint group needs a positive count';
    END IF;
    IF _allowed IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(_g->'categories') c WHERE NOT (c.value = ANY(_allowed))
    ) THEN
      RETURN 'blueprint uses a category outside allowed_categories';
    END IF;
    _sum := _sum + (_g->>'count')::int;
  END LOOP;

  IF _sum <> (_s->>'question_count')::int THEN
    RETURN 'blueprint counts must sum to question_count';
  END IF;

  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.academy_cert_eligibility(_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _total int; _done int; _missing jsonb;
  _active uuid; _cert record; _last record; _mod record;
  _next timestamptz; _state text; _s jsonb; _available boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_access_academy() THEN RAISE EXCEPTION 'You do not have access to the Partner Academy'; END IF;

  SELECT * INTO _mod FROM public.academy_modules WHERE id = _module_id;
  _available := _mod.id IS NOT NULL
                AND _mod.status = 'published'
                AND coalesce(_mod.certification_enabled, false);

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
  ELSIF NOT _available THEN _state := 'locked';
  ELSIF _active IS NOT NULL THEN _state := 'resume';
  ELSIF _done < _total OR _total = 0 THEN _state := 'locked';
  ELSIF _next IS NOT NULL AND _next > now() THEN _state := 'waiting';
  ELSE _state := 'ready';
  END IF;

  IF _available AND _state IN ('ready','waiting') THEN
    INSERT INTO public.academy_module_progress (user_id, module_id, status, progress_pct, started_at)
    VALUES (_uid, _module_id, 'ready_for_certification', public.academy_module_progress_pct(_uid,_module_id), now())
    ON CONFLICT (user_id, module_id) DO UPDATE
      SET status = CASE WHEN public.academy_module_progress.status IN ('certified') THEN public.academy_module_progress.status
                        ELSE 'ready_for_certification' END,
          updated_at = now();
  END IF;

  _s := public.academy_cert_settings(_module_id);

  RETURN jsonb_build_object(
    'state', _state,
    'available', _available,
    'required_total', _total,
    'required_done', _done,
    'missing_items', _missing,
    'active_attempt_id', CASE WHEN _available THEN _active ELSE NULL END,
    'next_attempt_at', _next,
    'last_attempt_id', _last.id,
    'attempts_used', coalesce((SELECT count(*) FROM public.academy_attempts WHERE user_id=_uid AND module_id=_module_id AND status='submitted'),0),
    'settings', CASE WHEN _s IS NULL THEN NULL ELSE jsonb_build_object(
      'question_count', (_s->>'question_count')::int,
      'pass_score', (_s->>'pass_score')::numeric,
      'scenario_pass_score', CASE WHEN jsonb_typeof(_s->'scenario_pass_score') = 'number'
                                  THEN _s->'scenario_pass_score' ELSE 'null'::jsonb END,
      'scoring_mode', coalesce(_s->>'scoring_mode','weighted'),
      'time_limit_minutes', (_s->>'time_limit_minutes')::int,
      'estimated_minutes_min', (_s->>'estimated_minutes_min')::int,
      'estimated_minutes_max', (_s->>'estimated_minutes_max')::int
    ) END,
    'certification', CASE WHEN _cert.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', _cert.id, 'score', _cert.score, 'scenario_score', _cert.scenario_score,
        'issued_at', _cert.issued_at, 'certificate_reference', _cert.certificate_reference,
        'attempt_id', _cert.attempt_id) END
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.academy_cert_start(_module_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _elig jsonb; _state text; _prev uuid[]; _ids uuid[]; _n int; _id uuid; _minutes int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_access_academy() THEN RAISE EXCEPTION 'You do not have access to the Partner Academy'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academy_modules
     WHERE id = _module_id AND status = 'published' AND coalesce(certification_enabled,false)
  ) THEN
    RAISE EXCEPTION 'This module does not have an available certification.';
  END IF;

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
  _minutes := coalesce((public.academy_cert_settings(_module_id)->>'time_limit_minutes')::int, 25);

  SELECT coalesce(max(attempt_number),0)+1 INTO _n FROM public.academy_attempts
   WHERE user_id=_uid AND module_id=_module_id;

  INSERT INTO public.academy_attempts (user_id, module_id, attempt_number, generated_question_ids, started_at, expires_at)
  VALUES (_uid, _module_id, _n, _ids, now(), now() + make_interval(mins => _minutes))
  RETURNING id INTO _id;

  PERFORM public.academy_snapshot_attempt(_id);

  RETURN _id;
END $fn$;

CREATE OR REPLACE FUNCTION public.academy_cert_submit(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _a record; _total_w numeric; _earned_w numeric; _raw int; _qcount int;
  _scen_total numeric; _scen_earned numeric; _cats jsonb;
  _weighted numeric; _effective numeric; _scen numeric; _passed boolean;
  _fails int; _next timestamptz; _mod record;
  _s jsonb; _pass_score numeric; _scen_pass numeric; _waits jsonb; _hours numeric; _mode text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _a FROM public.academy_attempts WHERE id=_attempt_id AND user_id=_uid FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF _a.status <> 'in_progress' THEN
    RETURN jsonb_build_object('attempt_id', _a.id, 'already_submitted', true);
  END IF;

  _s := public.academy_cert_settings(_a.module_id);
  _pass_score := coalesce((_s->>'pass_score')::numeric, 80);
  _mode := coalesce(_s->>'scoring_mode', 'weighted');
  _scen_pass := CASE WHEN jsonb_typeof(_s->'scenario_pass_score') = 'number'
                     THEN (_s->>'scenario_pass_score')::numeric ELSE NULL END;
  _waits := CASE WHEN jsonb_typeof(_s->'retry_wait_hours') = 'array' AND jsonb_array_length(_s->'retry_wait_hours') > 0
                 THEN _s->'retry_wait_hours' ELSE jsonb_build_array(24, 72, 168) END;

  _qcount := coalesce(array_length(_a.generated_question_ids,1),0);

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
  _effective := CASE
                  WHEN _mode = 'raw_percentage' AND _qcount > 0 THEN round(_raw::numeric / _qcount * 100, 1)
                  WHEN _mode = 'raw_percentage' THEN 0
                  ELSE _weighted
                END;
  _scen := CASE WHEN _scen_pass IS NULL THEN NULL
                WHEN _scen_total > 0 THEN round(_scen_earned / _scen_total * 100, 1)
                ELSE 0 END;
  _passed := (_effective >= _pass_score) AND (_scen_pass IS NULL OR _scen >= _scen_pass);

  IF NOT _passed THEN
    SELECT count(*) INTO _fails FROM public.academy_attempts
     WHERE user_id=_uid AND module_id=_a.module_id AND status='submitted' AND NOT passed;
    _fails := _fails + 1;
    _hours := (_waits #>> ARRAY[(least(_fails, jsonb_array_length(_waits)) - 1)::text])::numeric;
    _next := now() + make_interval(mins => (_hours * 60)::int);
  END IF;

  UPDATE public.academy_attempts
     SET status='submitted', submitted_at=now(), raw_score=_raw, weighted_score=_effective,
         scenario_score=_scen, category_scores_json=_cats, passed=_passed,
         next_attempt_at=_next, updated_at=now()
   WHERE id=_a.id;

  SELECT * INTO _mod FROM public.academy_modules WHERE id=_a.module_id;

  IF _passed THEN
    INSERT INTO public.academy_certifications
      (user_id, module_id, attempt_id, score, scenario_score, certificate_reference, module_version)
    VALUES (_uid, _a.module_id, _a.id, _effective, _scen,
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
    'weighted_score', _effective, 'raw_score', _raw, 'scoring_mode', _mode,
    'scenario_score', _scen);
END $fn$;

CREATE OR REPLACE FUNCTION public.academy_cert_result(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE _uid uuid := auth.uid(); _a record; _weak jsonb; _cert record; _has_snapshot boolean; _s jsonb;
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

  _s := public.academy_cert_settings(_a.module_id);

  RETURN jsonb_build_object(
    'attempt_id', _a.id, 'module_id', _a.module_id, 'attempt_number', _a.attempt_number,
    'status', _a.status, 'passed', _a.passed, 'raw_score', _a.raw_score,
    'weighted_score', _a.weighted_score, 'scenario_score', _a.scenario_score,
    'pass_score', (_s->>'pass_score')::numeric,
    'scoring_mode', coalesce(_s->>'scoring_mode','weighted'),
    'scenario_pass_score', CASE WHEN jsonb_typeof(_s->'scenario_pass_score') = 'number'
                                THEN _s->'scenario_pass_score' ELSE 'null'::jsonb END,
    'category_scores', _a.category_scores_json, 'submitted_at', _a.submitted_at,
    'next_attempt_at', _a.next_attempt_at, 'total_questions', coalesce(array_length(_a.generated_question_ids,1),0),
    'has_snapshot', _has_snapshot,
    'weak_areas', _weak,
    'certification', CASE WHEN _cert.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _cert.id, 'certificate_reference', _cert.certificate_reference,
      'issued_at', _cert.issued_at, 'score', _cert.score, 'scenario_score', _cert.scenario_score) END
  );
END $fn$;

DO $mig5$
DECLARE _m record; _expected uuid := '6c260c76-6efa-4e5d-a12f-2900269a78a1';
BEGIN
  SELECT * INTO _m FROM public.academy_modules WHERE slug = 'module-5-qualification';
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Module 5 (module-5-qualification) not found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academy_modules WHERE id = _expected)
     AND _m.id <> _expected THEN
    RAISE EXCEPTION 'Module 5 identity mismatch: slug resolves to % but % exists with another slug', _m.id, _expected;
  END IF;

  UPDATE public.academy_modules
     SET certification_settings = public.academy_cert_default_settings()
   WHERE id = _m.id
     AND coalesce(certification_settings, '{}'::jsonb) = '{}'::jsonb;

  UPDATE public.academy_modules
     SET certification_settings = certification_settings || jsonb_build_object('scoring_mode','weighted')
   WHERE id = _m.id
     AND coalesce(certification_settings, '{}'::jsonb) <> '{}'::jsonb
     AND coalesce(certification_settings->>'scoring_mode','') <> 'weighted';
END $mig5$;

DO $mig1$
DECLARE
  _m record;
  _expected uuid := '13ad8735-7f09-464a-bf0b-115344681b84';
  _slug text := 'module-1-welcome-to-manwinwin';
  _next_sort int; _n int; _noncert int; _pub int; _bad int;
BEGIN
  SELECT count(*) INTO _n FROM public.academy_modules WHERE slug = _slug;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one module with slug %, found %', _slug, _n;
  END IF;
  SELECT * INTO _m FROM public.academy_modules WHERE slug = _slug;

  IF EXISTS (SELECT 1 FROM public.academy_modules WHERE id = _expected)
     AND _m.id <> _expected THEN
    RAISE EXCEPTION 'Module 1 identity mismatch: slug % resolves to % while % exists with another slug', _slug, _m.id, _expected;
  END IF;

  IF _m.status <> 'published' THEN
    RAISE EXCEPTION 'Module 1 must be published, found status %', _m.status;
  END IF;

  SELECT count(*) INTO _pub FROM public.academy_questions
   WHERE module_id = _m.id AND status = 'published';
  IF _pub <> 30 THEN
    RAISE EXCEPTION 'Module 1 must have exactly 30 published questions, found %', _pub;
  END IF;

  SELECT count(*) INTO _bad FROM public.academy_questions
   WHERE module_id = _m.id AND status = 'published'
     AND (category NOT IN ('knowledge','understanding','application')
          OR difficulty NOT IN ('easy','medium'));
  IF _bad > 0 THEN
    RAISE EXCEPTION 'Module 1 has % published questions outside the allowed categories/difficulties', _bad;
  END IF;

  SELECT count(*) INTO _noncert FROM public.academy_missions
   WHERE module_id = _m.id AND item_kind <> 'certification';
  IF _noncert <> 9 THEN
    RAISE EXCEPTION 'Module 1 must have exactly 9 non-certification items, found %', _noncert;
  END IF;

  UPDATE public.academy_modules
     SET certification_enabled = true,
         certification_settings = jsonb_build_object(
           'version', 1,
           'question_count', 10,
           'pass_score', 80,
           'scenario_pass_score', 'null'::jsonb,
           'scoring_mode', 'raw_percentage',
           'time_limit_minutes', 15,
           'estimated_minutes_min', 5,
           'estimated_minutes_max', 7,
           'retry_wait_hours', jsonb_build_array(24, 72, 168),
           'allowed_categories', jsonb_build_array('knowledge','understanding','application'),
           'allowed_difficulties', jsonb_build_array('easy','medium'),
           'blueprint', jsonb_build_array(
             jsonb_build_object('categories', jsonb_build_array('knowledge','understanding','application'), 'count', 10)
           ),
           'constraints', '{}'::jsonb
         ),
         updated_at = now()
   WHERE id = _m.id;

  SELECT coalesce(max(sort_order),0) + 1 INTO _next_sort
    FROM public.academy_missions WHERE module_id = _m.id AND item_kind <> 'certification';

  SELECT count(*) INTO _n FROM public.academy_missions
   WHERE module_id = _m.id AND item_kind = 'certification';
  IF _n > 1 THEN
    RAISE EXCEPTION 'Module 1 already has % certification items', _n;
  END IF;

  IF _n = 0 THEN
    INSERT INTO public.academy_missions
      (module_id, mission_number, title, slug, short_description, estimated_duration_minutes,
       item_kind, is_locked, is_required, sort_order, status, version, content_markdown)
    VALUES (
      _m.id,
      (SELECT coalesce(max(mission_number),0) + 1 FROM public.academy_missions WHERE module_id = _m.id),
      'Module Certification',
      'module-certification',
      'Confirm the fundamentals of Module 1 with a short, randomised certification.',
      7,
      'certification', true, false, _next_sort, 'published', 1,
      ''
    );
  END IF;

  UPDATE public.academy_missions
     SET content_markdown = E'## Module Certification\n\nThis certification confirms that you understood the fundamentals introduced in Module 1.\n\n### How it works\n\n- **10 questions**, randomly selected from the Module 1 question bank — every attempt is different.\n- **Scoring is based on the number of correct answers**: you need **8 correct answers out of 10 (80%)**. Every question counts the same.\n- Difficulty: **Easy and Medium** only.\n- Estimated time: **5 to 7 minutes**.\n\n### What is covered\n\nOnly the fundamentals presented in this module: who ManWinWin is, how the partnership works, and the basic vocabulary you will use every day.\n\nIt does **not** cover detailed product knowledge, licensing, pricing, contractual clauses, dates, or advanced sales skills. Those are certified in later modules.\n\n### Before you start\n\nComplete every required learning item in this module. Once you begin, the attempt is timed and your answers are saved as you confirm them.\n\nWhen you are ready, press **Start Certification**.',
         updated_at = now()
   WHERE module_id = _m.id AND item_kind = 'certification';

  SELECT count(*) INTO _n FROM public.academy_missions
   WHERE module_id = _m.id AND item_kind = 'certification';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'Module 1 must have exactly one certification item, found %', _n;
  END IF;

  SELECT count(*) INTO _noncert FROM public.academy_missions
   WHERE module_id = _m.id AND item_kind <> 'certification';
  IF _noncert <> 9 THEN
    RAISE EXCEPTION 'Module 1 non-certification items changed, found %', _noncert;
  END IF;
END $mig1$;

REVOKE ALL ON FUNCTION public.academy_cert_default_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_settings_error(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_settings_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_blueprint_ok(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_blueprint_ok(uuid[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_select_questions(uuid, uuid[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.academy_cert_eligibility(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_start(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_submit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.academy_cert_result(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academy_cert_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_result(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.academy_cert_default_settings() TO service_role;
GRANT EXECUTE ON FUNCTION public.academy_cert_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.academy_cert_eligibility(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.academy_cert_start(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.academy_cert_submit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.academy_cert_result(uuid) TO service_role;