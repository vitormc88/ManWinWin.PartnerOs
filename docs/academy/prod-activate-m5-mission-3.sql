-- =====================================================================
-- PROD ACTIVATION: Academy Module 5 / Mission 3 -- content_json ONLY
-- Target project: qownzparzsaeoyccgwuj  (partneros.manwinwin.com)
-- Source of truth: docs/academy/module-5-mission-3-first-touch.v2.json
--   file md5: 4ad611ae29a86110c66a156f87d1de59
-- Single transaction. Any guard failure aborts and rolls back everything.
-- No schema migration. Nothing else is read-modified or written.
-- =====================================================================
BEGIN;

DO $guarded$
DECLARE
  v_mission_id    uuid := 'af974549-3ad4-4b56-a869-5e61ae17b70f';
  v_slug          text := 'mission-3-build-a-relevant-first-touch';
  v_rows          int;
  v_md5_before    text;
  v_len_before    int;
  v_md5_after     text;
  v_len_after     int;
  v_title_before  text;
  v_status_before text;
  v_module_id     uuid;
  v_module_slug   text;
  v_payload       jsonb := $mission_json${
  "kind": "academy-learning-experience-v2",
  "version": 1,
  "title": "Build a Relevant First Touch",
  "subtitle": "Module 5 — Outreach & Engagement",
  "intro": {
    "eyebrow": "Mission 3",
    "headline": "Build a Relevant First Touch",
    "description": "A guided mission: decide what earns attention, apply a four-move relevance framework, and build a first touch you can actually use.",
    "bullets": [
      "10 short steps, roughly 20 minutes.",
      "Inline feedback on every decision.",
      "You finish with a saved first-touch draft. Nothing is sent from PartnerOS."
    ],
    "startLabel": "Start mission"
  },
  "audioBrief": {
    "title": "Mission audio brief",
    "duration": "5–6 min",
    "status": "coming-soon"
  },
  "deepDiveTitle": "Full Lesson — Build a Relevant First Touch",
  "steps": [
    {
      "id": "hook",
      "type": "hook",
      "navLabel": "Hook",
      "title": "Why should Daniel care?",
      "scenario": "Atlas Foods is expanding production. Daniel leads operations. He has probably seen dozens of software messages. What would make this one worth his time?",
      "video": { "duration": "01:18", "label": "The first-touch test" },
      "insight": "A first touch earns attention when it makes the next conversation feel relevant before it tries to make the product impressive."
    },
    {
      "id": "challenge",
      "type": "challenge",
      "navLabel": "Challenge",
      "title": "Which opening earns the next 20 seconds?",
      "options": [
        {
          "id": "a",
          "label": "A",
          "text": "ManWinWin is a leading CMMS platform with powerful features for maintenance teams.",
          "feedback": "Credible product information, but it starts with us and asks Daniel to do the relevance work."
        },
        {
          "id": "b",
          "label": "B",
          "text": "Daniel — expanding production usually puts extra pressure on uptime, planning and spare-parts coordination. Is that one of the operational priorities at Atlas Foods this quarter?",
          "correct": true,
          "feedback": "It starts with Daniel's context, connects it to a credible operational issue, and asks a proportionate question. It creates a reason to continue without pretending to know more than the evidence supports."
        },
        {
          "id": "c",
          "label": "C",
          "text": "I noticed Atlas Foods is growing and thought ManWinWin could be a great fit. Can I show you a demo?",
          "feedback": "It uses a signal, but jumps from growth to product fit and a demo too quickly."
        }
      ]
    },
    {
      "id": "start-with-them",
      "type": "learn",
      "navLabel": "Start With Them",
      "title": "Start with them",
      "body": "The buyer should recognize their world before they are asked to understand ours.",
      "bullets": [
        "Lead with a verified signal.",
        "Translate it into a plausible operational implication.",
        "Keep assumptions explicit and proportionate.",
        "Make the first sentence useful even if they never reply."
      ]
    },
    {
      "id": "framework",
      "type": "interactive-framework",
      "navLabel": "Framework",
      "title": "Build relevance in four moves",
      "items": [
        { "id": "context", "title": "Context", "question": "What verified signal makes this timely?" },
        { "id": "relevance", "title": "Relevance", "question": "What plausible maintenance or operational implication could matter?" },
        { "id": "credibility", "title": "Credibility", "question": "Why is ManWinWin or the partner relevant to this conversation?" },
        { "id": "next-step", "title": "Next Step", "question": "What small, useful action is proportionate now?" }
      ]
    },
    {
      "id": "evidence",
      "type": "knowledge-check",
      "navLabel": "Evidence",
      "title": "Evidence before assumption",
      "prompt": "Atlas Foods has announced a new production line. Which sentence goes beyond the evidence?",
      "options": [
        { "id": "a", "label": "A", "text": "A new line may increase coordination demands across maintenance and operations." },
        { "id": "b", "label": "B", "text": "The expansion could make planning, asset data and spare-parts visibility more important." },
        { "id": "c", "label": "C", "text": "Atlas Foods is currently losing 14 hours of production every month because its CMMS is outdated.", "correct": true },
        { "id": "d", "label": "D", "text": "It may be useful to understand how the maintenance team is preparing for the additional asset load." }
      ],
      "correctFeedback": "Correct. The 14-hour loss and outdated-CMMS claim are unsupported. Relevant outreach can interpret a verified signal, but it cannot invent operational facts.",
      "incorrectFeedback": "Not quite. Look for the sentence that turns a plausible implication into a specific, unverified fact."
    },
    {
      "id": "business-relevance",
      "type": "scenario",
      "navLabel": "Business Relevance",
      "title": "Turn context into business relevance",
      "prompt": "Choose the best first-touch sentence for Daniel.",
      "options": [
        {
          "id": "a",
          "label": "Brochure",
          "text": "ManWinWin includes preventive maintenance, inventory, work orders and reporting.",
          "feedback": "This is a brochure. It is accurate, but it starts with the product instead of Daniel's situation."
        },
        {
          "id": "b",
          "label": "Mind Reader",
          "text": "Your maintenance team is struggling to control downtime during the expansion.",
          "feedback": "This assumes a problem the evidence does not support. Assumption presented as fact damages credibility."
        },
        {
          "id": "c",
          "label": "Creepy",
          "text": "I saw your LinkedIn post at 08:42 and noticed three Atlas Foods employees viewed our page.",
          "feedback": "Surveillance detail feels invasive. Relevance is about their business context, not their digital footprint."
        },
        {
          "id": "d",
          "label": "Relevant",
          "text": "Daniel — with Atlas Foods adding a new production line, maintenance planning and asset readiness may become more important. How are you preparing for that operationally?",
          "correct": true,
          "feedback": "This is relevant, not invasive or assumptive. It uses a verified public signal, offers a plausible implication rather than an invented fact, and asks a proportionate question Daniel can easily answer."
        }
      ],
      "reasoningPrompt": "Why does this option work? Select every reason that applies.",
      "reasoningOptions": [
        { "id": "r1", "text": "It starts with a verified business signal.", "correct": true },
        { "id": "r2", "text": "It connects the signal to a plausible operational implication.", "correct": true },
        { "id": "r3", "text": "It proves ManWinWin is the best CMMS." },
        { "id": "r4", "text": "It asks for a small, relevant next step.", "correct": true },
        { "id": "r5", "text": "It creates urgency by assuming a problem." }
      ],
      "reasoningFeedback": "Option D works because it is relevant — grounded in a verified signal, plausible rather than assumptive, and proportionate in what it asks. It never claims to know Daniel's problems and never relies on invasive detail."
    },
    {
      "id": "next-step",
      "type": "knowledge-check",
      "navLabel": "Proportionate Next Step",
      "title": "Ask for the smallest useful next step",
      "prompt": "Which next step creates the least friction while still moving the conversation forward?",
      "options": [
        { "id": "a", "label": "A", "text": "Can you send your full asset register so I can prepare a proposal?" },
        { "id": "b", "label": "B", "text": "Can we book a 60-minute demo with operations, maintenance and IT?" },
        { "id": "c", "label": "C", "text": "Would a 15-minute exchange on how you are preparing maintenance for the new line be useful?", "correct": true },
        { "id": "d", "label": "D", "text": "Should I send pricing today?" }
      ],
      "correctFeedback": "Exactly. It is specific, relevant and easy to accept or decline.",
      "incorrectFeedback": "The best first step should reduce commitment, not accelerate the buying process before relevance is established."
    },
    {
      "id": "ai-moment",
      "type": "ai-moment",
      "navLabel": "AI Moment",
      "title": "Use AI without outsourcing judgement",
      "prompt": "Draft a concise first-touch message for Daniel at Atlas Foods using only the verified expansion signal and the four-move framework. Clearly label any assumption.",
      "rule": "AI drafts. Evidence anchors. Human approves.",
      "noteLabel": "Your draft",
      "notePlaceholder": "Write or paste your first-touch draft here…",
      "saveLabel": "Save draft"
    },
    {
      "id": "takeaway",
      "type": "takeaway",
      "navLabel": "Mission Takeaway",
      "title": "Mission Takeaway",
      "quote": "The first touch sells the conversation. Not the product.",
      "bullets": [
        "Relevance starts with the buyer's context.",
        "Evidence protects credibility.",
        "Business value should be plausible, not invented.",
        "The next step should be proportionate."
      ],
      "noteLabel": "Your personal takeaway",
      "notePlaceholder": "What will you change in your next first touch?",
      "saveLabel": "Save takeaway"
    },
    {
      "id": "apply",
      "type": "apply",
      "navLabel": "Apply",
      "title": "Build your first touch",
      "intro": "Choose one real account. Build a first touch you can review, improve and use later. Nothing is sent from PartnerOS.",
      "requireAccountName": true,
      "accountLabel": "Account name",
      "fields": [
        { "id": "context", "label": "Context", "placeholder": "What verified signal makes this timely?" },
        { "id": "relevance", "label": "Relevance", "placeholder": "What plausible operational implication could matter?" },
        { "id": "credibility", "label": "Credibility", "placeholder": "Why are you relevant to this conversation?" },
        { "id": "next_step", "label": "Next Step", "placeholder": "What small action are you asking for?" }
      ],
      "saveLabel": "Save first-touch draft"
    }
  ]
}$mission_json$::jsonb;
  v_steps         int;
  v_kind          text;
  v_navs          text[];
  v_ids           text[];
BEGIN
  -- Guard 1: exactly one row matching BOTH the uuid and the slug
  SELECT count(*) INTO v_rows
  FROM public.academy_missions
  WHERE id = v_mission_id AND slug = v_slug;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD 1 FAILED: expected exactly 1 mission for id+slug, found %', v_rows;
  END IF;

  -- Pre-state snapshot
  SELECT md5(content_markdown), length(content_markdown), title, status, module_id
    INTO v_md5_before, v_len_before, v_title_before, v_status_before, v_module_id
  FROM public.academy_missions
  WHERE id = v_mission_id AND slug = v_slug;

  RAISE NOTICE 'BEFORE  markdown_md5=% markdown_len=% title=% status=%',
    v_md5_before, v_len_before, v_title_before, v_status_before;

  -- Guard 2: mission must be published
  IF v_status_before IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'GUARD 2 FAILED: status is %, expected published', v_status_before;
  END IF;

  -- Guard 3: must belong to Module 5
  SELECT slug INTO v_module_slug FROM public.academy_modules WHERE id = v_module_id;
  IF v_module_slug IS NULL OR v_module_slug NOT LIKE 'module-5-%' THEN
    RAISE EXCEPTION 'GUARD 3 FAILED: parent module slug is %, expected module-5-*',
      coalesce(v_module_slug, '<null>');
  END IF;
  RAISE NOTICE 'MODULE  id=% slug=%', v_module_id, v_module_slug;

  -- Guard 4: validate the payload shape BEFORE writing
  IF v_payload->>'kind' <> 'academy-learning-experience-v2' THEN
    RAISE EXCEPTION 'GUARD 4 FAILED: payload kind is %', v_payload->>'kind';
  END IF;
  IF jsonb_array_length(v_payload->'steps') <> 10 THEN
    RAISE EXCEPTION 'GUARD 4 FAILED: payload has % steps, expected 10',
      jsonb_array_length(v_payload->'steps');
  END IF;

  -- The one and only write
  UPDATE public.academy_missions
     SET content_json = v_payload
   WHERE id = v_mission_id AND slug = v_slug;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD 5 FAILED: update touched % rows, expected 1', v_rows;
  END IF;

  -- Post-state read-back
  SELECT md5(content_markdown), length(content_markdown),
         content_json->>'kind',
         jsonb_array_length(content_json->'steps'),
         ARRAY(SELECT jsonb_array_elements(content_json->'steps')->>'navLabel'),
         ARRAY(SELECT jsonb_array_elements(content_json->'steps')->>'id')
    INTO v_md5_after, v_len_after, v_kind, v_steps, v_navs, v_ids
  FROM public.academy_missions
  WHERE id = v_mission_id AND slug = v_slug;

  RAISE NOTICE 'AFTER   markdown_md5=% markdown_len=%', v_md5_after, v_len_after;

  -- Guard 6: content_markdown must be byte-for-byte unchanged
  IF v_md5_after IS DISTINCT FROM v_md5_before
     OR v_len_after IS DISTINCT FROM v_len_before THEN
    RAISE EXCEPTION 'GUARD 6 FAILED: content_markdown changed (%/% -> %/%)',
      v_md5_before, v_len_before, v_md5_after, v_len_after;
  END IF;

  -- Guard 7: stored JSON must be the validated experience, in exact order
  IF v_kind <> 'academy-learning-experience-v2' THEN
    RAISE EXCEPTION 'GUARD 7 FAILED: stored kind is %', v_kind;
  END IF;
  IF v_steps <> 10 THEN
    RAISE EXCEPTION 'GUARD 7 FAILED: stored step count is %', v_steps;
  END IF;
  IF v_navs <> ARRAY['Hook', 'Challenge', 'Start With Them', 'Framework', 'Evidence', 'Business Relevance', 'Proportionate Next Step', 'AI Moment', 'Mission Takeaway', 'Apply']::text[] THEN
    RAISE EXCEPTION 'GUARD 7 FAILED: step order is %', v_navs::text;
  END IF;
  IF v_ids <> ARRAY['hook', 'challenge', 'start-with-them', 'framework', 'evidence', 'business-relevance', 'next-step', 'ai-moment', 'takeaway', 'apply']::text[] THEN
    RAISE EXCEPTION 'GUARD 7 FAILED: step ids are %', v_ids::text;
  END IF;

  RAISE NOTICE 'OK      kind=% steps=% order=%', v_kind, v_steps, v_navs::text;
END
$guarded$;

COMMIT;

-- Post-commit evidence (read-only)
SELECT id,
       slug,
       status,
       md5(content_markdown)                     AS markdown_md5,
       length(content_markdown)                  AS markdown_len,
       content_json->>'kind'                     AS kind,
       jsonb_array_length(content_json->'steps') AS steps,
       ARRAY(SELECT jsonb_array_elements(content_json->'steps')->>'navLabel') AS step_order
FROM public.academy_missions
WHERE id = 'af974549-3ad4-4b56-a869-5e61ae17b70f'
  AND slug = 'mission-3-build-a-relevant-first-touch';
