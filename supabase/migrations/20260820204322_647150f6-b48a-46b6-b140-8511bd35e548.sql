DO $migration$
DECLARE
  v_module_id   uuid;
  v_module_cnt  int;
  v_res_id      uuid;
  v_res_cnt     int;
  v_canon_res   uuid := '81ca8468-8a80-41fb-abde-da40507bf4ff'::uuid;
  v_md          text;
  v_new         text;
  v_snippet     text;
  v_checklist   text;
  v_row         record;
  v_missing     text;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO v_module_cnt, v_module_id
  FROM public.academy_modules
  WHERE id = '6c260c76-6efa-4e5d-a12f-2900269a78a1'::uuid
     OR slug = 'module-5-qualification';

  IF v_module_cnt <> 1 THEN
    RAISE EXCEPTION 'Module 5 (Qualification) must resolve to exactly one row, found %', v_module_cnt;
  END IF;

  SELECT string_agg(s, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'module-introduction','mission-1-good-opportunity','mission-3-t-form',
    'mission-4-better-questions','mission-5-decision','mission-6-in-partneros',
    'qualification-checklist'
  ]) AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.academy_missions m WHERE m.module_id = v_module_id AND m.slug = s
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing Module 5 mission rows: %', v_missing;
  END IF;

  -- 1. Canonical m5-* asset keys -------------------------------------------
  FOR v_row IN
    SELECT * FROM (VALUES
      (
        'm5-qualification-opportunity-scorecard',
        'Qualification Opportunity Scorecard',
        'Six evidence signals that separate a real opportunity from a hopeful one, with the evidence-over-assumptions rule.',
        'Scorecard with six evidence signals: real maintenance pain, named decision-making path, real money, anchored timing, fit with ManWinWin and access to the business. Evidence over assumptions: score a signal only with something the customer said, sent or showed.',
        'Six evidence signals of a good opportunity - evidence over assumptions.',
        ARRAY['qualification','module-5','opportunity','evidence'],
        '/academy-assets/module-5/qualification-opportunity-scorecard.svg'
      ),
      (
        'm5-t-form-canvas',
        'T-FORM Qualification Canvas',
        'Four-quadrant canvas - Technical, Financial, Operational and Relationship - with the prompts to complete for each dimension.',
        'Four-quadrant T-FORM canvas. Technical: assets and sites, current system, integrations. Financial: budget owner, order of magnitude, cost of doing nothing. Operational: teams affected, current processes, internal project owner. Relationship: access to the business, trust and responsiveness, champion and detractors.',
        'The T-FORM canvas: Technical, Financial, Operational and Relationship.',
        ARRAY['qualification','module-5','t-form','framework'],
        '/academy-assets/module-5/t-form-canvas.svg'
      ),
      (
        'm5-qualification-conversation-guide',
        'Qualification Conversation Guide',
        'The disciplined questioning loop: open question, probe, evidence, confirm, next step.',
        'Five-step qualification conversation loop: open question, probe, evidence, confirm and next step. If you cannot record the evidence or the next step, the conversation has not qualified anything yet.',
        'Open question to next step: the qualification questioning loop.',
        ARRAY['qualification','module-5','questions','conversation'],
        '/academy-assets/module-5/qualification-conversation-guide.svg'
      ),
      (
        'm5-qualify-nurture-disqualify',
        'Qualify, Nurture or Disqualify',
        'The three legitimate qualification outcomes with concise criteria and the action that follows each one.',
        'Three qualification outcomes. Qualify: Timing, Interest, Money and Decision-making evidenced, T-FORM complete, dated next step - advance and forecast. Nurture: genuine interest but timing or money not yet real - park with a dated follow-up. Disqualify: no problem worth solving, no budget route, unreachable decision makers - close honestly.',
        'Qualify, nurture or disqualify - three legitimate outcomes.',
        ARRAY['qualification','module-5','decision','outcomes'],
        '/academy-assets/module-5/qualify-nurture-disqualify.svg'
      ),
      (
        'm5-partneros-qualification-workflow',
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
      v_row.asset_key, v_row.title, 'diagram', 'frameworks', v_row.tags,
      v_row.description, v_row.alt_text, v_row.caption,
      v_row.url, 'image/svg+xml', 'published', 1
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

  -- 2. Point existing content at the prefixed keys --------------------------
  FOR v_row IN
    SELECT * FROM (VALUES
      ('qualification-opportunity-scorecard'),
      ('t-form-canvas'),
      ('qualification-conversation-guide'),
      ('qualify-nurture-disqualify'),
      ('partneros-qualification-workflow')
    ) AS t(old_key)
  LOOP
    UPDATE public.academy_missions
       SET content_markdown = regexp_replace(
             content_markdown,
             '(?n)^id: ' || v_row.old_key || '\s*$',
             'id: m5-' || v_row.old_key,
             'g'
           ),
           updated_at = now()
     WHERE module_id = v_module_id
       AND content_markdown ~ ('(?n)^id: ' || v_row.old_key || '\s*$');
  END LOOP;

  -- The unprefixed rows only ever existed in the Lovable test database.
  DELETE FROM public.academy_assets
   WHERE asset_key IN (
     'qualification-opportunity-scorecard','t-form-canvas','qualification-conversation-guide',
     'qualify-nurture-disqualify','partneros-qualification-workflow'
   )
     AND external_url LIKE '/academy-assets/module-5/%';

  -- 3. Section-aware placement ---------------------------------------------
  -- Mission 1: exactly one scorecard, replacing the placeholder lines.
  SELECT content_markdown INTO v_md
  FROM public.academy_missions
  WHERE module_id = v_module_id AND slug = 'mission-1-good-opportunity';

  v_new := COALESCE(v_md, '');
  v_new := regexp_replace(v_new, '(?n)^[^\n]*(Hero Graphic|Insert Visual V-004|Insert Visual V-001)[^\n]*\n?', '', 'g');
  v_new := regexp_replace(v_new, E'\n{3,}', E'\n\n', 'g');
  v_snippet := E':::asset\nid: m5-qualification-opportunity-scorecard\nwidth: full\nalign: center\n:::';
  IF v_new NOT LIKE '%id: m5-qualification-opportunity-scorecard%' THEN
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

  -- Missions 3, 4, 5 and 6: anchor on the matching section heading, and only
  -- fall back to the lesson opening when no such section exists.
  FOR v_row IN
    SELECT * FROM (VALUES
      ('mission-3-t-form',           'm5-t-form-canvas',                    't-form|t form|canvas|four dimensions'),
      ('mission-4-better-questions', 'm5-qualification-conversation-guide', 'question|conversation|asking|probe|dialogue'),
      ('mission-5-decision',         'm5-qualify-nurture-disqualify',       'outcome|qualify|nurture|disqualify|decision'),
      ('mission-6-in-partneros',     'm5-partneros-qualification-workflow', 'partneros|workflow|process|crm|execute|executing')
    ) AS t(slug, asset_key, section_pattern)
  LOOP
    SELECT content_markdown INTO v_md
    FROM public.academy_missions
    WHERE module_id = v_module_id AND slug = v_row.slug;

    v_new := COALESCE(v_md, '');
    v_snippet := E':::asset\nid: ' || v_row.asset_key || E'\nwidth: full\nalign: center\n:::';

    IF position('id: ' || v_row.asset_key in v_new) = 0 THEN
      IF v_new ~* ('(?n)^#{2,4} [^\n]*(' || v_row.section_pattern || ')') THEN
        v_new := regexp_replace(
          v_new,
          '(?n)^(#{2,4} [^\n]*(' || v_row.section_pattern || ')[^\n]*\n)',
          '\1' || E'\n' || v_snippet || E'\n',
          'i'
        );
      ELSIF v_new ~ '(?n)^#{1,4} ' THEN
        v_new := regexp_replace(v_new, '(?n)^(#{1,4} [^\n]*\n)', '\1' || E'\n' || v_snippet || E'\n');
      ELSE
        v_new := v_snippet || E'\n\n' || v_new;
      END IF;
    END IF;

    IF v_new IS DISTINCT FROM v_md THEN
      UPDATE public.academy_missions
         SET content_markdown = v_new, version = COALESCE(version, 1) + 1, updated_at = now()
       WHERE module_id = v_module_id AND slug = v_row.slug;
    END IF;
  END LOOP;

  -- 4. Comprehensive canonical checklist ------------------------------------
  v_checklist :=
E'# Qualification Checklist\n\nOptional working document - it never blocks progress through the module. Run it during and immediately after every qualification interaction, and review it again before you change the pipeline stage.\n\n**Evidence rule:** only tick an item when you can point to something the customer said, wrote, sent or showed. An assumption is not evidence.\n\n## 1. Business Need\n\n:::checklist\n- A concrete maintenance problem was described, with examples.\n- The operational impact is understood (downtime, cost, compliance, safety, reporting).\n- The customer explained what happens if nothing changes.\n- The need is owned by a person, not by "the company".\n- ManWinWin is a genuine fit for the need, not a stretch.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n## 2. TIMD\n\n### Timing\n\n:::checklist\n- A date, event, audit, contract or obligation makes acting necessary.\n- The expected decision window is known and realistic.\n- Internal milestones (budget cycle, go-live target) are documented.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Interest\n\n:::checklist\n- Someone actively wants the problem solved, not just information.\n- The customer invested time: meetings, data, site visit, demo attendance.\n- Questions asked show intent to change, not curiosity.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Money\n\n:::checklist\n- Budget exists, or a credible funding route has been identified.\n- An order of magnitude has been discussed openly.\n- The cost of doing nothing is understood by the customer.\n- Purchasing model (SaaS or on-premise) matches how they can buy.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Decision-making\n\n:::checklist\n- The decision maker is named, not assumed.\n- The approval path and procurement steps are known.\n- Influencers, end users and possible detractors are identified.\n- You know who signs and what they need in order to sign.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n## 3. T-FORM Coverage\n\n### Technical\n\n:::checklist\n- Assets, equipment volume and number of sites are known.\n- Current system or method documented (paper, spreadsheet, legacy CMMS).\n- Integration needs identified (ERP, IoT, SCADA, access control).\n- Users, mobility needs and languages are known.\n- Data migration expectations discussed.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Financial\n\n:::checklist\n- Budget owner identified.\n- Order of magnitude and budget range aligned.\n- Cost of inaction quantified or at least described.\n- Expected return, savings or compliance benefit articulated.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Operational\n\n:::checklist\n- Teams and departments affected are mapped.\n- Current maintenance processes and routines described.\n- Internal project owner identified.\n- Training, rollout and change-management expectations discussed.\n- Realistic implementation timeline agreed.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n### Relationship\n\n:::checklist\n- You have access to the business, not only to IT or procurement.\n- Responsiveness and trust level assessed honestly.\n- A champion exists and can explain the value internally.\n- Detractors, incumbents and competing initiatives are known.\n:::\n\n**Evidence / notes:** ______________________________________________\n\n## 4. Opportunity Health\n\n:::checklist\n- TIMD has no unknown dimension left unaddressed.\n- The T-FORM has no empty quadrant.\n- The value described is the customer''s, not the product''s.\n- Expected value and stage reflect the evidence, not optimism.\n- Risks and open questions are written down.\n- A dated next step exists and the customer agreed to it.\n:::\n\n**Main risk right now:** ____________________________________________\n\n## 5. CRM Checklist (PartnerOS)\n\n:::checklist\n- Interaction notes recorded on the opportunity.\n- TIMD fields updated after the conversation.\n- T-FORM information captured or attached.\n- Stage and probability reflect the real situation.\n- Expected value and expected close date updated.\n- Next task created with a date and an owner.\n- Contacts and roles kept current.\n:::\n\n## 6. Final Decision\n\n:::checklist\n- The outcome is explicit: qualify, nurture or disqualify.\n- The reason for the outcome is written down.\n- Qualify: advance the stage and keep the forecast honest.\n- Nurture: park with a dated follow-up and a re-entry trigger.\n- Disqualify: close honestly and record why, so the effort is not repeated.\n:::\n\n**Decision, reason and date:** ______________________________________\n\n## 7. After Every Interaction\n\nReview this checklist immediately after each meeting or call, while the detail\nis fresh. Qualification is continuous: what was true last month may not be true\ntoday, and an opportunity can move between qualify, nurture and disqualify more\nthan once.\n';

  SELECT content_markdown INTO v_md
  FROM public.academy_missions
  WHERE module_id = v_module_id AND slug = 'qualification-checklist';

  IF v_checklist IS DISTINCT FROM v_md THEN
    UPDATE public.academy_missions
       SET content_markdown = v_checklist, version = COALESCE(version, 1) + 1, updated_at = now()
     WHERE module_id = v_module_id AND slug = 'qualification-checklist';
  END IF;

  -- Exactly one checklist resource, and it must be the canonical row --------
  SELECT count(*), min(id::text)::uuid INTO v_res_cnt, v_res_id
  FROM public.academy_resources
  WHERE module_id = v_module_id AND resource_type = 'checklist';

  IF v_res_cnt <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Module 5 checklist resource, found %', v_res_cnt;
  END IF;

  -- The Lovable test database created its checklist through an old fallback
  -- insert, so it carries a different id. Converge on the canonical id there;
  -- in production this is already a no-op.
  IF v_res_id <> v_canon_res THEN
    IF EXISTS (SELECT 1 FROM public.academy_resources WHERE id = v_canon_res) THEN
      RAISE EXCEPTION 'Canonical checklist id % exists outside Module 5; refusing to touch another row', v_canon_res;
    END IF;
    UPDATE public.academy_resources SET id = v_canon_res WHERE id = v_res_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academy_resources WHERE id = v_canon_res AND module_id = v_module_id
  ) THEN
    RAISE EXCEPTION 'Checklist resource % is missing or does not belong to Module 5', v_canon_res;
  END IF;

  UPDATE public.academy_resources
     SET content         = v_checklist,
         title           = 'Qualification Checklist',
         description     = 'Field checklist for the whole qualification cycle: business need, TIMD (Timing, Interest, Money, Decision-making), full T-FORM coverage, opportunity health, PartnerOS hygiene and the explicit final decision. Read and print from the Academy.',
         resource_type   = 'checklist',
         is_downloadable = false,
         status          = 'published',
         version         = '2.0',
         updated_at      = now()
   WHERE id = v_canon_res
     AND (
       content IS DISTINCT FROM v_checklist
       OR title IS DISTINCT FROM 'Qualification Checklist'
       OR status IS DISTINCT FROM 'published'
       OR version IS DISTINCT FROM '2.0'
       OR is_downloadable IS DISTINCT FROM false
     );

  -- 5. Post-conditions ------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.academy_missions
    WHERE module_id = v_module_id AND content_markdown ~ '(Hero Graphic|Insert Visual V-00)'
  ) THEN
    RAISE EXCEPTION 'Module 5 still contains placeholder visual references';
  END IF;

  IF (
    SELECT count(*) FROM public.academy_assets
    WHERE asset_key IN (
      'm5-qualification-opportunity-scorecard','m5-t-form-canvas','m5-qualification-conversation-guide',
      'm5-qualify-nurture-disqualify','m5-partneros-qualification-workflow'
    ) AND status = 'published'
  ) <> 5 THEN
    RAISE EXCEPTION 'The five m5-* Module 5 visual assets are not all published';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.academy_assets
    WHERE asset_key IN (
      'qualification-opportunity-scorecard','t-form-canvas','qualification-conversation-guide',
      'qualify-nurture-disqualify','partneros-qualification-workflow'
    )
  ) THEN
    RAISE EXCEPTION 'Unprefixed Module 5 asset rows still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.academy_missions
    WHERE module_id = v_module_id
      AND content_markdown ~ '(?n)^id: (qualification-opportunity-scorecard|t-form-canvas|qualification-conversation-guide|qualify-nurture-disqualify|partneros-qualification-workflow)\s*$'
  ) THEN
    RAISE EXCEPTION 'Module 5 content still references unprefixed asset keys';
  END IF;
END
$migration$;