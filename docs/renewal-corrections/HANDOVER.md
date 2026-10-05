# Focused renewal corrections — handover (TEST only; PROD untouched)

Base commit: `996fab8` ("Fixed renewal closing & counters"). This round is in the next platform commit on top of it.

## Ordered migrations (apply byte-for-byte after the Phase 2 set incl. `20261003133438`)
1. `20261005135018_57ae7a01-…` — B: commercial intelligence excludes Won / closed_at / outcome cycles; C+D: close_renewal_core keeps perpetual (KeepIT) licence start/end dates, syncs `licenses.recurring_contract_value` to the reconciled lines; adds `private.license_is_perpetual`; EXECUTE on `get_client_commercial_intelligence` revoked from PUBLIC/anon. Guarded text replacement — aborts if the PROD function body differs.
2. `20261005140445_9cd5866b-…` — E: `validate_proposal` refuses a renewal proposal with empty payment terms. Guarded, idempotent.
Dependencies: Phase 2 `validate_proposal` and `close_renewal_core` must exist (Phase 2 migrations 1–8 + hardening).

## Rollback (preserves commercial history)
- Migration 2: re-create `validate_proposal` from the Phase 2 definition (remove the payment-terms block).
- Migration 1: re-create `get_client_commercial_intelligence` and `close_renewal_core` from their pre-migration definitions; `GRANT EXECUTE … TO anon` only if required. No data is changed by either migration.
- Frontend: republish the previous build.

## Changed files (this round)
- `src/lib/renewal-price-adjustment.ts`, `src/lib/__tests__/renewal-price-adjustment.test.ts` (new)
- `src/components/proposals/RenewalPriceAdjustmentPanel.tsx` (new)
- `src/components/proposals/CreateProposalDialog.tsx` (panel, unambiguous previous terms, language never overwrites terms)
- `src/pages/ClientDetail.tsx` (imported contract header labelled historical)
- Previous round (in `996fab8`): ClientOverviewPanel, CommercialWorkspace, CloseRenewalDialog, useClientCommercialIntelligence, useProposalWorkflow, client-overview, renewal-closing, Renewals page.
- `docs/renewal-corrections/01_detect_affected_records_READONLY.sql`, `02_reconcile_licence_recurring_value_REVIEW.sql`

## Existing-record scripts
- 01 is read-only (inside `BEGIN READ ONLY … ROLLBACK`). Needs migration 1 (uses `private.license_is_perpetual`) and an owner role.
- 02 changes only `licenses.recurring_contract_value`, only unambiguous cases (one licence + one contract), writes `audit_logs` first, ends in ROLLBACK until reviewed. Never touches invoice/imported header values, revenue rows or perpetual dates. Reset perpetual dates (D1) are listed only.

## Acceptance (synthetic fixtures, enforcement ON; fixtures removed, ZZ QA kept)
B = browser, D = database/API as the signed-in user, U = unit test.
1. Baseline ARR 6992 (S&AT 2192 + Web 4800) — B
2. 5% on S&AT only → 2301.60, Web 4800 — B + U
3. Agreed 2300 → ARR 7100, saved Draft 7100, persisted — B + D
4. No compounding on re-apply — B + U; next cycle starts from 2300 (2415 at 5%) — B
5. No proposal → "Not available", close disabled, Create/open button — B
6. Loading/failed intelligence states — U (previous round); not forced in browser
7. Empty terms refused; no reason refused; Validated → Sent → Accepted (PO 50692; no reference refused) → Renewed — D
8. One revenue row €7,100 (partner set), one next cycle 2027-10-14 €7,100, links both ways — D
9. Repeat close: already_closed, no duplicates — D
10. Overview / Commercial / Contract consistent (7,100, 14 Oct 2027) — B
11. Intelligence: closed Won cycle excluded, next 2027-10-14 — D + B
12. Historical imported values preserved (invoiced 6,992, S&AT 2,192, total 6,992), now labelled historical — D + B
13. KeepIT licence start 2015-03-01 kept, end null; S&AT dates 2026-10-14 → 2027-10-13 — D
14. UseIT advanced 2026-10-14 → 2027-10-13 — D
15. Lost: no next cycle, Lost row stays closed — D
16. Access: HQ and own-partner admin read; unrelated partner gets 0 rows and RENEWAL_NOT_FOUND on readiness/close; signed-out refused — D
17. Validated edit → REVALIDATION_REQUIRED; Accepted edit → TERMS_LOCKED — D
18. Counters: In Progress counts "In Progress" rows (4 incl. fixture) — B

Timings (`get_client_commercial_intelligence`, one client, from the browser): HQ 96–190 ms warm (2.1 s first call), own-partner 292–346 ms.

## Not verified / limitations
- Manual date entry through the UI save/reload was not re-clicked this round.
- Imported historical €6,992 revenue row scenario not reproduced (fixture had none).
- Web coverage dates: no dedicated column; Web follows contract line dates.
- Date convention unchanged: last covered day 13 Oct, next boundary 14 Oct.
- A closed UseIT client with no open cycle shows next date = licence end (2027-10-13).
- 01 could not run in the sandbox (no access to `private`); syntax checked up to that point.
- Two pre-existing failing tests (commercial-enablement outreach engagement); 155 older warnings untouched.
