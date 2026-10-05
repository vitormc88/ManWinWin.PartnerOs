-- Narrow reconciliation of licences.recurring_contract_value — REVIEW ONLY.
-- Not executed on PROD by Lovable. Ends in ROLLBACK by default.
--
-- Scope: licences.recurring_contract_value only. Never touches invoiced_value,
-- sat_value, mww_web_value, hosting_value, total_value, notes, closure snapshots,
-- revenue rows or perpetual licence dates.
--
-- Safety rules
--  * Exactly ONE candidate per licence: the most recent official renewed close
--    (DISTINCT ON licence, latest closed_at), even when a licence has several.
--  * Links must agree: renewal.client = licence.client = contract.client, and the
--    licence is the contract's licence (licence.contract_id null or equal).
--  * Canonical amount = annualised recurring contract lines of that contract, and
--    it must equal contracts.contract_value; otherwise the case is ambiguous.
--  * Clients with more than one licence or more than one contract are ambiguous
--    and are listed, never changed.
--  * Only licences in the explicit approved list (_rc_approved) are changed, and
--    only if their current and canonical values still equal the approved values.
--    Any approved row that no longer matches aborts the whole run.
--  * Every change is written to audit_logs with a run id and actor first.
--  * Rollback: 03_rollback_reconcile_run_REVIEW.sql (that run only; refuses to
--    overwrite any later change).
--
-- Usage: run 01_detect first; review; fill _rc_approved; set the actor; run.

BEGIN;

SET LOCAL rc.actor = '';            -- REQUIRED: e.g. 'codex:vitor 2026-10-06'

CREATE TEMP TABLE _rc_approved (license_id uuid PRIMARY KEY, approved_old numeric, approved_new numeric) ON COMMIT DROP;
-- INSERT INTO _rc_approved VALUES ('<licence uuid>', <current value>, <canonical value>);

CREATE TEMP TABLE _rc_run ON COMMIT DROP AS
SELECT gen_random_uuid() AS run_id, nullif(current_setting('rc.actor', true), '') AS actor;

DO $$ BEGIN
  IF (SELECT actor FROM _rc_run) IS NULL THEN RAISE EXCEPTION 'rc.actor must be set'; END IF;
END $$;

CREATE TEMP TABLE _rc_candidates ON COMMIT DROP AS
WITH latest AS (
  SELECT DISTINCT ON (r.license_id) r.id AS renewal_id, r.license_id, r.client_id, r.contract_id, r.closed_at
  FROM renewals r
  WHERE r.outcome = 'renewed' AND r.closed_at IS NOT NULL AND r.next_renewal_id IS NOT NULL
    AND r.license_id IS NOT NULL AND r.contract_id IS NOT NULL
  ORDER BY r.license_id, r.closed_at DESC, r.id
), canon AS (
  SELECT cl.contract_id,
         round(sum(cl.amount * CASE lower(coalesce(cl.billing_frequency,'annual'))
                                 WHEN 'monthly' THEN 12 WHEN 'quarterly' THEN 4
                                 WHEN 'semiannual' THEN 2 WHEN 'semi-annual' THEN 2 ELSE 1 END), 2) AS canonical
  FROM contract_lines cl
  WHERE lower(coalesce(cl.billing_frequency,'')) NOT IN ('one_time','one-time')
  GROUP BY cl.contract_id
)
SELECT l.id AS license_id, x.renewal_id, l.client_id, x.contract_id,
       l.recurring_contract_value AS current_value, c.contract_value, k.canonical,
       CASE
         WHEN l.client_id <> x.client_id OR c.client_id <> x.client_id THEN 'link_mismatch'
         WHEN l.contract_id IS NOT NULL AND l.contract_id <> x.contract_id THEN 'link_mismatch'
         WHEN (SELECT count(*) FROM licenses a WHERE a.client_id = l.client_id) <> 1 THEN 'ambiguous_licences'
         WHEN (SELECT count(*) FROM contracts b WHERE b.client_id = l.client_id) <> 1 THEN 'ambiguous_contracts'
         WHEN k.canonical IS NULL OR c.contract_value IS NULL OR k.canonical <> c.contract_value THEN 'canonical_mismatch'
         WHEN coalesce(l.recurring_contract_value, -1) = k.canonical THEN 'in_sync'
         ELSE 'eligible'
       END AS state
FROM latest x
JOIN licenses l ON l.id = x.license_id
JOIN contracts c ON c.id = x.contract_id
LEFT JOIN canon k ON k.contract_id = x.contract_id;

SELECT * FROM _rc_candidates ORDER BY state, license_id;   -- review: ambiguous rows are never changed

-- Approved rows must still match exactly; otherwise abort the run.
DO $$ DECLARE bad int; BEGIN
  SELECT count(*) INTO bad FROM _rc_approved a
  LEFT JOIN _rc_candidates t ON t.license_id = a.license_id
  WHERE t.license_id IS NULL OR t.state <> 'eligible'
     OR coalesce(t.current_value, -1) <> coalesce(a.approved_old, -1) OR t.canonical <> a.approved_new;
  IF bad > 0 THEN RAISE EXCEPTION 'reconcile aborted: % approved row(s) no longer match', bad; END IF;
END $$;

-- Audit first (rollback source), one row per licence.
INSERT INTO audit_logs (entity_type, entity_id, action_type, old_value, new_value, notes)
SELECT 'license', t.license_id, 'reconcile_recurring_value',
       jsonb_build_object('recurring_contract_value', t.current_value),
       jsonb_build_object('recurring_contract_value', t.canonical, 'renewal_id', t.renewal_id, 'actor', r.actor),
       'rc_run:' || r.run_id
FROM _rc_candidates t JOIN _rc_approved a USING (license_id) CROSS JOIN _rc_run r;

UPDATE licenses l SET recurring_contract_value = t.canonical, updated_at = now()
FROM _rc_candidates t JOIN _rc_approved a USING (license_id)
WHERE l.id = t.license_id;

SELECT run_id, actor, (SELECT count(*) FROM _rc_approved) AS licences_changed FROM _rc_run;

-- COMMIT;   -- only after review, replacing the ROLLBACK below
ROLLBACK;
