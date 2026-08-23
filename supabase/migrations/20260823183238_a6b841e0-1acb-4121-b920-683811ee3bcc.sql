-- Partner Academy — explicit append-only grants for academy_learning_events.
--
-- Purpose: align repo migration history with production after a privilege drift
-- was corrected. This migration explicitly revokes any broader default privileges
-- and re-applies the strict SELECT/INSERT-only grant for authenticated learners.
-- It does NOT modify mission content, data, schemas, or the original table definition.

REVOKE ALL PRIVILEGES ON TABLE public.academy_learning_events FROM authenticated;

GRANT SELECT, INSERT ON public.academy_learning_events TO authenticated;
GRANT ALL ON public.academy_learning_events TO service_role;

COMMENT ON TABLE public.academy_learning_events IS
  'Append-only Partner Academy learning telemetry. Insert-only for learners (SELECT, INSERT only), admin-only reads. No UPDATE/DELETE. No free text or personal data.';