DO $$
DECLARE
  _mod uuid;
  _m1 uuid;
  _m6 uuid;
  _res uuid;
  _lesson text;
  _n int;
  _codes_m6 text[] := ARRAY['QUA-ADV-005','QUA-ADV-010','QUA-REC-001','QUA-REC-002','QUA-REC-003','QUA-REC-004'];
  _codes_m1 text[] := ARRAY['QUA-REC-005','QUA-SCN-024'];
BEGIN
  SELECT id INTO _mod FROM public.academy_modules WHERE slug = 'module-5-qualification';
  IF _mod IS NULL THEN
    RAISE EXCEPTION 'Module 5 (module-5-qualification) not found';
  END IF;

  SELECT id INTO _m1 FROM public.academy_missions
   WHERE module_id = _mod AND slug = 'mission-1-good-opportunity';
  SELECT id INTO _m6 FROM public.academy_missions
   WHERE module_id = _mod AND slug = 'mission-6-in-partneros';
  IF _m1 IS NULL OR _m6 IS NULL THEN
    RAISE EXCEPTION 'Target missions missing (mission 1: %, mission 6: %)', _m1, _m6;
  END IF;

  -- 1) Mission mappings ---------------------------------------------------
  SELECT count(*) INTO _n FROM public.academy_questions
   WHERE module_id = _mod AND question_code = ANY(_codes_m6 || _codes_m1);
  IF _n <> 8 THEN
    RAISE EXCEPTION 'Expected 8 remappable questions in Module 5, found %', _n;
  END IF;

  UPDATE public.academy_questions
     SET mission_id = _m6
   WHERE module_id = _mod AND question_code = ANY(_codes_m6) AND mission_id IS DISTINCT FROM _m6;

  UPDATE public.academy_questions
     SET mission_id = _m1
   WHERE module_id = _mod AND question_code = ANY(_codes_m1) AND mission_id IS DISTINCT FROM _m1;

  SELECT count(*) INTO _n FROM public.academy_questions
   WHERE module_id = _mod
     AND ((question_code = ANY(_codes_m6) AND mission_id = _m6)
       OR (question_code = ANY(_codes_m1) AND mission_id = _m1));
  IF _n <> 8 THEN
    RAISE EXCEPTION 'Post-condition failed: % of 8 questions mapped', _n;
  END IF;

  -- 2) Module + item copy -------------------------------------------------
  UPDATE public.academy_modules
     SET full_description =
           'Qualification decides where partner selling time is invested. This module teaches how to '
           || 'recognise a credible opportunity, apply the TIMD framework, capture the answers in the '
           || 'T-FORM, ask questions that surface real intent, and close every opportunity with an '
           || 'explicit Qualify, Nurture or Disqualify decision recorded in PartnerOS.'
   WHERE id = _mod
     AND (full_description IS NULL OR full_description ILIKE '%placeholder%');

  UPDATE public.academy_missions
     SET short_description =
           'Apply the full qualification method to a realistic opportunity before certifying.'
   WHERE module_id = _mod AND item_kind = 'exercise'
     AND (short_description IS NULL OR short_description ILIKE '%placeholder%');

  UPDATE public.academy_missions
     SET short_description =
           'Final assessment: pass with a weighted score of at least 80% and a Scenario Analysis score of at least 60%.'
   WHERE module_id = _mod AND item_kind = 'certification'
     AND short_description IS DISTINCT FROM
         'Final assessment: pass with a weighted score of at least 80% and a Scenario Analysis score of at least 60%.';

  -- 3) Align the stated passing rule and drop the unlock claim ------------
  UPDATE public.academy_missions
     SET content_markdown = replace(
           content_markdown,
           '- A minimum score of **80%** is required to pass.',
           '- To pass you need **both**: a weighted score of at least **80%** and a Scenario Analysis score of at least **60%**.'
         )
   WHERE module_id = _mod
     AND content_markdown LIKE '%- A minimum score of **80%%** is required to pass.%';

  UPDATE public.academy_missions
     SET content_markdown = replace(content_markdown, E'- unlock the next Academy module;\n', '')
   WHERE module_id = _mod AND content_markdown LIKE '%unlock the next Academy module;%';

  UPDATE public.academy_missions
     SET content_markdown = replace(content_markdown, E'\n\nSee you in the next module!', '')
   WHERE module_id = _mod AND content_markdown LIKE '%See you in the next module!%';

  -- 4) Publish the Qualification Checklist resource in place --------------
  -- The resource must already exist and belong to the resolved Module 5.
  -- No fallback insert: a missing or mis-parented row is a data defect that
  -- must fail loudly rather than silently create a duplicate checklist.
  SELECT count(*) INTO _n FROM public.academy_resources
   WHERE module_id = _mod AND resource_type = 'checklist';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one checklist resource for Module 5, found %', _n;
  END IF;

  SELECT id INTO _res FROM public.academy_resources
   WHERE id = '81ca8468-8a80-41fb-abde-da40507bf4ff'::uuid
     AND module_id = _mod;
  IF _res IS NULL THEN
    RAISE EXCEPTION
      'Checklist resource 81ca8468-8a80-41fb-abde-da40507bf4ff is missing or does not belong to Module 5 (%)', _mod;
  END IF;

  SELECT content_markdown INTO _lesson FROM public.academy_missions
   WHERE module_id = _mod AND slug = 'qualification-checklist';

  UPDATE public.academy_resources
     SET title = 'Qualification Checklist',
         description = 'Field checklist to run before committing time to an opportunity - TIMD coverage, T-FORM completeness and the explicit qualification decision.',
         resource_type = 'checklist',
         status = 'published',
         version = coalesce(nullif(version, ''), '1.0'),
         content = CASE
           WHEN coalesce(content, '') = '' OR content ILIKE '%placeholder%'
             THEN coalesce(nullif(_lesson, ''), content)
           ELSE content
         END,
         -- Content-only resource: there is no stored file or external URL, so
         -- it is read and printed in-app, never offered as a file download.
         is_downloadable = false,
         module_id = _mod
   WHERE id = _res;
END $$;