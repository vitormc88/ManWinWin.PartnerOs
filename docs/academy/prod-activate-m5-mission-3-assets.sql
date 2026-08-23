-- =====================================================================
-- PROD — Module 5 / Mission 3 "Build a Relevant First Touch"
-- Add media asset references to content_json ONLY.
--
-- DO NOT RUN YET. This script is prepared for a separate, explicit PROD
-- release once the final media assets exist in the Asset Library.
--
-- Scope guarantees:
--   * touches exactly ONE row: academy_missions.id = af974549-...
--   * writes exactly ONE column: content_json
--   * content_markdown, status, slug, module_id, progress, attempts,
--     certification data and every other mission are untouched
--   * asserts the markdown MD5 is byte-for-byte identical before/after
--   * single transaction, aborts on ANY guard failure
--
-- Placeholders remain visible in the player until the three assets below
-- exist AND are published — the renderer resolves published assets only.
--
--   academy.m5m3.video-hook    (video, Hook step)
--   academy.m5m3.audio-brief   (audio, Mission tools)
--   academy.m5m3.takeaway      (image, Takeaway step)
--
-- Rollback: re-run the same script with the assetKey lines removed, or
-- restore content_json from the snapshot printed in the NOTICE below.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_mission_id  uuid := 'af974549-3ad4-4b56-a869-5e61ae17b70f';
  v_slug        text := 'mission-3-build-a-relevant-first-touch';
  v_md5_before  text;
  v_md5_after   text;
  v_json_before jsonb;
  v_json_after  jsonb;
  v_kind        text;
  v_steps       int;
  v_rows        int;
  v_hook_idx    int;
  v_takeaway_idx int;
BEGIN
  -- ── Guard 1: the exact mission exists, with the exact slug ──────────
  SELECT md5(coalesce(content_markdown, '')), content_json
    INTO v_md5_before, v_json_before
  FROM public.academy_missions
  WHERE id = v_mission_id AND slug = v_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guard 1 failed: mission % with slug % not found', v_mission_id, v_slug;
  END IF;

  RAISE NOTICE 'content_json snapshot (rollback source): %', v_json_before;

  -- ── Guard 2: the v2 experience is already active with 10 steps ──────
  v_kind  := v_json_before ->> 'kind';
  v_steps := jsonb_array_length(coalesce(v_json_before -> 'steps', '[]'::jsonb));

  IF v_kind IS DISTINCT FROM 'academy-learning-experience-v2' THEN
    RAISE EXCEPTION 'Guard 2 failed: content_json.kind is % (expected academy-learning-experience-v2)', v_kind;
  END IF;
  IF v_steps <> 10 THEN
    RAISE EXCEPTION 'Guard 2 failed: expected 10 steps, found %', v_steps;
  END IF;

  -- ── Guard 3: locate the hook and takeaway steps by type ─────────────
  SELECT ord - 1 INTO v_hook_idx
  FROM jsonb_array_elements(v_json_before -> 'steps') WITH ORDINALITY AS s(elem, ord)
  WHERE s.elem ->> 'type' = 'hook'
  ORDER BY ord LIMIT 1;

  SELECT ord - 1 INTO v_takeaway_idx
  FROM jsonb_array_elements(v_json_before -> 'steps') WITH ORDINALITY AS s(elem, ord)
  WHERE s.elem ->> 'type' = 'takeaway'
  ORDER BY ord LIMIT 1;

  IF v_hook_idx IS NULL THEN
    RAISE EXCEPTION 'Guard 3 failed: no hook step found';
  END IF;
  IF v_takeaway_idx IS NULL THEN
    RAISE EXCEPTION 'Guard 3 failed: no takeaway step found';
  END IF;
  IF (v_json_before -> 'steps' -> v_hook_idx -> 'video') IS NULL THEN
    RAISE EXCEPTION 'Guard 3 failed: hook step has no video block to extend';
  END IF;

  -- ── Mutation: add ONLY the stable asset key references ──────────────
  v_json_after := v_json_before;

  -- Hook video
  v_json_after := jsonb_set(
    v_json_after,
    ARRAY['steps', v_hook_idx::text, 'video', 'assetKey'],
    '"academy.m5m3.video-hook"'::jsonb,
    true
  );

  -- Takeaway image
  v_json_after := jsonb_set(
    v_json_after,
    ARRAY['steps', v_takeaway_idx::text, 'assetKey'],
    '"academy.m5m3.takeaway"'::jsonb,
    true
  );

  -- Audio brief (create the container only if the authored block exists)
  IF (v_json_after -> 'audioBrief') IS NULL THEN
    RAISE EXCEPTION 'Guard 4 failed: audioBrief block missing from content_json';
  END IF;
  v_json_after := jsonb_set(
    v_json_after,
    ARRAY['audioBrief', 'assetKey'],
    '"academy.m5m3.audio-brief"'::jsonb,
    true
  );

  -- ── Guard 5: nothing but the three keys changed ─────────────────────
  IF (v_json_after #- ARRAY['steps', v_hook_idx::text, 'video', 'assetKey']
                   #- ARRAY['steps', v_takeaway_idx::text, 'assetKey']
                   #- ARRAY['audioBrief', 'assetKey'])
     IS DISTINCT FROM
     (v_json_before #- ARRAY['steps', v_hook_idx::text, 'video', 'assetKey']
                    #- ARRAY['steps', v_takeaway_idx::text, 'assetKey']
                    #- ARRAY['audioBrief', 'assetKey'])
  THEN
    RAISE EXCEPTION 'Guard 5 failed: unexpected difference outside the three asset keys';
  END IF;

  -- ── Write ───────────────────────────────────────────────────────────
  UPDATE public.academy_missions
     SET content_json = v_json_after
   WHERE id = v_mission_id AND slug = v_slug;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Guard 6 failed: % rows updated (expected exactly 1)', v_rows;
  END IF;

  -- ── Guard 7: markdown integrity, byte-for-byte ──────────────────────
  SELECT md5(coalesce(content_markdown, '')) INTO v_md5_after
  FROM public.academy_missions WHERE id = v_mission_id;

  IF v_md5_after IS DISTINCT FROM v_md5_before THEN
    RAISE EXCEPTION 'Guard 7 failed: content_markdown changed (% -> %)', v_md5_before, v_md5_after;
  END IF;

  RAISE NOTICE 'OK: asset keys added. markdown md5 unchanged (%). hook step #%, takeaway step #%.',
    v_md5_after, v_hook_idx, v_takeaway_idx;
END;
$$;

-- Review the NOTICEs above, then COMMIT (or ROLLBACK to abort).
COMMIT;

-- Post-run verification (read-only):
-- SELECT content_json -> 'audioBrief' ->> 'assetKey' AS audio_key,
--        jsonb_path_query_first(content_json, '$.steps[*].video.assetKey') AS video_key
-- FROM public.academy_missions
-- WHERE id = 'af974549-3ad4-4b56-a869-5e61ae17b70f';
