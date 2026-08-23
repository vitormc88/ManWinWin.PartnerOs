-- Partner Academy — reusable append-only learning event log.
--
-- Purpose: internal QA / product visibility of how learners move through the
-- data-driven Mission Player. It NEVER stores free text, draft content or
-- personal data — only bounded identifiers, booleans and buckets.
--
-- Rollback notes:
--   DROP TRIGGER IF EXISTS trg_academy_learning_events_guard ON public.academy_learning_events;
--   DROP FUNCTION IF EXISTS public.academy_learning_events_guard();
--   DROP TABLE IF EXISTS public.academy_learning_events;
--   (no other object is modified by this migration)

CREATE TABLE public.academy_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  mission_id uuid NOT NULL REFERENCES public.academy_missions(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  step_id text,
  client_event_id uuid NOT NULL,
  session_id uuid NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_learning_events_name_ck CHECK (
    event_name IN (
      'mission_started','mission_resumed','mission_completed',
      'step_viewed','step_completed',
      'knowledge_check_answered','scenario_answered',
      'video_started','video_completed',
      'audio_started','audio_completed',
      'deep_dive_opened','deep_dive_closed',
      'apply_started','apply_completed'
    )
  ),
  CONSTRAINT academy_learning_events_step_ck CHECK (step_id IS NULL OR length(step_id) <= 120)
);

COMMENT ON TABLE public.academy_learning_events IS
  'Append-only Partner Academy learning telemetry. Insert-only for learners, admin-only reads. No free text or personal data.';
COMMENT ON COLUMN public.academy_learning_events.client_event_id IS
  'Client-generated UUID; unique per user for idempotent retries and de-duplication.';
COMMENT ON COLUMN public.academy_learning_events.properties IS
  'Bounded safe metadata only (option ids, correctness, asset key, buckets, percentages). Size guarded by trigger.';

-- Size / shape guard (trigger instead of CHECK: jsonb size functions are not immutable).
CREATE OR REPLACE FUNCTION public.academy_learning_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(NEW.properties) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'academy_learning_events.properties must be a JSON object';
  END IF;
  IF length(NEW.properties::text) > 2000 THEN
    RAISE EXCEPTION 'academy_learning_events.properties exceeds the 2000 character size guard';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.properties)) > 20 THEN
    RAISE EXCEPTION 'academy_learning_events.properties exceeds 20 keys';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_academy_learning_events_guard
BEFORE INSERT ON public.academy_learning_events
FOR EACH ROW EXECUTE FUNCTION public.academy_learning_events_guard();

CREATE INDEX academy_learning_events_mission_time_idx
  ON public.academy_learning_events (mission_id, occurred_at DESC);
CREATE INDEX academy_learning_events_user_mission_time_idx
  ON public.academy_learning_events (user_id, mission_id, occurred_at DESC);
CREATE UNIQUE INDEX academy_learning_events_client_event_uidx
  ON public.academy_learning_events (user_id, client_event_id);

-- Insert + admin read only. No UPDATE/DELETE grants: the log is append-only.
GRANT SELECT, INSERT ON public.academy_learning_events TO authenticated;
GRANT ALL ON public.academy_learning_events TO service_role;

ALTER TABLE public.academy_learning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners log their own Academy events"
ON public.academy_learning_events
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_academy()
  AND EXISTS (
    SELECT 1
    FROM public.academy_missions m
    JOIN public.academy_modules md ON md.id = m.module_id
    WHERE m.id = academy_learning_events.mission_id
      AND m.module_id = academy_learning_events.module_id
      AND m.status = 'published'
      AND md.status = 'published'
  )
);

CREATE POLICY "Academy admins read learning events"
ON public.academy_learning_events
FOR SELECT
TO authenticated
USING (public.is_academy_admin());