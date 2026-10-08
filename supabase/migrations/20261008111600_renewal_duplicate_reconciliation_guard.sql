CREATE OR REPLACE FUNCTION public.renewals_guard_closed()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.superseded_by_renewal_id IS DISTINCT FROM OLD.superseded_by_renewal_id
     AND current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'RECONCILIATION_NOT_AUTHORIZED: duplicate reconciliation is an administrative maintenance operation';
  END IF;
  IF OLD.closed_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'RENEWAL_CLOSED: a closed renewal cannot be reopened';
  END IF;
  IF (to_jsonb(NEW) - 'closing_notes' - 'notes' - 'updated_at' - 'next_renewal_id' - 'closure_snapshot' - 'superseded_by_renewal_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'closing_notes' - 'notes' - 'updated_at' - 'next_renewal_id' - 'closure_snapshot' - 'superseded_by_renewal_id') THEN
    RAISE EXCEPTION 'RENEWAL_CLOSED: closed renewals are read-only (notes only)';
  END IF;
  RETURN NEW;
END;
$function$;
