# PartnerOS R1 — FIN02 Gate 4B: actual TEST-source Explorer refresh + financial E2E
**12 Oct 2026 | Source-anchored integration PASS | Full TEST archive restore NOT executed | Live release NO-GO**

## Original TEST provenance and limit
The user authorized use of the attached Lovable Cloud TEST PGDMP export: 24,688,476 bytes; PostgreSQL source 17.6; pg_dump 18.6; 2,446 archive objects and 160 decompressed TABLE DATA blocks. For CI, the COMPLETE ORIGINAL definitions of private.refresh_customer_explorer(), private.sync_customer_explorer_directory(), and the two source triggers were reviewed and extracted from the user-provided backup. Test tables have only the columns needed by those real routines; test rows are wholly fictional.

- [Exact TEST Explorer refresh and wrapper fixture](../../tests/sql/fin02/gate4b_explorer_actual_source_refresh.sql).
- [Concurrency, duplicate, repair, rollback and timeout lab](../../tests/sql/fin02/gate4b_explorer_real_refresh_lab.sh).
- [Real full-refresh GitHub CI #38238551913](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38238551913): **PASS**.
- [Original financial award + full original TEST Explorer refresh CI #38238551850](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38238551850): **PASS**.
- All **9/9 GitHub Actions** at SHA a79740bcc35db7cf3f04e9f2b2b8cc6a12d5400e: **SUCCESS**, including the existing financial, role, pricing, synthetic backup/restore and independent rollback checks.

**Honesty boundary:** this is a source-faithful FUNCTION and trigger integration with synthetic schema and data, **NOT a full 2,446-object PostgreSQL restore of actual TEST**. The private raw backup, Auth/user rows, business data, tokens and source connections were never uploaded to GitHub.

## Finding #40 — normal concurrency can turn Customer Explorer OFF
Actual TEST trigger invokes private.sync_customer_explorer_directory() after every Client/Partner INSERT/UPDATE/DELETE statement. It tries pg_try_advisory_xact_lock('customer-explorer-refresh'). A busy lock produces SQLSTATE 55P03; original exception handler marks rollout mode OFF but does NOT abort the Client INSERT.

The actual private.refresh_customer_explorer() function itself obtains a blocking advisory lock and atomically DELETEs and re-INSERTs the full directory projection from clients, partners, HQ and overrides. Against that EXACT function, tests reproduced: Client INSERT COMMITTED, directory stayed STALE, and rollout switched OFF. **This is a reproduced potential source-code race, not an observed outage in remote TEST**.

Independent LAB-ONLY candidate changes the wrapper to use pg_advisory_xact_lock (blocking) before running the identical real refresh:
- **PASS:** second client transaction waited, then full directory rebuilt and mode remained HQ.
- **PASS:** original partner/HQ/overrides source mapping; numeric code normalization; exclusions 0/9998.
- **PASS:** conflicting raw client codes 44 and 00044 are unique in source Clients but normalize to the same directory key. A real uniqueness exception 23505 causes rollback of partial directory rebuild; Client INSERT remains committed and rollout switches OFF. Repairing the source code and explicit refresh restores the directory.
- **PASS:** forced parent transaction rollback restores Client and directory atomically.
- **PASS:** under 500-ms statement timeout with another transaction holding the advisory lock, candidate INSERT is cancelled, rolls back with no partially inserted Client, directory stays intact and Explorer remains HQ. Financial award availability/latency could nonetheless suffer with synchronous blocking.
- **NOT TESTED:** real RLS/Auth end-to-end, full cluster lock graph or deadlock proof, production-sized performance/latency, Supabase cron/net/email, in-app notifications, HQ retry alerting and API rollout.

**Recommendation to evaluate (not yet implement):** idempotent coalesced dirty-flag/outbox + worker, bounded retries and HQ alerts could decouple slow Explorer rebuilds from revenue-critical Client awards. The tested blocking candidate is only a temporary fallback pending design, deadlock and timeout approval. DO NOT INSTALL IT IN TEST/PROD.

## Finding #41 — numeric-only business visibility excludes FIN02 awards by design
Original FIN02 award_deal_proposal generates an alphanumeric client_code: country + normalized short company + UUID-derived prefix. Original TEST Explorer refresh only includes digit-only client_code, with leading-zero canonical identity and excluded numeric keys 0/9998.

This restriction is EXPLICITLY documented in docs/customer-explorer-rollout.md; it is an intentional current product rule, NOT an accidental SQL typo. The integrated financial E2E asserts that its new Client remains absent from Explorer as required under current policy. Changing eligibility would alter partner visibility and must be a product/HQ decision, not an automatic patch.

Read-only aggregate TEST SQL observed:
- 55 non-Archived Clients: 6 numeric IDs and 49 nonnumeric; 37 nonnumeric Clients linked to deals.
- 37 active Clients linked to WON deals absent from the client-source Explorer projection; directory has 6 partner-source and 311 curated HQ-source entries.
- 0 currently colliding numeric-normalized client-code groups.
- Explorer current rollout is HQ; sync_error_code is NULL: no observed current sync outage.

Decision and acceptance checklist: [Issue #41](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/41).

## FIN02 Cross-Domain E2E proof
[CI #38238551850](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38238551850) applied source-backed original financial RPCs, original complete Explorer refresh and sync trigger wrapper and LAB-only serialized candidate on disposable PostgreSQL 17 with fictitious IDs. It passed:
- €1,608 initial award and unique first-sale ledger; €570 annual recurring base;
- 2027 and 2028 renewals €570 each, preserved original one-time charges;
- two simultaneous awards of the same deal yielding one client/license/contract/revenue event;
- forced late rollback reverting finance and Explorer projection effects together;
- policy/RLS, reverse SEC35/36/37/38 migration rollback, synthetic backup/restore;
- Explorer remains HQ healthy and documented alphanumeric exclusion stays intact.

## Release / exit
- [#39](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/39): complete TEST backup **not yet restored** to private Supabase-compatible PostgreSQL (including auth/roles/storage/extension/cron schemas); Gate 4B is still **NO-GO for live installation**.
- [#40](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/40): source lock failure reproduced; patch architecture/retry/alert/deadlock signoff needed.
- [#41](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/41): choose numeric-only/curated vs inclusion of new awards, respecting tenant RLS.
- [#29](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/29): full R1 release governance, FIN03, Commercial Memory, UX and QA remain open.
- PR #34 remains Draft and unmerged. NO TEST/PROD writes, no deploy, no paid Lovable agent, no Work credits.
