DO $migration$
DECLARE
  v_module_id  uuid;
  v_module_cnt int;
  v_res_id     uuid;
  v_res_cnt    int;
  v_md         text;
  v_new        text;
  v_snippet    text;
  v_checklist  text;
  v_asset      record;
  v_missing    text;
BEGIN
  -- Module resolution (PROD uuid or canonical slug) -------------------------
  SELECT count(*), min(id::text)::uuid INTO v_module_cnt, v_module_id
  FROM public.academy_modules
  WHERE id = '6c260c76-6efa-4e5d-a12f-2900269a78a1'::uuid
     OR slug = 'module-5-qualification';

  IF v_module_cnt <> 1 THEN
    RAISE EXCEPTION 'Module 5 (Qualification) must resolve to exactly one row, found %', v_module_cnt;
  END IF;

  SELECT string_agg(s, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'module-introduction',
    'mission-1-good-opportunity',
    'mission-3-t-form',
    'mission-4-better-questions',
    'mission-5-decision',
    'mission-6-in-partneros',
    'qualification-checklist'
  ]) AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.academy_missions m
    WHERE m.module_id = v_module_id AND m.slug = s
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing Module 5 mission rows: %', v_missing;
  END IF;

  -- 1. Five new visual assets ----------------------------------------------
  FOR v_asset IN
    SELECT * FROM (VALUES
      (
        'qualification-opportunity-scorecard',
        'Qualification Opportunity Scorecard',
        'Six evidence signals that separate a real opportunity from a hopeful one, with the evidence-over-assumptions rule.',
        'Scorecard with six evidence signals: real maintenance pain, named decision-making path, real money, anchored timing, fit with ManWinWin and access to the business. Evidence over assumptions: score a signal only with something the customer said, sent or showed.',
        'Six evidence signals of a good opportunity - evidence over assumptions.',
        ARRAY['qualification','module-5','opportunity','evidence'],
        '/academy-assets/module-5/qualification-opportunity-scorecard.svg'
      ),
      (
        't-form-canvas',
        'T-FORM Qualification Canvas',
        'Four-quadrant canvas - Technical, Financial, Operational and Relationship - with the prompts to complete for each dimension.',
        'Four-quadrant T-FORM canvas. Technical: assets and sites, current system, integrations. Financial: budget owner, order of magnitude, cost of doing nothing. Operational: teams affected, current processes, internal project owner. Relationship: access to the business, trust and responsiveness, champion and detractors.',
        'The T-FORM canvas: Technical, Financial, Operational and Relationship.',
        ARRAY['qualification','module-5','t-form','framework'],
        '/academy-assets/module-5/t-form-canvas.svg'
      ),
      (
        'qualification-conversation-guide',
        'Qualification Conversation Guide',
        'The disciplined questioning loop: open question, probe, evidence, confirm, next step.',
        'Five-step qualification conversation loop: open question, probe, evidence, confirm and next step. If you cannot record the evidence or the next step, the conversation has not qualified anything yet.',
        'Open question to next step: the qualification questioning loop.',
        ARRAY['qualification','module-5','questions','conversation'],
        '/academy-assets/module-5/qualification-conversation-guide.svg'
      ),
      (
        'qualify-nurture-disqualify',
        'Qualify, Nurture or Disqualify',
        'The three legitimate qualification outcomes with concise criteria and the action that follows each one.',
        'Three qualification outcomes. Qualify: Timing, Interest, Money and Decision-making evidenced, T-FORM complete, dated next step - advance and forecast. Nurture: genuine interest but timing or money not yet real - park with a dated follow-up. Disqualify: no problem worth solving, no budget route, unreachable decision makers - close honestly.',
        'Qualify, nurture or disqualify - three legitimate outcomes.',
        ARRAY['qualification','module-5','decision','outcomes'],
        '/academy-assets/module-5/qualify-nurture-disqualify.svg'
      ),
      (
        'partneros-qualification-workflow',
        'Qualification Workflow in PartnerOS',
        'The operational loop in PartnerOS: capture notes, update TIMD, complete the T-FORM, decide the status, create the next task and maintain the forecast.',
        'Six-step PartnerOS qualification workflow: capture notes, update TIMD, complete the T-FORM, decide the status, create the next task, maintain the forecast.',
        'Executing qualification in PartnerOS, step by step.',
        ARRAY['qualification','module-5','partneros','workflow'],
        '/academy-assets/module-5/partneros-qualification-workflow.svg'
      )
    ) AS t(asset_key, title, description, alt_text, caption, tags, url)
  LOOP
    INSERT INTO public.academy_assets (
      asset_key, title, asset_type, category, tags, description, alt_text, caption,
      external_url, mime_type, status, current_version
    )
    VALUES (
      v_asset.asset_key, v_asset.title, 'diagram', 'frameworks', v_asset.tags,
      v_asset.description, v_asset.alt_text, v_asset.caption,
      v_asset.url, 'image/svg+xml', 'published', 1
    )
    ON CONFLICT (asset_key) DO UPDATE SET
      title        = EXCLUDED.title,
      asset_type   = EXCLUDED.asset_type,
      category     = EXCLUDED.category,
      tags         = EXCLUDED.tags,
      description  = EXCLUDED.description,
      alt_text     = EXCLUDED.alt_text,
      caption      = EXCLUDED.caption,
      external_url = EXCLUDED.external_url,
      mime_type    = EXCLUDED.mime_type,
      status       = 'published',
      updated_at   = now()
    WHERE public.academy_assets.title        IS DISTINCT FROM EXCLUDED.title
       OR public.academy_assets.tags         IS DISTINCT FROM EXCLUDED.tags
       OR public.academy_assets.description  IS DISTINCT FROM EXCLUDED.description
       OR public.academy_assets.alt_text     IS DISTINCT FROM EXCLUDED.alt_text
       OR public.academy_assets.caption      IS DISTINCT FROM EXCLUDED.caption
       OR public.academy_assets.external_url IS DISTINCT FROM EXCLUDED.external_url
       OR public.academy_assets.mime_type    IS DISTINCT FROM EXCLUDED.mime_type
       OR public.academy_assets.status       IS DISTINCT FROM 'published';
  END LOOP;

  -- 2. Publish pre-existing Module 5 assets, fix misspelled tag -------------
  UPDATE public.academy_assets
  SET status = 'published', updated_at = now()
  WHERE asset_key IN ('m5-hero-banner-qualification', 'm5-qualification-decision-tree')
    AND status IS DISTINCT FROM 'published';

  UPDATE public.academy_assets
  SET tags = (
        SELECT array_agg(DISTINCT CASE WHEN t = 'quaification' THEN 'qualification' ELSE t END)
        FROM unnest(tags) AS t
      ),
      updated_at = now()
  WHERE asset_key = 'm5-hero-banner-qualification'
    AND 'quaification' = ANY(tags);

  -- 3. Mission embeds -------------------------------------------------------
  SELECT content_markdown INTO v_md
  FROM public.academy_missions
  WHERE module_id = v_module_id AND slug = 'module-introduction';

  v_new := v_md;
  IF v_new IS NOT NULL
     AND v_new LIKE '%id: m5-hero-banner-qualification%'
     AND v_new !~ 'id: m5-hero-banner-qualification[^\n]*\nloading:' THEN
    v_new := regexp_replace(v_new, '(id: m5-hero-banner-qualification[^\n]*\n)', '\1loading: eager' || E'\n');
  END IF;
  IF v_new IS DISTINCT FROM v_md THEN
    UPDATE public.academy_missions
    SET content_markdown = v_new, version = COALESCE(version, 1) + 1, updated_at = now()
    WHERE module_id = v_module_id AND slug = 'module-introduction';
  END IF;

  -- Mission 1: replace the three text placeholders with the scorecard.
  SELECT content_markdown INTO v_md
  FROM public.academy_missions
  WHERE module_id = v_module_id AND slug = 'mission-1-good-opportunity';

  v_new := COALESCE(v_md, '');
  v_new := regexp_replace(v_new, '(?n)^[^\n]*(Hero Graphic|Insert Visual V-004|Insert Visual V-001)[^\n]*\n?', '', 'g');
  v_new := regexp_replace(v_new, E'\n{3,}', E'\n\n', 'g');

  v_snippet := E':::asset\nid: qualification-opportunity-scorecard\nwidth: full\nalign: center\n:::';
  IF v_new NOT LIKE '%id: qualification-opportunity-scorecard%' THEN
    IF v_new ~ '(?n)^#{1,4} ' THEN
      v_new := regexp_replace(v_new, '(?n)^(#{1,4} [^\n]*\n)', '\1' || E'\n' || v_snippet || E'\n');
    ELSE
      v_new := v_snippet || E'\n\n' || v_new;
    END IF;
  END IF;

  IF v_new IS DISTINCT FROM v_md THEN
    UPDATE public.academy_missions
    SET content_markdown = v_new, version = COALESCE(version, 1) + 1, updated_at = now()
    WHERE module_id = v_module_id AND slug = 'mission-1-good-opportunity';
  END IF;

  -- Missions 3, 4 and 6.
  FOR v_asset IN
    SELECT * FROM (VALUES
      ('mission-3-t-form',           't-form-canvas'),
      ('mission-4-better-questions', 'qualification-conversation-guide'),
      ('mission-6-in-partneros',     'partneros-qualification-workflow')
    ) AS t(slug, asset_key)
  LOOP
    SELECT content_markdown INTO v_md
    FROM public.academy_missions
    WHERE module_id = v_module_id AND slug = v_asset.slug;

    v_new := COALESCE(v_md, '');
    v_snippet := E':::asset\nid: ' || v_asset.asset_key || E'\nwidth: full\nalign: center\n:::';

    IF v_new NOT LIKE '%id: ' || v_asset.asset_key || '%' THEN
      IF v_new ~ '(?n)^#{1,4} ' THEN
        v_new := regexp_replace(v_new, '(?n)^(#{1,4} [^\n]*\n)', '\1' || E'\n' || v_snippet || E'\n');
      ELSE
        v_new := v_snippet || E'\n\n' || v_new;
      END IF;
    END IF;

    IF v_new IS DISTINCT FROM v_md THEN
      UPDATE public.academy_missions
      SET content_markdown = v_new, version = COALESCE(version, 1) + 1, updated_at = now()
      WHERE module_id = v_module_id AND slug = v_asset.slug;
    END IF;
  END LOOP;

  -- Mission 5: keep the decision tree, add the outcomes visual.
  SELECT content_markdown INTO v_md
  FROM public.academy_missions
  WHERE module_id = v_module_id AND slug = 'mission-5-decision';

  v_new := COALESCE(v_md, '');
  v_snippet := E':::asset\nid: qualify-nurture-disqualify\nwidth: full\nalign: center\n:::';

  IF v_new NOT LIKE '%id: qualify-nurture-disqualify%' THEN
    IF v_new ~* '(?n)^#{2,4} [^\n]*(outcome|qualify|nurture|disqualify|decision)' THEN
      v_new := regexp_replace(
        v_new,
        '(?n)^(#{2,4} [^\n]*(outcome|qualify|nurture|disqualify|decision)[^\n]*\n)',
        '\1' || E'\n' || v_snippet || E'\n',
        'i'
      );
    ELSE
      v_new := rtrim(v_new, E'\n') || E'\n\n' || v_snippet || E'\n';
    END IF;
  END IF;

  IF v_new IS DISTINCT FROM v_md THEN
    UPDATE public.academy_missions
    SET content_markdown = v_new, version = COALESCE(version, 1) + 1, updated_at = now()
    WHERE module_id = v_module_id AND slug = 'mission-5-decision';
  END IF;

  -- 4. Canonical checklist (Timing / Interest / Money / Decision-making) ----
  v_checklist :=
E'# Qualification Checklist\n\nOptional working document. Use it during and immediately after a qualification conversation. It never blocks your progress through the module - it exists so that a decision is always supported by evidence.\n\n## 1. TIMD evidence\n\n### Timing\n\n:::checklist\n- A date, event or obligation makes acting necessary.\n- The customer can say what happens if nothing changes this year.\n- The expected decision window is known.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Interest\n\n:::checklist\n- A real maintenance problem was described, not a vague curiosity.\n- The customer explained the impact of the problem on operations.\n- Someone in the organisation actively wants it solved.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Money\n\n:::checklist\n- Budget exists or a funding route has been identified.\n- An order of magnitude has been discussed openly.\n- The cost of doing nothing is understood by the customer.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Decision-making\n\n:::checklist\n- The decision maker is named, not assumed.\n- The approval path and any procurement steps are known.\n- Influencers, users and possible detractors are identified.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n## 2. T-FORM coverage\n\n:::checklist\n- Technical: assets, sites, current system and integrations documented.\n- Financial: budget owner, order of magnitude and cost of inaction captured.\n- Operational: affected teams, processes and internal project owner captured.\n- Relationship: quality of access, level of trust and champion captured.\n:::\n\n**Gaps still open:** ________________________________________________\n\n## 3. Decision and next step\n\n:::checklist\n- The outcome is explicit: qualify, nurture or disqualify.\n- The reason for the outcome is written down.\n- A dated next action with a named owner exists in PartnerOS.\n- Pipeline value, stage and dates reflect what the evidence supports.\n:::\n\n**Decision and date:** ______________________________________________\n';

  SELECT content_markdown INTO v_md
  FROM public.academy_missions
  WHERE module_id = v_module_id AND slug = 'qualification-checklist';

  IF v_checklist IS DISTINCT FROM v_md THEN
    UPDATE public.academy_missions
    SET content_markdown = v_checklist, version = COALESCE(version, 1) + 1, updated_at = now()
    WHERE module_id = v_module_id AND slug = 'qualification-checklist';
  END IF;

  SELECT count(*), min(id::text)::uuid INTO v_res_cnt, v_res_id
  FROM public.academy_resources
  WHERE module_id = v_module_id
    AND (lower(resource_type) = 'checklist' OR title ILIKE '%Qualification Checklist%');

  IF v_res_cnt <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one canonical Qualification Checklist resource for Module 5, found %', v_res_cnt;
  END IF;

  UPDATE public.academy_resources
  SET content         = v_checklist,
      title           = 'Qualification Checklist',
      description     = 'Working checklist for TIMD (Timing, Interest, Money, Decision-making), T-FORM coverage and the qualification decision. Read and print from the Academy.',
      resource_type   = 'checklist',
      is_downloadable = false,
      status          = 'published',
      version         = '2',
      updated_at      = now()
  WHERE id = v_res_id
    AND (
      content IS DISTINCT FROM v_checklist
      OR title IS DISTINCT FROM 'Qualification Checklist'
      OR status IS DISTINCT FROM 'published'
      OR is_downloadable IS DISTINCT FROM false
    );

  -- Final assertions --------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.academy_missions
    WHERE module_id = v_module_id
      AND content_markdown ~ '(Hero Graphic|Insert Visual V-00)'
  ) THEN
    RAISE EXCEPTION 'Module 5 still contains placeholder visual references';
  END IF;

  IF (
    SELECT count(*) FROM public.academy_assets
    WHERE asset_key IN (
      'qualification-opportunity-scorecard','t-form-canvas','qualification-conversation-guide',
      'qualify-nurture-disqualify','partneros-qualification-workflow'
    ) AND status = 'published'
  ) <> 5 THEN
    RAISE EXCEPTION 'The five Module 5 visual assets are not all published';
  END IF;
END
$migration$;