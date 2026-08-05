CREATE OR REPLACE FUNCTION public.academy_import_records(
  _entity text,
  _module_id uuid,
  _rows jsonb,
  _mode text DEFAULT 'skip'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r jsonb;
  _inserted int := 0;
  _updated int := 0;
  _skipped int := 0;
  _code text;
  _mission uuid;
  _exists uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_academy_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _entity <> 'questions' THEN RAISE EXCEPTION 'Unsupported import entity: %', _entity; END IF;
  IF _mode NOT IN ('skip','update') THEN RAISE EXCEPTION 'Unsupported import mode: %', _mode; END IF;
  IF _module_id IS NULL THEN RAISE EXCEPTION 'Module is required'; END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'Rows payload must be an array'; END IF;
  IF jsonb_array_length(_rows) = 0 THEN RAISE EXCEPTION 'Nothing to import'; END IF;
  IF jsonb_array_length(_rows) > 1000 THEN RAISE EXCEPTION 'Import batch too large (max 1000 rows)'; END IF;

  FOR _r IN SELECT jsonb_array_elements(_rows) LOOP
    _code := nullif(trim(_r->>'question_code'), '');
    IF _code IS NULL THEN RAISE EXCEPTION 'Every question needs a code'; END IF;

    _mission := nullif(_r->>'mission_id','')::uuid;
    IF _mission IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.academy_missions m WHERE m.id = _mission AND m.module_id = _module_id
    ) THEN
      RAISE EXCEPTION 'Mission % does not belong to the selected module (question %)', _mission, _code;
    END IF;

    SELECT q.id INTO _exists FROM public.academy_questions q
      WHERE q.module_id = _module_id AND q.question_code = _code;

    IF _exists IS NOT NULL THEN
      IF _mode = 'skip' THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;
      UPDATE public.academy_questions SET
        mission_id = _mission,
        question_text = _r->>'question_text',
        scenario_text = nullif(_r->>'scenario_text',''),
        scenario_group = nullif(_r->>'scenario_group',''),
        category = _r->>'category',
        question_type = _r->>'question_type',
        difficulty = _r->>'difficulty',
        weight = coalesce((_r->>'weight')::int, 1),
        status = coalesce(nullif(_r->>'status',''), 'draft'),
        is_mandatory = coalesce((_r->>'is_mandatory')::boolean, false),
        explanation = nullif(_r->>'explanation',''),
        options_json = coalesce(_r->'options_json', '[]'::jsonb),
        correct_answer_json = _r->'correct_answer_json',
        tags_json = coalesce(_r->'tags_json', '[]'::jsonb),
        version = version + 1,
        updated_at = now()
      WHERE id = _exists;
      _updated := _updated + 1;
    ELSE
      INSERT INTO public.academy_questions (
        module_id, mission_id, question_code, question_text, scenario_text, scenario_group,
        category, question_type, difficulty, weight, status, is_mandatory, explanation,
        options_json, correct_answer_json, tags_json
      ) VALUES (
        _module_id, _mission, _code, _r->>'question_text', nullif(_r->>'scenario_text',''),
        nullif(_r->>'scenario_group',''), _r->>'category', _r->>'question_type', _r->>'difficulty',
        coalesce((_r->>'weight')::int, 1), coalesce(nullif(_r->>'status',''), 'draft'),
        coalesce((_r->>'is_mandatory')::boolean, false), nullif(_r->>'explanation',''),
        coalesce(_r->'options_json', '[]'::jsonb), _r->'correct_answer_json',
        coalesce(_r->'tags_json', '[]'::jsonb)
      );
      _inserted := _inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', _inserted, 'updated', _updated, 'skipped', _skipped);
END $$;

REVOKE ALL ON FUNCTION public.academy_import_records(text, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_import_records(text, uuid, jsonb, text) TO authenticated;