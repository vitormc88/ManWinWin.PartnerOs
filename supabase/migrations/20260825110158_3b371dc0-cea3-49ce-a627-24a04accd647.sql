-- Module 7 certification repair hardening.
-- Additive corrective migration; the original migration remains unchanged.

-- Mirror academy_cert_settings(uuid)'s established caller contract onto the
-- pure IMMUTABLE helper instead of assuming the ACL is identical everywhere.
DO $acl$
DECLARE
  _role text;
BEGIN
  FOREACH _role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(_role, 'public.academy_cert_settings(uuid)', 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.academy_cert_effective_settings(jsonb) TO %I', _role);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.academy_cert_effective_settings(jsonb) FROM %I', _role);
    END IF;
  END LOOP;

  IF has_function_privilege('public', 'public.academy_cert_settings(uuid)', 'EXECUTE') THEN
    GRANT EXECUTE ON FUNCTION public.academy_cert_effective_settings(jsonb) TO PUBLIC;
  ELSE
    REVOKE EXECUTE ON FUNCTION public.academy_cert_effective_settings(jsonb) FROM PUBLIC;
  END IF;

  IF has_function_privilege('public', 'public.academy_cert_settings(uuid)', 'EXECUTE')
       IS DISTINCT FROM has_function_privilege('public', 'public.academy_cert_effective_settings(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.academy_cert_settings(uuid)', 'EXECUTE')
       IS DISTINCT FROM has_function_privilege('anon', 'public.academy_cert_effective_settings(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.academy_cert_settings(uuid)', 'EXECUTE')
       IS DISTINCT FROM has_function_privilege('authenticated', 'public.academy_cert_effective_settings(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.academy_cert_settings(uuid)', 'EXECUTE')
       IS DISTINCT FROM has_function_privilege('service_role', 'public.academy_cert_effective_settings(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'academy_cert_effective_settings EXECUTE contract does not match academy_cert_settings';
  END IF;
END $acl$;

DO $repair$
DECLARE
  _attempt constant uuid := '5e199505-05c9-4d5a-b062-f2b151859ee5';
  _user constant uuid := 'c3f24196-80b9-40f4-8b8e-1c5b66ac16a8';
  _module constant uuid := 'bbb8f8f8-f5af-44b5-90c1-58134da434aa';
  _slug constant text := 'module-7-discovery';
  _a record;
  _mod record;
  _qtotal int;
  _qbad int;
  _qscenario int;
  _ans int;
  _wrong int;
  _ref text;
  _cert_total int;
  _cert_valid int;
  _updated int;
  _already_repaired boolean;
BEGIN
  SELECT * INTO _a FROM public.academy_attempts WHERE id = _attempt FOR UPDATE;
  IF _a.id IS NULL THEN
    RAISE NOTICE 'Attempt % not present in this environment — repair skipped', _attempt;
    RETURN;
  END IF;

  SELECT * INTO _mod FROM public.academy_modules WHERE id = _module;
  IF _mod.id IS NULL OR _mod.slug IS DISTINCT FROM _slug THEN
    RAISE EXCEPTION 'Module 7 identity mismatch for %', _module;
  END IF;
  IF _a.user_id IS DISTINCT FROM _user OR _a.module_id IS DISTINCT FROM _module THEN
    RAISE EXCEPTION 'Attempt % does not belong to the expected user/module', _attempt;
  END IF;
  IF _a.status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'Attempt % is %, expected submitted', _attempt, _a.status;
  END IF;
  IF _a.raw_score IS DISTINCT FROM 10 OR _a.weighted_score IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'Attempt % scores unexpected (raw %, weighted %)', _attempt, _a.raw_score, _a.weighted_score;
  END IF;
  IF coalesce(array_length(_a.generated_question_ids, 1), 0) <> 10 THEN
    RAISE EXCEPTION 'Attempt % does not have exactly 10 generated questions', _attempt;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE q.category NOT IN ('application', 'advanced')),
         count(*) FILTER (WHERE q.category = 'scenario_analysis')
    INTO _qtotal, _qbad, _qscenario
    FROM unnest(_a.generated_question_ids) AS g(qid)
    JOIN public.academy_questions q ON q.id = g.qid;
  IF _qtotal <> 10 OR _qbad <> 0 THEN
    RAISE EXCEPTION 'Attempt % questions are not exactly 10 application/advanced items', _attempt;
  END IF;
  IF _qscenario <> 0 THEN
    RAISE EXCEPTION 'Attempt % unexpectedly contains % scenario_analysis questions', _attempt, _qscenario;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_correct IS DISTINCT FROM true)
    INTO _ans, _wrong
    FROM public.academy_attempt_answers
   WHERE attempt_id = _attempt;
  IF _ans <> 10 OR _wrong <> 0 THEN
    RAISE EXCEPTION 'Attempt % does not have exactly 10 correct answers', _attempt;
  END IF;
  IF (_a.category_scores_json->'advanced'->>'pct')::numeric IS DISTINCT FROM 100
     OR (_a.category_scores_json->'application'->>'pct')::numeric IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'Attempt % category scores are not both 100', _attempt;
  END IF;

  _already_repaired := _a.passed IS TRUE
                       AND _a.scenario_score IS NULL
                       AND _a.next_attempt_at IS NULL;
  IF NOT _already_repaired
     AND NOT (_a.passed IS FALSE AND _a.scenario_score IS NOT DISTINCT FROM 0) THEN
    RAISE EXCEPTION 'Attempt % is neither the exact original defect nor the exact repaired state', _attempt;
  END IF;

  _ref := 'ACAD-' || upper(left(replace(_module::text, '-', ''), 6)) || '-' ||
          upper(left(replace(_attempt::text, '-', ''), 8));
  IF EXISTS (SELECT 1 FROM public.academy_certifications
              WHERE certificate_reference = _ref AND attempt_id IS DISTINCT FROM _attempt) THEN
    RAISE EXCEPTION 'Certificate reference % is used by another attempt', _ref;
  END IF;
  IF EXISTS (SELECT 1 FROM public.academy_certifications
              WHERE attempt_id = _attempt
                AND (user_id IS DISTINCT FROM _user
                  OR module_id IS DISTINCT FROM _module
                  OR certificate_reference IS DISTINCT FROM _ref
                  OR score IS DISTINCT FROM 100
                  OR scenario_score IS NOT NULL
                  OR module_version IS DISTINCT FROM coalesce(_mod.version, 1))) THEN
    RAISE EXCEPTION 'A conflicting certificate exists for attempt %', _attempt;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'valid')
    INTO _cert_total, _cert_valid
    FROM public.academy_certifications
   WHERE attempt_id = _attempt;

  IF _already_repaired THEN
    IF _cert_total <> 1 OR _cert_valid <> 1 THEN
      RAISE EXCEPTION 'Repaired attempt % must have exactly one valid certificate', _attempt;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.academy_module_progress
                    WHERE user_id = _user AND module_id = _module AND status = 'certified') THEN
      RAISE EXCEPTION 'Repaired attempt % has no certified module progress', _attempt;
    END IF;
  ELSE
    IF _cert_total <> 0 THEN
      RAISE EXCEPTION 'Failed attempt % already has a certificate', _attempt;
    END IF;

    UPDATE public.academy_attempts
       SET passed = true, scenario_score = NULL, next_attempt_at = NULL, updated_at = now()
     WHERE id = _attempt AND passed IS FALSE AND scenario_score IS NOT DISTINCT FROM 0;
    GET DIAGNOSTICS _updated = ROW_COUNT;
    IF _updated <> 1 THEN
      RAISE EXCEPTION 'Attempt % changed while locked; repair aborted', _attempt;
    END IF;

    INSERT INTO public.academy_certifications
      (user_id, module_id, attempt_id, score, scenario_score, certificate_reference, module_version)
    VALUES (_user, _module, _attempt, 100, NULL, _ref, coalesce(_mod.version, 1));

    INSERT INTO public.academy_module_progress
      (user_id, module_id, status, progress_pct, started_at, completed_at)
    VALUES (_user, _module, 'certified', public.academy_module_progress_pct(_user, _module), now(), now())
    ON CONFLICT (user_id, module_id) DO UPDATE
      SET status = 'certified',
          completed_at = coalesce(public.academy_module_progress.completed_at, now()),
          updated_at = now();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.academy_attempts
                  WHERE id = _attempt AND passed IS TRUE
                    AND scenario_score IS NULL AND next_attempt_at IS NULL) THEN
    RAISE EXCEPTION 'Post-check failed: attempt % is not in the repaired state', _attempt;
  END IF;
  IF (SELECT count(*) FROM public.academy_certifications
       WHERE attempt_id = _attempt AND status = 'valid') <> 1
     OR (SELECT count(*) FROM public.academy_certifications WHERE attempt_id = _attempt) <> 1 THEN
    RAISE EXCEPTION 'Post-check failed: attempt % does not have exactly one valid certificate', _attempt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_module_progress
                  WHERE user_id = _user AND module_id = _module AND status = 'certified') THEN
    RAISE EXCEPTION 'Post-check failed: module progress is not certified';
  END IF;
END $repair$;