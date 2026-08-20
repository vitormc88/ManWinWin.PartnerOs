-- Partner Academy — Module 5 (Qualification) P0 remediation.

CREATE OR REPLACE FUNCTION public.academy_resolve_option(_value jsonb, _options jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE _txt text; _hit text; _idx int;
BEGIN
  IF _value IS NULL OR jsonb_typeof(_value) <> 'string' THEN RETURN NULL; END IF;
  IF _options IS NULL OR jsonb_typeof(_options) <> 'array' THEN RETURN NULL; END IF;
  _txt := btrim(regexp_replace(_value #>> '{}', '\s+', ' ', 'g'));
  IF _txt = '' THEN RETURN NULL; END IF;

  SELECT o INTO _hit FROM (SELECT jsonb_array_elements_text(_options) o) x
   WHERE lower(btrim(regexp_replace(o, '\s+', ' ', 'g'))) = lower(_txt) LIMIT 1;
  IF _hit IS NOT NULL THEN RETURN _hit; END IF;

  SELECT o INTO _hit FROM (SELECT jsonb_array_elements_text(_options) o) x
   WHERE lower(btrim(regexp_replace(regexp_replace(o, '^[A-Za-z]\s*[.)-]\s*', ''), '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(regexp_replace(_txt, '^[A-Za-z]\s*[.)-]\s*', ''), '\s+', ' ', 'g')))
     AND btrim(regexp_replace(_txt, '^[A-Za-z]\s*[.)-]\s*', '')) <> ''
   LIMIT 1;
  IF _hit IS NOT NULL THEN RETURN _hit; END IF;

  IF _txt ~ '^[A-Za-z]\s*[.)-]?\s*$' THEN
    _idx := ascii(upper(left(_txt, 1))) - 65;
    IF _idx >= 0 AND _idx < jsonb_array_length(_options) THEN RETURN _options ->> _idx; END IF;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.academy_resolve_option(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.academy_answer_is_correct(
  _type text, _correct jsonb, _given jsonb, _options jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE _a jsonb; _b jsonb; _multi boolean;
BEGIN
  IF _given IS NULL OR _correct IS NULL THEN RETURN false; END IF;

  IF _type = 'classification' THEN
    IF jsonb_typeof(_correct) <> 'object' OR jsonb_typeof(_given) <> 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_each(_correct)) <> (SELECT count(*) FROM jsonb_each(_given)) THEN
      RETURN false;
    END IF;
    SELECT coalesce(jsonb_object_agg(k2, v2), '{}'::jsonb) INTO _a FROM (
      SELECT coalesce(public.academy_resolve_option(to_jsonb(k), _options), k) k2,
             lower(btrim(regexp_replace(v, '\s+', ' ', 'g'))) v2
        FROM jsonb_each_text(_correct) t(k, v)) c;
    SELECT coalesce(jsonb_object_agg(k2, v2), '{}'::jsonb) INTO _b FROM (
      SELECT coalesce(public.academy_resolve_option(to_jsonb(k), _options), k) k2,
             lower(btrim(regexp_replace(v, '\s+', ' ', 'g'))) v2
        FROM jsonb_each_text(_given) t(k, v)) g;
    RETURN _a = _b;
  END IF;

  IF _type = 'ordering' THEN
    IF jsonb_typeof(_correct) <> 'array' OR jsonb_typeof(_given) <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(_correct) <> jsonb_array_length(_given) THEN RETURN false; END IF;
    RETURN NOT EXISTS (
      SELECT 1 FROM generate_series(0, jsonb_array_length(_correct) - 1) i
       WHERE coalesce(public.academy_resolve_option(_correct -> i, _options), _correct ->> i)
          IS DISTINCT FROM coalesce(public.academy_resolve_option(_given -> i, _options), _given ->> i)
    );
  END IF;

  _multi := _type IN ('multiple_select', 'scenario_multiple_select')
         OR (_type = 'record_review' AND jsonb_typeof(_correct) = 'array');

  IF _multi THEN
    IF jsonb_typeof(_correct) <> 'array' OR jsonb_typeof(_given) <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(_given) = 0 THEN RETURN false; END IF;
    IF (SELECT count(DISTINCT coalesce(public.academy_resolve_option(v, _options), v #>> '{}'))
          FROM jsonb_array_elements(_given) v) <> jsonb_array_length(_given) THEN
      RETURN false;
    END IF;
    SELECT jsonb_agg(t ORDER BY t) INTO _a FROM (
      SELECT DISTINCT coalesce(public.academy_resolve_option(v, _options), v #>> '{}') t
        FROM jsonb_array_elements(_correct) v) x;
    SELECT jsonb_agg(t ORDER BY t) INTO _b FROM (
      SELECT DISTINCT coalesce(public.academy_resolve_option(v, _options), v #>> '{}') t
        FROM jsonb_array_elements(_given) v) y;
    RETURN coalesce(_a, '[]'::jsonb) = coalesce(_b, '[]'::jsonb);
  END IF;

  IF jsonb_typeof(_correct) = 'array' OR jsonb_typeof(_given) = 'array' THEN RETURN false; END IF;
  RETURN coalesce(public.academy_resolve_option(_correct, _options), _correct #>> '{}')
       = coalesce(public.academy_resolve_option(_given, _options), _given #>> '{}');
END $$;

REVOKE ALL ON FUNCTION public.academy_answer_is_correct(text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.academy_cert_answer(_attempt_id uuid, _question_id uuid, _answer jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  _ok := public.academy_answer_is_correct(_q.question_type, _q.correct_answer_json, _answer, _q.options_json);

  INSERT INTO public.academy_attempt_answers (attempt_id, question_id, selected_answer_json, is_correct, awarded_score)
  VALUES (_attempt_id, _question_id, _answer, _ok, CASE WHEN _ok THEN _q.weight ELSE 0 END);
END $$;

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
      'classification_labels', CASE WHEN q.question_type = 'classification'
                                     AND jsonb_typeof(q.correct_answer_json) = 'object'
        THEN coalesce((
          SELECT jsonb_agg(lbl ORDER BY ord)
            FROM (
              SELECT btrim(regexp_replace(v, '\s+', ' ', 'g')) lbl, min(ord) ord
                FROM (SELECT v, row_number() OVER () ord
                        FROM jsonb_each_text(q.correct_answer_json) e(k, v)) s
               GROUP BY btrim(regexp_replace(v, '\s+', ' ', 'g'))
            ) z
           WHERE lbl <> ''), '[]'::jsonb)
        ELSE NULL END,
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

REVOKE ALL ON FUNCTION public.academy_cert_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_cert_state(uuid) TO authenticated;

DO $do$
DECLARE
  _module uuid;
  _extras text[] := ARRAY['QUA-KNW-006','QUA-KNW-007','QUA-KNW-008','QUA-KNW-009','QUA-KNW-010',
                          'QUA-ADV-006','QUA-ADV-007','QUA-ADV-008','QUA-ADV-009','QUA-ADV-010'];
  _timd text := 'B. Timing, Interest, Money, Decision-making';
  _q record; _n int; _labels int; _items int;
BEGIN
  SELECT module_id INTO _module FROM public.academy_questions
   WHERE question_code LIKE 'QUA-%' GROUP BY module_id ORDER BY count(*) DESC LIMIT 1;
  IF _module IS NULL THEN
    RAISE NOTICE 'No Qualification question bank found — nothing to correct.';
    RETURN;
  END IF;

  SELECT * INTO _q FROM public.academy_questions
   WHERE module_id = _module AND question_code = 'QUA-KNW-001';
  IF _q.id IS NOT NULL THEN
    IF _q.question_type <> 'single_choice' THEN
      RAISE EXCEPTION 'QUA-KNW-001 is % — expected single_choice; aborting.', _q.question_type;
    END IF;
    SELECT count(*) INTO _n FROM jsonb_array_elements_text(_q.options_json) o WHERE o = _timd;
    IF _n = 1 THEN
      UPDATE public.academy_questions SET correct_answer_json = to_jsonb(_timd)
       WHERE id = _q.id AND correct_answer_json IS DISTINCT FROM to_jsonb(_timd);
    ELSIF _n > 1 THEN
      RAISE EXCEPTION 'QUA-KNW-001 has % duplicate TIMD options; aborting.', _n;
    ELSE
      IF public.academy_resolve_option(_q.correct_answer_json, _q.options_json) IS NULL THEN
        RAISE EXCEPTION 'QUA-KNW-001 correct answer does not resolve to any option; aborting.';
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO _n FROM public.academy_questions
   WHERE module_id = _module AND question_code = ANY(_extras);
  IF _n > array_length(_extras, 1) THEN
    RAISE EXCEPTION 'Unexpected extra-question count (%); aborting.', _n;
  END IF;
  UPDATE public.academy_questions SET status = 'archived'
   WHERE module_id = _module AND question_code = ANY(_extras) AND status <> 'archived';

  SELECT * INTO _q FROM public.academy_questions
   WHERE module_id = _module AND question_code = 'QUA-APP-013';
  IF _q.id IS NOT NULL AND _q.status <> 'published' THEN
    IF _q.question_type <> 'classification' OR jsonb_typeof(_q.correct_answer_json) <> 'object' THEN
      RAISE NOTICE 'QUA-APP-013 is not a classification question — left unchanged.';
    ELSE
      SELECT count(*) INTO _items FROM jsonb_each(_q.correct_answer_json);
      SELECT count(DISTINCT btrim(v)) INTO _labels
        FROM jsonb_each_text(_q.correct_answer_json) e(k, v) WHERE btrim(v) <> '';
      IF _items <> jsonb_array_length(_q.options_json)
         OR EXISTS (SELECT 1 FROM jsonb_each_text(_q.correct_answer_json) e(k, v)
                     WHERE public.academy_resolve_option(to_jsonb(k), _q.options_json) IS NULL
                        OR btrim(v) = '')
         OR _labels < 2 THEN
        RAISE NOTICE 'QUA-APP-013 configuration is still invalid — left unpublished.';
      ELSE
        UPDATE public.academy_questions SET status = 'published' WHERE id = _q.id;
      END IF;
    END IF;
  END IF;

  WITH fixed AS (
    UPDATE public.academy_questions q SET
      question_text = replace(replace(replace(q.question_text,
        'Trigger, Impact, Money, Decision-making', 'Timing, Interest, Money, Decision-making'),
        'Trigger, Interest, Money, Decision-making', 'Timing, Interest, Money, Decision-making'),
        'Timing, Interest, Money, Decision Making', 'Timing, Interest, Money, Decision-making'),
      scenario_text = nullif(replace(replace(replace(coalesce(q.scenario_text, ''),
        'Trigger, Impact, Money, Decision-making', 'Timing, Interest, Money, Decision-making'),
        'Trigger, Interest, Money, Decision-making', 'Timing, Interest, Money, Decision-making'),
        'Timing, Interest, Money, Decision Making', 'Timing, Interest, Money, Decision-making'), ''),
      explanation = nullif(replace(replace(replace(coalesce(q.explanation, ''),
        'Trigger, Impact, Money, Decision-making', 'Timing, Interest, Money, Decision-making'),
        'Trigger, Interest, Money, Decision-making', 'Timing, Interest, Money, Decision-making'),
        'Timing, Interest, Money, Decision Making', 'Timing, Interest, Money, Decision-making'), '')
    WHERE q.module_id = _module
      AND (q.question_text || coalesce(q.scenario_text, '') || coalesce(q.explanation, '')) ~
          '(Trigger, Impact, Money, Decision-making|Trigger, Interest, Money, Decision-making|Timing, Interest, Money, Decision Making)'
    RETURNING 1)
  SELECT count(*) INTO _n FROM fixed;
  IF _n > 60 THEN
    RAISE EXCEPTION 'TIMD normalization would touch % rows; aborting.', _n;
  END IF;
  RAISE NOTICE 'Module 5 remediation applied (TIMD rows normalized: %).', _n;
END $do$;