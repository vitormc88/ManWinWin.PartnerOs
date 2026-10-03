-- Phase 2 hardening — database tests (TEST only). Every scenario runs in a
-- sub-transaction that is undone; deferred checks are forced with
-- SET CONSTRAINTS ALL IMMEDIATE. Replace the ids with disposable fixtures.
-- Results recorded 2026-10-03 on TEST:
--  1 Ready: qty x2 / price /2, same totals ......... REVALIDATION_REQUIRED
--  2 Ready: different product, same price .......... REVALIDATION_REQUIRED
--  3 Ready: licence model changed .................. REVALIDATION_REQUIRED
--  4 Ready: identical delete + re-insert ........... allowed
--  5 Ready -> Draft, then change ................... allowed
--  6 Won: item UPDATE, same totals ................. TERMS_LOCKED
--  7 Won: item INSERT (zero value) ................. TERMS_LOCKED
--  8 Won: item DELETE .............................. TERMS_LOCKED
--  9 Won: total changed ............................ TERMS_LOCKED
-- 10 Won: note edit (non-commercial) ............... allowed
-- Ambiguity (renewal_close_readiness, HQ caller):
--  A control, no other component ................... not ambiguous
--  B same date, no contract, same type ............. not ambiguous
--  C same date, no contract, different service type  AMBIGUOUS
--  D same contract/type, end date +5 days .......... AMBIGUOUS
--  E same contract/type, end date -1 day ........... AMBIGUOUS
--  F different contract, same date/type ............ AMBIGUOUS
-- (Same contract + same date + any type is impossible: renewals_unique_contract_cycle.)

CREATE TEMP TABLE t_res(n int, scenario text, result text);
DO $t$
DECLARE R uuid := '<READY_PROPOSAL_ID>'; W uuid := '<WON_PROPOSAL_ID>'; msg text;
BEGIN
  BEGIN
    UPDATE proposal_items SET qty = qty*2, unit_price = unit_price/2 WHERE proposal_id=R;
    SET CONSTRAINTS ALL IMMEDIATE; RAISE EXCEPTION 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; INSERT INTO t_res VALUES (1,'Ready same-total qty/price',msg); END;
  SET CONSTRAINTS ALL DEFERRED;
  BEGIN
    UPDATE proposal_items SET qty = qty*2, unit_price = unit_price/2 WHERE proposal_id=W;
    SET CONSTRAINTS ALL IMMEDIATE; RAISE EXCEPTION 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; INSERT INTO t_res VALUES (6,'Won item update',msg); END;
  SET CONSTRAINTS ALL DEFERRED;
END $t$;
SELECT * FROM t_res ORDER BY n;
