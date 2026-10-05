-- Narrow reconciliation — REVIEW ONLY. Not executed on PROD by Lovable.
-- Scope: licences.recurring_contract_value only, for renewals officially closed as renewed,
-- where exactly one licence and one contract are linked (unambiguous).
-- Never touches: invoiced_value, sat_value, mww_web_value, hosting_value, total_value,
-- notes, closure snapshots, revenue rows, or perpetual licence dates.
-- Perpetual start dates reset by the old close (query D1) are NOT repaired here:
-- they need separate evidence and review.
-- Run 01_detect first; review the C1 rows; then:
BEGIN;

CREATE TEMP TABLE _rc_targets ON COMMIT DROP AS
SELECT l.id AS license_id, l.recurring_contract_value AS old_value, c.contract_value AS new_value
FROM renewals r
JOIN licenses l ON l.id = r.license_id
JOIN contracts c ON c.id = r.contract_id
WHERE r.outcome = 'renewed' AND r.closed_at IS NOT NULL AND r.next_renewal_id IS NOT NULL
  AND c.contract_value IS NOT NULL
  AND coalesce(l.recurring_contract_value, -1) <> c.contract_value
  AND (SELECT count(*) FROM licenses x WHERE x.client_id = l.client_id) = 1     -- unambiguous
  AND (SELECT count(*) FROM contracts y WHERE y.client_id = l.client_id) = 1;   -- unambiguous

SELECT * FROM _rc_targets;   -- review: expected rows only

-- Audit trail before change (rollback source).
INSERT INTO audit_logs (entity_type, entity_id, action_type, old_value, new_value, notes)
SELECT 'license', license_id, 'reconcile_recurring_value',
       jsonb_build_object('recurring_contract_value', old_value), jsonb_build_object('recurring_contract_value', new_value),
       '02_reconcile_licence_recurring_value'
FROM _rc_targets;

UPDATE licenses l SET recurring_contract_value = t.new_value, updated_at = now()
FROM _rc_targets t WHERE l.id = t.license_id;

-- Ambiguous cases (more than one licence or contract) are listed, never changed:
-- re-run 01_detect C1 and review them manually.

-- COMMIT;   -- only after review
ROLLBACK;

-- Rollback after commit:
-- UPDATE licenses l SET recurring_contract_value = (a.old_value->>'recurring_contract_value')::numeric
-- FROM audit_logs a WHERE a.action_type = 'reconcile_recurring_value' AND a.entity_id = l.id;
