# PartnerOS · R1 FIN-02 — release readiness / TEST hold point
**12 October 2026 — Decision: NO-GO for live TEST; candidate pack ready for offline review.**
No SQL migrations, data fixes, sync to Lovable, Vercel deploy or merge have been performed against TEST or PROD as part of this release pack.

## Scope and source of truth
- DRAFT stacked PR [#34](https://github.com/vitormc88/ManWinWin.PartnerOs/pull/34), based on PR #31 (dependent on #28); master issue [#29](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/29).
- The four SQL migrations are **TEST-specific** and stay in `supabase/migrations/`: SEC35 `20261012000100`, SEC36 `20261012000200`, FIN37 `20261012000300`, SEC38 `20261012000400`.
- Corresponding **manual, guarded rollbacks** in `tests/sql/fin02/rollbacks/` (outside autodeploy migration paths). They are not safe automatic deployment actions.
- SQL migration order 35 → 36 → 37 → 38. For a permitted manual restoration, technical reverse order 38 → 37 → 36 → 35, subject to a separate incident decision; do **not** automatically revert known security fixes.
- Existing source documentation: [migration analysis and rollback plan](fin02-four-independent-migrations-test-rollback-20261012.md) and [Gate 3 E2E report](fin02-gate3-isolated-financial-e2e-report-20261011.md).

## What the isolated lab demonstrated
1. FIN-02 source patch and four actual forward migrations compile and run against PostgreSQL 17 with reconstructed TEST-derived financial schema, TEST-derived RLS and permission helpers, synthetic identity profiles, and original award/renewal RPC implementations.
2. Initial commercial award €1,608; first and second annual renewal €570 each; Web temporary discount expires; S&TA remains 17% of gross eligible software value; two concurrent award attempts deduplicate; deliberately forced failure after initial ledger posting atomically rolls back.
3. View-only Partner Sales cannot directly write Clients, Licenses, Contracts and Renewals after remediation; HQ and correctly authorised partner cases remain in the tested access matrix. Canonical partner visibility works for awarded License, Contract and Renewal; other partner stays excluded.
4. Eleven targeted RLS policy predicates recover the captured TEST baseline fingerprints on reverse rollback; the initial-sale writer function and trigger are removed; existing initial_sale/renewal commercial-history entries, Clients and two closed Renewals remain present.
5. New `tests/sql/fin02/release_independent_rollback_matrix.sh` independently applies and reverses each migration on separate PostgreSQL databases cloned from **synthetic** baseline. It also asserts that repeat rollback, altered RLS expressions, changed policy roles, changed source function, disabled trigger, incompatible PROD ledger shape and forward-baseline drift are rejected. No cloud credentials or actual customer rows are used.
6. Guard hardening additionally checks expected RLS command, PERMISSIVE mode and `authenticated` role list, not only `USING`/`WITH CHECK` MD5. Transaction-scoped relation locks with 5s timeout protect patch/rollback preflight against concurrent table DDL races. SEC37 verifies exact trigger identity, enablement, event type and UPDATE column set.

## Auditable GitHub Actions evidence
- **Previously fully green** at `cf0c99410116`: [Gate 3 financial E2E + independent negative rollback matrix](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38184964348), plus role integration, real financial column, disposable SQL and pricing gates on the same SHA.
- **Latest lock-hardening candidate**: `3cf8ea8c76b3`, [Gate 3 run 38185052077](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38185052077); the final result must be confirmed before review is considered complete. Never treat green checks for an older SHA as verification of a changed one.
- Negative drift tests deliberately expect SQL errors; a **green** test proves the specific errors were raised and no disallowed rollback succeeded.

## Remaining release risks and explicit signoffs
**Blocking — must resolve before writing even to real TEST:**
- **TEST exactness and recovery:** a complete, isolated restored clone of actual TEST (with full trigger graph, grants, policies, signed Auth behaviours and migration ledger) has not been validated. Historical blank replay is blocked by Academy Module 5 / Module 1 data prerequisites. Review backup, restore, migration history and exact environment/project IDs first.
- **Security approval:** verify all relevant policies (not just 11 changed predicates), RESTRICTIVE policies, grants, service-role bypass paths, identity overrides, partner-to-client foreign-key consistency, notifications and API/PostgREST calls. Validate with real signed TEST role contexts **on the private isolated copy first**.
- **Commercial semantics:** `initial_sale` is an **award event**, not invoiced revenue or received cash. Finance/business must approve dashboards, partner attribution, revenue export semantics and legacy Thai Union reconciliation. No automatic history backfill.
- **Compatibility:** inspect full award/renewal status and contract trigger stack, original FIN02 source-line guard, document/Storage RLS, partner child views, activity logs, outbox and customer acceptance flows. Confirm legitimate direct writes are not unexpectedly blocked. UseIT/compare selected-option policy and historic imported discrepancies remain out of scope.
- **Operational release:** PR #34 is stacked on #31/#28; check cumulative migration order against TEST `supabase_migrations.schema_migrations`. Establish a trusted restore point, maintenance window, observed application metrics, and explicit human go/no-go for each phase. Five-second DDL lock timeout is deliberate: a busy system should stop, not override guards.

**Rollback incident policy:**
- SEC35 / SEC38 technical rollback restores known weaker permissions, so the default after release should be a corrective **forward security patch**, not reopening unauthorised writes.
- SEC36 technical rollback can hide legitimately awarded records from their partners again. Prefer forward repair where practicable.
- FIN37 rollback **only removes the automatic trigger/function**, never deletes ledger entries. Existing transactions, IDs, amount/currency, attribution, two recorded renewal events and history remain. Any duplicate/wrong event requires independently approved accounting reconciliation rather than an implicit DELETE.
- Supabase's migration tracking does not automatically reverse because SQL rollback was manually run. Reconcile `schema_migrations` and author explicit forward recovery before retries; do not replay the same original migration blindly.

## Overall R1 backlog preserved
Open independently of this release: FIN-03 immutable official document evidence; Commercial Memory architecture and historical event model; UX continuity, partner prospect-to-client routing, dashboard consistency; differences between PROD and TEST authorization; complete QA and production go/no-go.

## Proposed next gate (not authorized to execute on live TEST)
1. Obtain and verify a private full TEST recovery copy with no unsanctioned customer exposure.
2. Run read-only full inventory, migration-ledger preflight, authentic role/API and trigger integration in that clone; demonstrate restore from backup.
3. Resolve accounting semantics and security business-signoff, and document any drift or compatibility exception.
4. Only then request **separate explicit approval** for installation in real TEST, never PROD.
