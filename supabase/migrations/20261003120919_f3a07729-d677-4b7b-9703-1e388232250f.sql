CREATE OR REPLACE FUNCTION public.proposals_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _op boolean := coalesce(current_setting('partneros.proposal_op', true),'off') = 'on';
        _close boolean := coalesce(current_setting('partneros.renewal_close', true),'off') = 'on';
        _old text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
        _renewal boolean := NEW.renewal_id IS NOT NULL OR NEW.source_type = 'renewal';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM _old THEN
    -- Same status: commercial terms of a validated/sent/accepted proposal are frozen.
    IF TG_OP = 'UPDATE' AND _old IN ('Ready','Sent','Accepted') AND NOT _op AND NOT _close
       AND (round(coalesce(NEW.total_year_1,0),2) IS DISTINCT FROM round(coalesce(OLD.total_year_1,0),2)
         OR round(coalesce(NEW.total_recurring,0),2) IS DISTINCT FROM round(coalesce(OLD.total_recurring,0),2)) THEN
      PERFORM private.workflow_violation('proposal_terms', 'proposal', NEW.id,
        format('REVALIDATION_REQUIRED: the commercial terms of a %s proposal changed; return it to Draft and validate again', _old),
        jsonb_build_object('status', _old,
          'old', jsonb_build_object('y1', OLD.total_year_1, 'rec', OLD.total_recurring),
          'new', jsonb_build_object('y1', NEW.total_year_1, 'rec', NEW.total_recurring)));
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IN ('Ready','Sent','Accepted') AND NOT _op THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      format('STATUS_GUARD: "%s" can only be set through Validate / Mark Sent / Record acceptance', NEW.status),
      jsonb_build_object('from', _old, 'to', NEW.status));
  ELSIF _renewal AND NEW.status IN ('Won','Lost') AND NOT _close THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      'STATUS_GUARD: renewal proposals become Won/Lost only through the official renewal close',
      jsonb_build_object('from', _old, 'to', NEW.status));
  ELSIF _old IN ('Accepted','Won') AND NOT _op AND NOT _close THEN
    PERFORM private.workflow_violation('proposal_status', 'proposal', NEW.id,
      format('STATUS_GUARD: an %s proposal cannot be changed back to %s', _old, NEW.status),
      jsonb_build_object('from', _old, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_a_proposals_status_guard ON public.proposals;
CREATE TRIGGER trg_a_proposals_status_guard
  BEFORE INSERT OR UPDATE OF status, total_year_1, total_recurring ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_status_guard();

REVOKE ALL ON FUNCTION public.proposals_status_guard() FROM PUBLIC, anon, authenticated;