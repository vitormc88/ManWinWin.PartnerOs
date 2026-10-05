-- Rollback of ONE reconciliation run — REVIEW ONLY. Ends in ROLLBACK by default.
-- Restores licences.recurring_contract_value only for the given run id, and only
-- where the licence still holds exactly the value that run wrote. If any licence
-- of the run has changed since, the whole rollback is refused.

BEGIN;
SET LOCAL rc.run_id = '';      -- REQUIRED: the run id reported by 02 (uuid)
SET LOCAL rc.actor  = '';      -- REQUIRED

DO $$ BEGIN
  IF nullif(current_setting('rc.run_id', true), '') IS NULL OR nullif(current_setting('rc.actor', true), '') IS NULL THEN
    RAISE EXCEPTION 'rc.run_id and rc.actor must be set';
  END IF;
END $$;

CREATE TEMP TABLE _rb ON COMMIT DROP AS
SELECT a.entity_id AS license_id,
       (a.old_value->>'recurring_contract_value')::numeric AS restore_value,
       (a.new_value->>'recurring_contract_value')::numeric AS run_value,
       l.recurring_contract_value AS current_value
FROM audit_logs a JOIN licenses l ON l.id = a.entity_id
WHERE a.action_type = 'reconcile_recurring_value'
  AND a.notes = 'rc_run:' || current_setting('rc.run_id');

SELECT * FROM _rb;

DO $$ DECLARE n int; changed int; BEGIN
  SELECT count(*), count(*) FILTER (WHERE coalesce(current_value,-1) <> coalesce(run_value,-1)) INTO n, changed FROM _rb;
  IF n = 0 THEN RAISE EXCEPTION 'no audit rows for this run'; END IF;
  IF changed > 0 THEN RAISE EXCEPTION 'rollback refused: % licence(s) changed after the run', changed; END IF;
END $$;

INSERT INTO audit_logs (entity_type, entity_id, action_type, old_value, new_value, notes)
SELECT 'license', license_id, 'reconcile_recurring_value_rollback',
       jsonb_build_object('recurring_contract_value', run_value),
       jsonb_build_object('recurring_contract_value', restore_value, 'actor', current_setting('rc.actor')),
       'rc_rollback:' || current_setting('rc.run_id')
FROM _rb;

UPDATE licenses l SET recurring_contract_value = b.restore_value, updated_at = now()
FROM _rb b WHERE l.id = b.license_id;

-- COMMIT;
ROLLBACK;
