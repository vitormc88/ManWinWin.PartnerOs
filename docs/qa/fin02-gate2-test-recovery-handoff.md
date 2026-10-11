# FIN-02 — Gate 2 faithful TEST recovery handoff
**11 October 2026 | Review-only plan | NOT authorization to change any live database**

## Purpose
Validate the existing **Draft** PR #34 migration and its associated code using the **actual effective TEST schema** (not a stale PROD archive and not a stitched-together migration replay). Prior Customer Explorer run proved an isolated local Docker/Supabase Postgres 17 recovery method could work, but that historical archive was **PROD**, not TEST.

### Scope and source anchors
- Repository: `vitormc88/ManWinWin.PartnerOs`
- Branch: `fix/fin02-server-renewal-contract-policy-20261011` (use HEAD when executing, record exact SHA)
- Dependencies: PR #28 → PR #31 → PR #34; PR #32 FIN-03 is separately staged
- Migration: `supabase/migrations/20261011213000_fin02_award_source_line_renewal_policy.sql`
- SQL negative-test fixture: `tests/sql/fin02/assertions.sql` **tests functions via surrogates; do not mistake it for full original RPC E2E**
- TEST reference (confirm independently before *read-only export*): `avxxzmoayxzrykwqzoqn`; Lovable project `09e44188-ec64-4ec3-8add-b3b54882408c`
- PROD reference: `qownzparzsaeoyccgwuj` **MUST NOT TOUCH**
- Read-only TEST catalog fingerprint: `tests/sql/fin02/test_schema_fingerprint_20261011.json`
- Historical Docker method evidence: `docs/customer-explorer-local-runtime-preparation.md`, `docs/customer-explorer-prod-backup-preflight.md`

### Safety preconditions — STOP if unmet
1. Explicitly distinguish source TEST from PROD in UI *and* project ref. Neither `db reset --linked` nor `db push` nor `supabase link` is permitted.
2. Obtain an authorized **schema-only** export of the **effective TEST instance**, preserving table definitions, constraints, indexes, functions, triggers, RLS policies, grants and extensions. If TEST credentials/export access are unavailable through Lovable, **stop and report**, rather than guess, export PROD or query secrets.
3. Never upload a raw TEST/PROD dump, credentials, Auth contents, customer records or secret values to GitHub, runner logs or external storage. Keep any sensitive local backup encrypted/private and delete after authorized retention period.
4. Use a disposable network-isolated PostgreSQL container. Disable `pg_cron`, `pg_net`, notification/email/HTTP jobs before any interaction that could enqueue or dispatch external effects; do not connect restored environment to live integrations.
5. Establish a rollback point before running the migration. Confirm the active PostgreSQL/Supabase version and extension set are compatible.

### Pre-migration parity
- Compare local restored **unmodified** source object signatures to the read-only TEST fingerprint:
  - 107 public tables, 175 public functions, 344 RLS policies, 94 non-system triggers at 2026-10-11 (informational, may have changed; recapture if later).
  - All eight financial tables' column signatures and relevant RLS policy fingerprints.
  - Eight financial functions' `pg_get_functiondef` fingerprints including `award_deal_proposal` and `close_renewal_core` **before** PR #34 migration.
  - Extension versions, role grants, trigger stack and deferrable constraints.
- If the source structure/permissions differ, record the discrepancy and **STOP** rather than attempt a best-effort production migration.
- Use only synthetic Client, Deal, Proposal, License, Contract, Renewal fixtures for data-dependent scenarios; live financial rows should not be copied unless separately authorized and anonymized.

### Migration test, private isolated container only
1. Apply PR #34 migration atomically; verify all function definitions, original grants, RLS and event triggers remain intact. Check `contract_lines.renewal_amount`, `pricing_snapshot`, `fin02_assert_business_award` and the source-line policy trigger.
2. Reapply the migration for idempotency; roll back to original definitions (not just drop fields) in a separate disposable copy.
3. Test *actual* `award_deal_proposal` and `close_renewal_core`, not their GitHub Actions surrogate versions.
4. Standard KeepIT: 0%, software 8%, Web/App 3% renewing; S&TA 17% on **gross** eligible license base, unaffected by discounts.
5. Expiring Web/App discount: Year 1 net, next cycle gross; verify second renewal and separate nonrecurring implementation.
6. Reject changed/swap (+€100/−€100), unsourced/duplicated/cross-proposal contract items and tampering with next-cycle amount/policy snapshot.
7. Reject unauthorized direct calls (anon, unrelated partner, restricted HQ role, revoked user) and verify successful authorized HQ/partner contexts only. Test token claims and RLS; a role label alone is not an auth test.
8. Verify award retry, concurrent award, failure mid-transaction, no orphan Client/License/Contract/Renewal, and exact historical source after approval.
9. Test legacy rows (new fields remain NULL) and historical Thai Union exception without modifying the legacy Won record.
10. Compare-mode KeepIT/UseIT remains explicitly **blocked** pending approved selected-option immutable pricing snapshot. Do not remove the block to make tests green.
11. **Financial revenue history:** assert newly Won Deal has exactly one `client_revenue_history.initial_sale` entry with accepted Year-1 value; after closure exactly one separate `renewal` entry with the new period value; check original one-time services are not falsely counted as future recurrence. Retry awards and test imported/historical clients to ensure no duplicate initial sale. Original R1 Thai Union in TEST currently has renewal €393,018.20 but no initial_sale €683,864.20; do not retrospectively update without separate approval.
12. Compare PROD/TEST triggers and role policies: PROD has discount-limit and initial_sale triggers missing in TEST; TEST has six RESTRICTIVE probationary policies absent in PROD; `renewal_close_readiness` partner permissions differ (module Renewals Admin vs global partner_admin). Exercise both authorized and denied paths.
13. Check that new financial fields do not create notification, scheduled job, renewal automation, revenue dashboard or lifecycle event regressions.
14. Export a private evidence receipt containing schema/object counts, passed/failed tests, row-level synthetic reconciliation, permission matrix, migration execution hashes, rollback proof, identified gaps and final **GO/NO-GO** for **TEST only**.

### What CI has already established
- GitHub Actions exact draft migration on disposable PostgreSQL 17: applied twice, initial/transitional/future pricing and negative lineage tests green (latest proof run #38175998624).
- Full Git migration replay **cannot** provide a faithful TEST from an empty DB: Aug 11 QA data, Aug 13 last-HQ-Admin cleanup and Aug 20/21 Academy module content preconditions. See `docs/qa/fin02-gate2-schema-replay-investigation-20261011.md`.
- No merge or TEST/PROD database modification as part of these tests.

### Exit requirement
The Gate-2 reviewer must produce a written evidence report. Only then consider a separate, explicit authorization to deploy to **TEST**. PROD remains a separate release requiring commercial signoff, backup, rollback and data reconciliation.

**Do not claim FIN-02 structurally certified from green synthetic CI alone.**
