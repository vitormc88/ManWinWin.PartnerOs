DO $migration$
DECLARE
  v_module_id  uuid;
  v_module_cnt int;
  v_md         text;
  v_new        text;
  v_fence      text;
  v_head_re    text;
  v_head_cnt   int;
  v_row        record;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO v_module_cnt, v_module_id
  FROM public.academy_modules
  WHERE id = '6c260c76-6efa-4e5d-a12f-2900269a78a1'::uuid
     OR slug = 'module-5-qualification';

  IF v_module_cnt <> 1 THEN
    RAISE EXCEPTION 'Module 5 (Qualification) must resolve to exactly one row, found %', v_module_cnt;
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      ('mission-3-t-form',           'm5-t-form-canvas',                    '# What is the T-FORM?'),
      ('mission-4-better-questions', 'm5-qualification-conversation-guide', '# Learn to Dig Deeper'),
      ('mission-5-decision',         'm5-qualify-nurture-disqualify',       '# The Three Possible Outcomes'),
      ('mission-6-in-partneros',     'm5-partneros-qualification-workflow', '# What Should Be Updated?')
    ) AS t(slug, asset_key, heading)
  LOOP
    SELECT content_markdown INTO v_md
    FROM public.academy_missions
    WHERE module_id = v_module_id AND slug = v_row.slug;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Module 5 mission % is missing', v_row.slug;
    END IF;

    v_md      := COALESCE(v_md, '');
    v_head_re := regexp_replace(v_row.heading, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g');

    SELECT count(*) INTO v_head_cnt
    FROM regexp_matches(v_md, '(?n)^' || v_head_re || '\s*$', 'g');

    IF v_head_cnt > 1 THEN
      RAISE EXCEPTION 'Heading "%" occurs % times in %; refusing to guess placement',
        v_row.heading, v_head_cnt, v_row.slug;
    END IF;

    IF v_head_cnt = 0 THEN
      RAISE NOTICE 'Heading "%" not present in %; leaving % where it is', v_row.heading, v_row.slug, v_row.asset_key;
      CONTINUE;
    END IF;

    v_fence := E':::asset\nid: ' || v_row.asset_key || E'\nwidth: full\nalign: center\n:::';

    v_new := regexp_replace(
      v_md,
      '(?n)^:::asset\s*\n(?:[^\n]*\n)*?id: ' || v_row.asset_key || '\s*\n(?:[^\n]*\n)*?:::\s*(\n|$)',
      '',
      'g'
    );
    v_new := regexp_replace(v_new, E'\n{3,}', E'\n\n', 'g');

    -- Blank line on both sides so the diagram stays its own block.
    v_new := regexp_replace(
      v_new,
      '(?n)^(' || v_head_re || '\s*\n)',
      '\1' || E'\n' || v_fence || E'\n\n'
    );
    v_new := regexp_replace(v_new, E'\n{3,}', E'\n\n', 'g');

    IF v_new IS DISTINCT FROM v_md THEN
      UPDATE public.academy_missions
         SET content_markdown = v_new,
             version          = COALESCE(version, 1) + 1,
             updated_at       = now()
       WHERE module_id = v_module_id AND slug = v_row.slug;
    END IF;

    IF (
      SELECT count(*) FROM regexp_matches(v_new, '(?n)^id: ' || v_row.asset_key || '\s*$', 'g')
    ) <> 1 THEN
      RAISE EXCEPTION 'Asset % must appear exactly once in %', v_row.asset_key, v_row.slug;
    END IF;

    IF v_new !~ ('(?n)^' || v_head_re || '\s*\n\s*\n?:::asset\s*\nid: ' || v_row.asset_key || '\s*$') THEN
      RAISE EXCEPTION 'Asset % is not immediately after "%" in %', v_row.asset_key, v_row.heading, v_row.slug;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.academy_missions
    WHERE module_id = v_module_id
      AND slug = 'mission-5-decision'
      AND content_markdown LIKE '%m5-qualification-decision-tree%'
      AND content_markdown !~ '(?n)\A(?:#[^\n]*\n\s*)?:::asset\s*\nid: m5-qualification-decision-tree\s*$'
  ) THEN
    RAISE EXCEPTION 'Mission 5 decision tree is no longer at the top of the lesson';
  END IF;
END
$migration$;