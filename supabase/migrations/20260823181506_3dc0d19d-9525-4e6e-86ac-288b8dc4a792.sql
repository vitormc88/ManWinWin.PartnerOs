-- Partner Academy — harden the learning-event privacy guard.
--
-- Reusable, content-free: no mission ids, no module ids, no seeded rows.
-- The guard now enforces server-side the SAME closed contract the client
-- sanitiser applies, so a modified/hostile client cannot persist arbitrary or
-- free-text properties.
--
-- Accepted property values:
--   * boolean
--   * finite numeric with |value| <= 1e9
--   * safe machine token: ^[a-z0-9][a-z0-9._:-]{0,79}$   (no spaces => no sentences)
--   * array of at most 10 safe machine tokens
-- Everything else (unknown key, sentence, object, null, oversized array) aborts
-- the INSERT.
--
-- Rollback: restore the previous body of public.academy_learning_events_guard()
-- (size/shape checks only). No other object is touched.

CREATE OR REPLACE FUNCTION public.academy_learning_events_safe_token(_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _value IS NOT NULL AND _value ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'
$$;

REVOKE ALL ON FUNCTION public.academy_learning_events_safe_token(text) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.academy_learning_events_safe_token(text) IS
  'True for bounded machine-shaped tokens (lowercase ids, no whitespace). Used to reject free text in learning-event properties.';

CREATE OR REPLACE FUNCTION public.academy_learning_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Closed whitelist; mirrors SAFE_EVENT_PROPERTY_KEYS in src/lib/academy-events.ts.
  allowed_keys constant text[] := ARRAY[
    'option_id','reasoning_option_ids','correct','reasoning_correct',
    'asset_key','media_kind','media_ready','position_bucket','duration_bucket',
    'source','completion_pct','step_type','step_index','steps_total',
    'resumed','fields_filled'
  ];
  k text;
  v jsonb;
  item jsonb;
  n numeric;
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

  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.properties) LOOP
    IF NOT (k = ANY (allowed_keys)) THEN
      RAISE EXCEPTION 'academy_learning_events.properties key % is not allowed', k;
    END IF;

    CASE jsonb_typeof(v)
      WHEN 'boolean' THEN
        NULL; -- bounded by definition

      WHEN 'number' THEN
        n := v::text::numeric;
        IF abs(n) > 1000000000 THEN
          RAISE EXCEPTION 'academy_learning_events.properties key % has an out-of-range number', k;
        END IF;

      WHEN 'string' THEN
        IF NOT public.academy_learning_events_safe_token(v #>> '{}') THEN
          RAISE EXCEPTION 'academy_learning_events.properties key % must be a safe machine token (no free text)', k;
        END IF;

      WHEN 'array' THEN
        IF jsonb_array_length(v) > 10 THEN
          RAISE EXCEPTION 'academy_learning_events.properties key % exceeds 10 array items', k;
        END IF;
        FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
          IF jsonb_typeof(item) IS DISTINCT FROM 'string'
             OR NOT public.academy_learning_events_safe_token(item #>> '{}') THEN
            RAISE EXCEPTION 'academy_learning_events.properties key % must contain safe machine tokens only', k;
          END IF;
        END LOOP;

      ELSE
        RAISE EXCEPTION 'academy_learning_events.properties key % has an unsupported value type %', k, jsonb_typeof(v);
    END CASE;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.academy_learning_events_guard() IS
  'Append-only privacy guard: enforces the closed safe property key list and bounded token/number/boolean values so free text or personal data can never be logged.';