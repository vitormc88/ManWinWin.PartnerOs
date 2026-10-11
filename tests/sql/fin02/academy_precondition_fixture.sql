-- CI-ONLY MINIMAL SYNTHETIC ACADEMY PRECONDITION.
-- Used *only* in a disposable Supabase schema replay, not a production migration
-- and NOT a copy of real Academy content. This supplies the required reference
-- entities for the data-remediation migration 20260820180353.
-- Must not be copied into supabase/migrations except inside ephemeral CI.
DO $fixture$
DECLARE
  m uuid;
  mission1 uuid;
  mission6 uuid;
  ids text[] := ARRAY[
    'QUA-ADV-005','QUA-ADV-010',
    'QUA-REC-001','QUA-REC-002','QUA-REC-003','QUA-REC-004',
    'QUA-REC-005','QUA-SCN-024'
  ];
  c text;
BEGIN
  INSERT INTO public.academy_modules (id,title,slug,full_description)
  VALUES ('00000000-0000-4000-8000-000000002015',
          'FIN02 ephemeral Module 5 fixture',
          'module-5-qualification','Fixture only')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO STRICT m FROM public.academy_modules
    WHERE slug='module-5-qualification';

  INSERT INTO public.academy_missions
    (id,module_id,mission_number,title,slug)
  VALUES
    ('00000000-0000-4000-8000-000000002011',m,1,
     'Ephemeral mission 1','mission-1-good-opportunity'),
    ('00000000-0000-4000-8000-000000002016',m,6,
     'Ephemeral mission 6','mission-6-in-partneros'),
    ('00000000-0000-4000-8000-000000002017',m,0,
     'Ephemeral checklist','qualification-checklist'),
    ('00000000-0000-4000-8000-000000002018',m,0,
     'Ephemeral module intro','module-introduction'),
    ('00000000-0000-4000-8000-000000002013',m,3,
     'Ephemeral T-FORM mission','mission-3-t-form'),
    ('00000000-0000-4000-8000-000000002014',m,4,
     'Ephemeral questioning mission','mission-4-better-questions'),
    ('00000000-0000-4000-8000-000000002019',m,5,
     'Ephemeral decision mission','mission-5-decision')
  ON CONFLICT (module_id,slug) DO NOTHING;
  SELECT id INTO STRICT mission1 FROM public.academy_missions
    WHERE module_id=m AND slug='mission-1-good-opportunity';
  SELECT id INTO STRICT mission6 FROM public.academy_missions
    WHERE module_id=m AND slug='mission-6-in-partneros';

  FOREACH c IN ARRAY ids LOOP
    INSERT INTO public.academy_questions
      (module_id,mission_id,question_code,category,difficulty,
       question_type,question_text,correct_answer_json)
    VALUES
      (m,mission1,c,
       CASE WHEN c LIKE 'QUA-ADV%' THEN 'advanced'
            WHEN c LIKE 'QUA-REC%' THEN 'record_review'
            ELSE 'scenario_analysis' END,
       'easy','single_choice','Synthetic fixture: '||c,'{"answer":"A"}'::jsonb)
    ON CONFLICT (question_code) DO NOTHING;
  END LOOP;

  INSERT INTO public.academy_resources(id,module_id,title,resource_type,
   content,is_downloadable)
  VALUES ('81ca8468-8a80-41fb-abde-da40507bf4ff',m,
          'Ephemeral Qualification Checklist','checklist',
          'Synthetic replay precondition; no customer data',false)
  ON CONFLICT (id) DO NOTHING;

  ASSERT (SELECT COUNT(*)=8 FROM public.academy_questions
     WHERE module_id=m AND question_code=ANY(ids)),
    'FIN02 Academy synthetic questions not available';
  ASSERT (SELECT COUNT(*)=1 FROM public.academy_resources
     WHERE module_id=m AND resource_type='checklist'),
    'FIN02 Academy synthetic checklist not available';
END
$fixture$;
