-- Partner Academy — Module 7 certification scenario-gate defect.
--
-- Modules whose blueprint contains no scenario_analysis questions were still
-- inheriting the global default scenario_pass_score = 60 through the settings
-- merge, so academy_cert_submit computed scenario_score = 0 (no scenario
-- questions => 0/0) and failed learners with a perfect score.
--
-- Additive, idempotent and fail-closed. No question, answer, snapshot or score
-- data is rewritten.

-- 1. Reusable effective-settings resolution -------------------------------

CREATE OR REPLACE FUNCTION public.academy_cert_effective_settings(_raw jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  WITH merged AS (
    SELECT CASE
             WHEN coalesce(_raw, '{}'::jsonb) = '{}'::jsonb
               THEN public.academy_cert_default_settings()
             ELSE public.academy_cert_default_settings() || _raw
           END AS s
  )
  SELECT CASE
           WHEN coalesce(_raw, '{}'::jsonb) <> '{}'::jsonb
                AND NOT (_raw ? 'scenario_pass_score')
                AND NOT (
                  (jsonb_typeof(m.s->'allowed_categories') = 'array'
                    AND m.s->'allowed_categories' @> '["scenario_analysis"]'::jsonb)
                  OR EXISTS (
                    SELECT 1
                      FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(m.s->'blueprint') = 'array'
                                  THEN m.s->'blueprint' ELSE '[]'::jsonb END) g
                     WHERE g->'categories' @> '["scenario_analysis"]'::jsonb
                  )
                )
             THEN jsonb_set(m.s, '{scenario_pass_score}', 'null'::jsonb, true)
           ELSE m.s
         END
    FROM merged m
$fn$;

COMMENT ON FUNCTION public.academy_cert_effective_settings(jsonb) IS
  'Merges a module''s certification_settings over the global defaults. Explicit scenario_pass_score (number or null) always wins; custom settings that omit it and expose no scenario_analysis category resolve to null instead of inheriting the default gate.';

REVOKE ALL ON FUNCTION public.academy_cert_effective_settings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_cert_effective_settings(jsonb) TO service_role;

-- Same signature, volatility, security characteristics and search_path as before.
CREATE OR REPLACE FUNCTION public.academy_cert_settings(_module_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT public.academy_cert_effective_settings(m.certification_settings)
    FROM public.academy_modules m
   WHERE m.id = _module_id
$fn$;

-- 2. Module 7 — explicit scenario_pass_score = null -----------------------

DO $m7$
DECLARE
  _id uuid := 'bbb8f8f8-f5af-44b5-90c1-58134da434aa';
  _slug text := 'module-7-discovery';
  _m record;
  _has_scen boolean;
BEGIN
  SELECT * INTO _m FROM public.academy_modules WHERE id = _id;
  IF _m.id IS NULL THEN
    RAISE NOTICE 'Module 7 % not present in this environment — configuration step skipped', _id;
    RETURN;
  END IF;

  IF _m.slug <> _slug THEN
    RAISE EXCEPTION 'Module 7 identity mismatch: % has slug %, expected %', _id, _m.slug, _slug;
  END IF;
  IF coalesce(_m.certification_settings, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'Module 7 has no custom certification_settings — refusing to change';
  END IF;

  SELECT (jsonb_typeof(_m.certification_settings->'allowed_categories') = 'array'
          AND _m.certification_settings->'allowed_categories' @> '["scenario_analysis"]'::jsonb)
      OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(_m.certification_settings->'blueprint') = 'array'
                               THEN _m.certification_settings->'blueprint' ELSE '[]'::jsonb END) g
            WHERE g->'categories' @> '["scenario_analysis"]'::jsonb)
    INTO _has_scen;

  IF _has_scen THEN
    RAISE EXCEPTION 'Module 7 exposes scenario_analysis — refusing to drop its scenario gate';
  END IF;

  IF jsonb_typeof(_m.certification_settings->'scenario_pass_score') = 'null' THEN
    RAISE NOTICE 'Module 7 scenario_pass_score already explicitly null';
    RETURN;
  END IF;

  UPDATE public.academy_modules
     SET certification_settings =
           jsonb_set(certification_settings, '{scenario_pass_score}', 'null'::jsonb, true),
         updated_at = now()
   WHERE id = _id;
END $m7$;

-- 3. Repair of the single affected historical attempt ---------------------

DO $repair$
DECLARE
  _attempt uuid := '5e199505-05c9-4d5a-b062-f2b151859ee5';
  _user    uuid := 'c3f24196-80b9-40f4-8b8e-1c5b66ac16a8';
  _module  uuid := 'bbb8f8f8-f5af-44b5-90c1-58134da434aa';
  _a record; _mod record;
  _qtotal int; _qbad int; _ans int; _wrong int; _ref text; _certs int;
BEGIN
  SELECT * INTO _a FROM public.academy_attempts WHERE id = _attempt FOR UPDATE;
  IF _a.id IS NULL THEN
    RAISE NOTICE 'Attempt % not present in this environment — repair skipped', _attempt;
    RETURN;
  END IF;

  IF _a.user_id <> _user OR _a.module_id <> _module THEN
    RAISE EXCEPTION 'Attempt % does not belong to the expected user/module', _attempt;
  END IF;
  IF _a.status <> 'submitted' THEN
    RAISE EXCEPTION 'Attempt % is %, expected submitted', _attempt, _a.status;
  END IF;
  IF _a.passed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Attempt % is not in the failed state — nothing to repair', _attempt;
  END IF;
  IF _a.raw_score <> 10 OR _a.weighted_score <> 100 THEN
    RAISE EXCEPTION 'Attempt % scores unexpected (raw %, weighted %)', _attempt, _a.raw_score, _a.weighted_score;
  END IF;
  IF coalesce(array_length(_a.generated_question_ids, 1), 0) <> 10 THEN
    RAISE EXCEPTION 'Attempt % does not have exactly 10 generated questions', _attempt;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE q.category NOT IN ('application','advanced'))
    INTO _qtotal, _qbad
    FROM unnest(_a.generated_question_ids) AS g(qid)
    JOIN public.academy_questions q ON q.id = g.qid;
  IF _qtotal <> 10 OR _qbad <> 0 THEN
    RAISE EXCEPTION 'Attempt % questions are not exactly 10 application/advanced items', _attempt;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE NOT coalesce(is_correct, false))
    INTO _ans, _wrong
    FROM public.academy_attempt_answers WHERE attempt_id = _attempt;
  IF _ans <> 10 OR _wrong <> 0 THEN
    RAISE EXCEPTION 'Attempt % does not have exactly 10 correct answers', _attempt;
  END IF;

  IF (_a.category_scores_json->'advanced'->>'pct')::numeric <> 100
     OR (_a.category_scores_json->'application'->>'pct')::numeric <> 100 THEN
    RAISE EXCEPTION 'Attempt % category scores are not both 100', _attempt;
  END IF;

  UPDATE public.academy_attempts
     SET passed = true,
         scenario_score = NULL,
         next_attempt_at = NULL,
         updated_at = now()
   WHERE id = _attempt;

  SELECT * INTO _mod FROM public.academy_modules WHERE id = _module;
  _ref := 'ACAD-' || upper(left(replace(_module::text, '-', ''), 6)) || '-' ||
          upper(left(replace(_attempt::text, '-', ''), 8));

  SELECT count(*) INTO _certs FROM public.academy_certifications
   WHERE certificate_reference = _ref AND attempt_id IS DISTINCT FROM _attempt;
  IF _certs > 0 THEN
    RAISE EXCEPTION 'Certificate reference % already used by another attempt', _ref;
  END IF;

  IF EXISTS (SELECT 1 FROM public.academy_certifications
              WHERE attempt_id = _attempt
                AND (user_id <> _user OR module_id <> _module OR certificate_reference <> _ref)) THEN
    RAISE EXCEPTION 'A conflicting certificate already exists for attempt %', _attempt;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.academy_certifications WHERE attempt_id = _attempt) THEN
    INSERT INTO public.academy_certifications
      (user_id, module_id, attempt_id, score, scenario_score, certificate_reference, module_version)
    VALUES (_user, _module, _attempt, 100, NULL, _ref, coalesce(_mod.version, 1));
  END IF;

  INSERT INTO public.academy_module_progress
    (user_id, module_id, status, progress_pct, started_at, completed_at)
  VALUES (_user, _module, 'certified',
          public.academy_module_progress_pct(_user, _module), now(), now())
  ON CONFLICT (user_id, module_id) DO UPDATE
    SET status = 'certified',
        completed_at = coalesce(public.academy_module_progress.completed_at, now()),
        updated_at = now();

  IF NOT EXISTS (SELECT 1 FROM public.academy_attempts
                  WHERE id = _attempt AND passed AND scenario_score IS NULL AND next_attempt_at IS NULL) THEN
    RAISE EXCEPTION 'Post-check failed: attempt % not repaired', _attempt;
  END IF;
  IF (SELECT count(*) FROM public.academy_certifications
       WHERE attempt_id = _attempt AND status = 'valid') <> 1 THEN
    RAISE EXCEPTION 'Post-check failed: attempt % has no single valid certificate', _attempt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_module_progress
                  WHERE user_id = _user AND module_id = _module AND status = 'certified') THEN
    RAISE EXCEPTION 'Post-check failed: module progress not certified';
  END IF;
END $repair$;