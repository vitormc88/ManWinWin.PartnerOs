DO $do$
DECLARE q record; ok boolean; letter boolean; wrong boolean;
BEGIN
  FOR q IN SELECT * FROM public.academy_questions WHERE question_code IN ('QUA-KNW-001','QUA-APP-013') LOOP
    ok := public.academy_answer_is_correct(q.question_type, q.correct_answer_json, q.correct_answer_json, q.options_json);
    letter := public.academy_answer_is_correct(q.question_type, q.correct_answer_json, to_jsonb('B.'::text), q.options_json);
    wrong := public.academy_answer_is_correct(q.question_type, q.correct_answer_json, q.options_json->0, q.options_json);
    RAISE WARNING 'VERIFY % self=% letterB=% firstOption=%', q.question_code, ok, letter, wrong;
    IF NOT ok THEN RAISE EXCEPTION '% does not accept its own correct answer', q.question_code; END IF;
  END LOOP;
END $do$;