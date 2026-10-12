# FIN-02 — Four independent migrations, compatibility and rollback plan
**12 October 2026 · STATUS: DRAFT ON PR #34 · GitHub disposable CI PASS · LIVE TEST/PROD UNCHANGED**

## Release scope / decision record
A complete FIN02 financial lifecycle test passed in isolated PostgreSQL 17, including original award, official accepted-renewal closure twice, source-linked Year1/next-cycle pricing, commercial first-sale event, two independent renewal events, simultaneous award retries and forced late rollback. The scoped lab still does **not** recreate all Supabase Auth, notifications, revenue aggregations, fingerprinting, document evidence or TEST triggers.

In the original TEST state, RLS/ledger discrepancies #35, #36, #37 and #38 make the full positive E2E fail or allow incorrect direct table access. The four implementation candidates are now **separate additive, transactional SQL migrations**, each with its own guarded rollback. Their paths are deliberately in a **feature branch only**, not merged into main or deployed.

### 1. SEC35 — Client write permissions
- Migration: `supabase/migrations/20261012000100_fin02_sec35_clients_write_policy.sql`.
- Original TEST weakness: `partner_sales` (`clients:view`) and downgraded HQ Standard could INSERT/UPDATE Clients.
- Effect: require **effective** `clients:edit`; HQ or canonical partner `partner_uuid`, falling back to validated legacy UUID only if canonical is null. Malformed legacy ID returns NULL through explicit `CASE`, **never a raw unchecked cast**.
- Regression: exact TEST policy baseline demonstrates prior unauthorized behavior; patched synthetic Partner Sales/HQ-downgrade denied, valid HQ/Partner Admin retained, other partner and probation denied. Malformed legacy partner ID denied.
- Rollback: `tests/sql/fin02/rollbacks/sec35_clients_write_policy.rollback.sql`, guarded by the deployed definition fingerprints and restoring the two original TEST policies.
- Compatibility: can affect direct integrations or workflows that wrote Clients with only VIEW module permission. That access is precisely what is being eliminated; inspect authorized external API routes before TEST deploy.

### 2. SEC36 — Canonical partner visibility
- Migration: `supabase/migrations/20261012000200_fin02_sec36_canonical_partner_reads.sql`.
- Original TEST weakness: after award, partner-owned License, Contract and Upcoming Renewal use `partner_uuid` but SELECT rules only check old text `partner_id`. Owner sees Client but not related financial assets.
- Effect: prioritize canonical `partner_uuid` with validated legacy-only fallback on `licenses_select`, `contracts_select` and `renewals_select`. Keep HQ/partner manager access behavior and all existing restrictive policies.
- Regression: original TEST invisibility reproduced before applying; after migration owner sees all three and other partner sees none. Malformed legacy partner ID does not grant access or fail with a UUID cast.
- Rollback: `tests/sql/fin02/rollbacks/sec36_canonical_partner_reads.rollback.sql`, guarded and restored to original TEST policy fingerprints.
- Compatibility: related `renewal_activities`, other legacy child tables, document storage access and partner-scoped alerts remain **outside this migration** and need follow-up visibility/authorization testing.

### 3. SEC37 — Initial commercial award history
- Migration: `supabase/migrations/20261012000300_fin02_sec37_initial_sale_ledger.sql`.
- Original TEST weakness: new awarded Deal did not create initial_sale history, even though renewal closure posted later recurrence. PROD uses a different historical schema and trigger; copying it into TEST would be unsafe.
- Effect: for actual `Won` Deal→Client conversion with coherent source Deal/Proposal/Contract/License, valid positive Year1 and reconciled source contract lines, insert **one** `initial_sale` commercial event. Use TEST's unique `(client_id,source_reference)` for deal-specific idempotency, preserve source proposal/contract/currency/partner. Reject conflicting duplicate provenance and ambiguous imported legacy initial sales. No invoice/payment/cash recognition is implied.
- Explicit **PROD fail-closed gate**: blocks if `client_revenue_history.source_deal_id` or PROD's `zz_deal_award_record_revenue` trigger exists. No historic backfill or client records modified by the migration.
- Regression: one initial €1,608 plus 2027/2028 renewals €570 each; no double award in two concurrent sessions, no double initial sale, forced exception AFTER Won rolls back every related row. Original TEST revenue partner guard is present in lab.
- Rollback: `tests/sql/fin02/rollbacks/sec37_initial_sale_ledger.rollback.sql` checks source function/trigger signatures then disables the automatic writer. **Never deletes historic revenue rows**. Restoring the original absence of the writer would reintroduce missed initial-sale events; operational remedy after publication should usually be a forward fix.
- Open business decision: distinguish a commercial award event from revenue recognized by accounting, customer PO, invoice and money collected; define export/dashboard semantics and optional historical reconciliation.

### 4. SEC38 — License/Contract/Renewal direct writes
- Migration: `supabase/migrations/20261012000400_fin02_sec38_financial_write_policy.sql`.
- Original TEST weakness: Partner Sales with `clients:view` and `renewals:no_access` can directly UPDATE its own legacy partner's financial rows.
- Effect: `licenses/contracts` INSERT/UPDATE require source-compatible `can_manage_client(client_id)`, including effective Clients Edit. Renewal direct writes require explicit `renewals:edit` plus HQ or the own canonical/valid legacy partner.
- Regression: direct Partner Sales INSERT/UPDATE denied; HQ Standard and authorized Partner Admin can edit own licenses/contracts; Partner Admin with `renewals:view` is denied **direct UPDATE**, but still closes renewals through the separately authorized official SECURITY DEFINER `close_renewal` wrapper. Other partner, probation and client permission overrides fail closed.
- Rollback: `tests/sql/fin02/rollbacks/sec38_financial_write_policy.rollback.sql` restores six prior policies only when all six patched hashes match.
- Compatibility: inspect modules, API call sites and custom triggers making direct renewal writes on behalf of Partner Admin; do not confuse DML with official transactional close.

## Technical guarantees and limitations
- All four forward migrations are independent PostgreSQL transactions, with `lock_timeout='5s'` and preflight, and **no DML to existing business/customer rows**. #35/#36/#38 require matching exact read-only original TEST `pg_policies` hashes. #37 requires exact TEST ledger columns, source-reference unique constraint, partner-integrity trigger and absence of PROD shape/old writer.
- All four rollback scripts are separate from `supabase/migrations`, guarded against later predicate/function edits. Reverse order **38→37→36→35** was executed in ephemeral CI; original 11 RLS policy fingerprints restored and original synthetic commercial ledger/history preserved.
- *Rollback is not automatically a safe business decision*: three security rollbacks reinstate known weak permissions. Prefer forward remediation after live release when possible. No rollback alters actual historical financial amounts.
- There are **no PROD/TEST credentials, client files, Auth users or live customer rows in CI**. Supabase Auth cryptographic token validity, Storage, realtime, mail/Resend, imports, external accounting and the full live trigger stack are not tested.
- No automatic historical backfill of the synthetic Thai Union R1 case, no changes to existing accepted proposals or contracts.
- A migration's TEST preflight failing because current policy/schema changed means **STOP and re-audit**, not bypass/update the expected hash.

## Live-TEST preflight and signoff procedure (pending user approval)
1. Read-only verify TEST environment project ID, policy fingerprints, critical columns, functions, trigger names and actual executed SQL migration list against this package. Freeze a TEST backup/recovery point and choose a maintenance/rollback window. Never run these on PROD.
2. Complete **security review** on #35 and #38 Client/Partner roles and user overrides; review compatibility for direct APIs and complete partner/hq/legacy data. Confirm #36 covers required partner child views/docs. Decide #37 commercial award vs accounting semantics.
3. Run additional denied-authority tests with real TEST signed identities in a **separate isolated TEST clone**, including all original triggers, notifications/accounting integrations, legacy-only and canonical-only records and concurrent security changes.
4. Obtain **explicit separate user authorization** before any SQL write to TEST; apply strictly in order #35→#36→#37→#38; verify source and ledger no duplicates, event ordering, E2E and metrics.
5. If any check fails, stop and assess a forward repair vs the guarded rollback. Confirm full evidence against original R1 checklist and keep PROD deployment as a separate release decision.

## CI evidence
- Full financial workflow: `.github/workflows/fin02-gate3-financial-e2e.yml` (applies **all four forward files** to disposable TEST-schema PostgreSQL, runs official accepted renewals, parallel award and deep rollback, then all **four independent guarded rollbacks** and validates original policy MD5s and preserved revenue rows).
- Access role workflow: `.github/workflows/fin02-real-test-rls.yml` (reproduces original TEST direct-write vulnerabilities; applies **actual forward #35 and #38 SQL** and runs negative+positive role tests).
- Rollback verification: `tests/sql/fin02/release_rollback_integrity_assertions.sql`; invalid legacy guard: `tests/sql/fin02/release_malformed_legacy_guard_assertions.sql`.
- Original Gate3 report: `docs/qa/fin02-gate3-isolated-financial-e2e-report-20261011.md`.
- Parent R1 issue #29; security/revenue work items #35/#36/#37/#38. FIN03 immutable official documents and Commercial Memory remain in the master backlog, independently.

**Status:** approved for source-controlled **review**, not approved for TEST deployment. Final CI SHA/run evidence to be recorded when checks finish.
