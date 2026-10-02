-- Creating the initial renewal is a consequence of awarding a deal, not a
-- separate renewal edit action. Partner managers/admins may edit clients and
-- pipeline but their renewal access is read-only.
DO $migration$
DECLARE
  definition text;
  old_guard text := 'OR NOT public.has_module_access(''renewals'', ''edit'')';
BEGIN
  SELECT pg_get_functiondef('public.award_deal_proposal(uuid, uuid, uuid, jsonb, jsonb, date, integer)'::regprocedure)
    INTO definition;

  IF definition IS NULL OR position(old_guard IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected award_deal_proposal permission guard';
  END IF;

  EXECUTE replace(definition, old_guard, '');
END;
$migration$;
