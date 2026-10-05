-- READ-ONLY detection for the focused renewal corrections (B, C, D).
-- Run inside a read-only transaction. Changes nothing. For Codex review on PROD.
BEGIN TRANSACTION READ ONLY;

-- D1. Perpetual (KeepIT) licences whose start date equals the effective date of an
--     official renewed close: the old close reset it. Original date is NOT recoverable
--     from this data — needs separate evidence (closure_snapshot, import, customer docs).
SELECT l.id AS license_id, l.client_id, l.license_model, l.license_start_date, l.license_end_date,
       r.id AS renewal_id, r.renewal_effective_date, r.closed_at,
       r.closure_snapshot ? 'license' AS snapshot_has_license
FROM licenses l
JOIN renewals r ON r.license_id = l.id AND r.outcome = 'renewed' AND r.closed_at IS NOT NULL
WHERE private.license_is_perpetual(l.license_model, l.periodicity, l.product, l.edition)
  AND (l.license_start_date = r.renewal_effective_date OR l.license_end_date IS NOT NULL)
ORDER BY r.closed_at DESC;

-- C1. Licence current recurring value out of step with the reconciled contract after a close.
SELECT l.id AS license_id, l.client_id, l.recurring_contract_value, c.id AS contract_id, c.contract_value,
       (SELECT count(*) FROM licenses l2 WHERE l2.contract_id = c.id OR l2.client_id = l.client_id) AS licences_on_client
FROM renewals r
JOIN licenses l ON l.id = r.license_id
JOIN contracts c ON c.id = r.contract_id
WHERE r.outcome = 'renewed' AND r.closed_at IS NOT NULL
  AND r.next_renewal_id IS NOT NULL
  AND coalesce(l.recurring_contract_value, -1) <> coalesce(c.contract_value, -1);

-- C2. Imported headers that differ from current structured lines (informational only;
--     these are preserved historical values and must NOT be overwritten).
SELECT c.id, c.client_id, c.is_imported, c.sat_value, c.mww_web_value, c.hosting_value, c.invoiced_value, c.total_value,
       c.contract_value,
       (SELECT sum(amount) FROM contract_lines cl WHERE cl.contract_id = c.id AND lower(coalesce(cl.billing_frequency,'')) NOT IN ('one_time','one-time')) AS current_recurring_lines
FROM contracts c
WHERE c.is_imported AND EXISTS (SELECT 1 FROM renewals r WHERE r.contract_id = c.id AND r.outcome = 'renewed');

-- B1. Clients whose closed (Won / closed_at / outcome) cycle would previously have been
--     counted as active in commercial intelligence.
SELECT r.client_id, r.id, r.status, r.outcome, r.closed_at, r.renewal_date
FROM renewals r
WHERE r.status = 'Won' OR (r.closed_at IS NOT NULL AND r.status NOT IN ('Completed','Cancelled','Lost'));

-- R1. Renewals with more than one closure recurring row.
SELECT source_reference, count(*) FROM client_revenue_history
WHERE source_reference LIKE 'renewal:%:recurring' GROUP BY 1 HAVING count(*) > 1;

-- R2. Historical (imported / LIC / manual) revenue next to closure revenue, per client.
--     Listed for review only; never treated as duplicates automatically.
--     same_period_overlap = a non-closure row dated within the closed cycle's year.
SELECT h.client_id, h.source, h.source_reference, h.revenue_type, h.amount, h.revenue_date,
       h.renewal_id, h.contract_id,
       (h.source = 'renewal_closure') AS is_closure_row,
       EXISTS (
         SELECT 1 FROM client_revenue_history z
         JOIN renewals r ON r.id = z.renewal_id
         WHERE z.client_id = h.client_id AND z.source = 'renewal_closure' AND h.source <> 'renewal_closure'
           AND h.revenue_date >= coalesce(r.renewal_effective_date, r.renewal_date)
           AND h.revenue_date <  coalesce(r.renewal_effective_date, r.renewal_date) + interval '1 year'
       ) AS same_period_overlap
FROM client_revenue_history h
WHERE h.client_id IN (SELECT client_id FROM client_revenue_history WHERE source = 'renewal_closure')
ORDER BY h.client_id, h.revenue_date, h.source;

ROLLBACK;
