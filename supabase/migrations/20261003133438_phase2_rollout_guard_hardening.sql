-- Phase 2 rollout: server-owned fingerprint and explicit close outcome.
-- No commercial values/statuses of existing records are changed.
CREATE OR REPLACE FUNCTION public.proposals_capture_fingerprint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _op boolean := coalesce(current_setting('partneros.proposal_op', true),'off') = 'on';
  _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('Accepted','Won')
     AND NEW.status IS DISTINCT FROM OLD.status AND NOT _op AND NOT _close THEN
    RAISE EXCEPTION 'TERMS_LOCKED: this proposal is %; use the official operation or create a new version.', OLD.status USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IN ('Ready','Sent','Accepted','Won') THEN
    IF TG_OP = 'UPDATE' AND OLD.status IN ('Ready','Sent','Accepted','Won')
       AND OLD.commercial_fingerprint IS NOT NULL THEN
      -- The browser/API must never clear or replace the accepted baseline.
      NEW.commercial_fingerprint := OLD.commercial_fingerprint;
    ELSE
      NEW.commercial_fingerprint := private.proposal_commercial_fingerprint(NEW.id, to_jsonb(NEW));
    END IF;
  ELSE
    NEW.commercial_fingerprint := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.proposals_capture_fingerprint() FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE d text; original text;
BEGIN
  original := pg_get_functiondef('public.close_renewal(uuid,text,uuid,text,text,date,date)'::regprocedure);
  d := replace(original, E'BEGIN\n  IF auth.uid() IS NULL',
    E'BEGIN\n  IF _outcome IS NULL OR _outcome NOT IN (''renewed'',''lost'') THEN\n    RAISE EXCEPTION ''INVALID_OUTCOME: outcome must be renewed or lost'';\n  END IF;\n  IF auth.uid() IS NULL');
  IF d = original THEN RAISE EXCEPTION 'Phase 2 close wrapper preflight failed'; END IF;
  EXECUTE d;
END $migration$;
