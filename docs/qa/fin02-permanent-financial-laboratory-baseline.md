# FIN-02 — Permanent finance laboratory: schema baseline from an existing database
**11 Oct 2026. Proposal. NO access to PROD authorized or executed by this document.**

## Decision: do not let the Academy block FIN-02
A clean replay of all migrations was the wrong requirement for the finance gate: by August the migration history includes data remediations requiring Academy modules, missions, published questions and assets that were entered directly in the live application. Those are not financial dependencies. Fabricating dozens of Academy records would prove nothing about award/renewal behavior.

### Better architecture, two independent laboratories
**Lab A (already operational, fully automated, free of Work/Lovable credits):** GitHub-hosted disposable PostgreSQL 17; apply exact PR #34 migration twice; use 100% synthetic pricing/contract data and test net/gross, next-cycle recurrence, line integrity, provenance, legacy compatibility and tamper resistance. Status **PASS**; does not claim actual TEST RLS/transaction E2E.

**Lab B (to construct):** start from a **current, approved, schema-only** source snapshot instead of replaying decades of application-data maintenance. Restore schema, functions, constraints, triggers, extensions and grants in a fresh isolated Supabase PostgreSQL instance; load only synthetic Deal/Proposal/Client/License/Contract/Renewal data; apply PR #34; execute original award and renewal routines, roles and concurrency/rollback. No Academy content required because FIN-02 does not query its lessons/questions.

### Candidate source: current PROD schema (user suggestion)
- User says Academy Modules 1–5 were populated directly in PROD; an old complete PROD backup used for the Customer Explorer restored only **97 tables/150 functions/308 RLS policies**, whereas audited TEST already had **107 tables/175 functions/344 RLS policies**. The historic file is **not** adequate for current FIN-02 certification.
- **A fresh PROD schema snapshot is a valid starting point**, but not proof of TEST parity. PROD may be ahead in Academy content and behind or different on finance/renewal/permissions; TEST has its own migration drift.
- Prefer **schema-only** over customer-data backup. Academy content need not be copied. Do not upload raw PROD dump or Auth/Vault data to GitHub repositories, artifacts or logs.
- Supabase connection currently exposes PROD, and a catalog-only inventory can be obtained through the read-only SQL API **only after explicit authorization**. The connector does not offer a raw pg_dump/backup download operation.
- Proposed safe metadata inventory: `tests/sql/fin02/read_only_financial_baseline_inventory.sql` (pg_catalog/info_schema only; no customer tables SELECT). It reports eight financial table/constraint/trigger/RLS fingerprints and eight function/grant fingerprints.
- Compare candidate fingerprints with audited TEST snapshot using `tests/sql/fin02/compare_baseline_to_test.py`. A difference does NOT mean PROD is broken; it means it cannot be used unmodified as evidence of TEST parity.
- Schema-only inventory **alone does not recreate a database**. To run the complete original RPCs, one later needs a privately provided actual schema export (or approved extraction of definitions from live catalog), a compatible Supabase local stack and verified role/grant restoration.

## Implemented 11 Oct — financial catalog-backed CI (Lab B, phase 1)
The permanent workflow [`fin02-real-financial-columns.yml`](../../.github/workflows/fin02-real-financial-columns.yml) is **running and green** on GitHub Actions, [proof #38178604346](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38178604346).

**Read-only source reference and isolated construction:**
- `tests/sql/fin02/real_financial_prod_columns.sql`: 320 real PROD catalog column definitions for **eight financial tables**, including types, actual defaults and basic PK/CHECK/UNIQUE constraints; no table contents.
- `tests/sql/fin02/real_financial_test_overlay.sql`: eight TEST-only Deal sync columns; remove one PROD-only Renewal column; retain 19 foreign keys **between those eight tables** and enable RLS. Ten foreign keys to out-of-scope entities (profiles, partners, catalogs etc.) intentionally omitted.
- `tests/sql/fin02/real_financial_test_column_parity.sql`: **PASS** for all 327 TEST table fields compared with TEST's read-only canonical name-sorted column signatures (types, nullability, defaults).
- `tests/sql/fin02/real_schema_assertions.sql`: run synthetic award line/renewal discount/legacy/tamper cases under the 8-table physical column layout and 19 internal FKs.
- `tests/sql/fin02/real_original_award_and_renewal_core.sql`: frozen SQL definitions for **the actual two financial RPC functions**, whose SQL bodies were verified identical in PROD and TEST before FIN02. No user/customer records or secrets; part of this branch only.
- `tests/sql/fin02/real_core_function_patch_assertions.sql`: **PASS**: after applying FIN02 to the original SQL definitions, original authorization, row locks, idempotency and future-price markers remain in the function source. This checks SQL compilation/source preservation, **not executable original-RPC side effects/authorization**.
- Actual PR34 migration applied **twice** in PostgreSQL 17 using a transaction; no cloud DB credentials or external Supabase access in workflow.
- The first real-FK test correctly rejected an orphan synthetic contract line; fixed the synthetic fixture to reference an existing synthetic contract, not the FK constraint. Green rerun [#38178374614](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38178374614).

**Precisely what is still not reproduced:** ten outbound foreign keys, other table definitions, 36 TEST finance-table RLS policies, complete foreign-table/account/roles data, existing triggers/side effects (including differences in PROD discount caps and revenue ledger), and functional execution of the two original RPCs with authorization contexts and all dependent tables. This is **NOT full SQL-GATE-2**. Do not use the words full TEST replica.

The old full-repository migration replay remains **manual-only / blocked by missing Academy seed data**. The new permanent finance-specific workflow does not depend on it.

## Immediate, independent next steps (no Work, Lovable or PROD required)
1. Keep Lab A green and expand SQL negative cases as discovered.
2. Preserve audited TEST financial fingerprints already in GitHub.
3. Prepare all parity queries, integration test scripts, and clone fail-closed criteria.
4. Request explicit authorization **only for read-only PROD metadata**; if authorized, query the connector and compare structure with TEST to see whether a recent PROD baseline is viable.
5. If viable, arrange a **schema-only** export from PROD by an approved method without copying client/customer/auth values. Restore privately, then actual business RPC tests.
6. If financial functions/policies differ, obtain the correct TEST definitions read-only, combine only reviewed delta, retest and mark gaps. Do not label as full TEST clone without proof.

## Forbidden shortcuts
- No PROD migrations/writes/new roles/export of customer data without separate approval.
- No unattended Supabase PROD branch/reset. Branches may omit application data and incur costs.
- No requests for live database admin credentials in chat.
- No fabricated SQL-GATE-2 status from green synthetic tests.
- No weakening last-HQ-admin/RLS checks, or rewriting prior deployed Academy migrations.
- No GitHub-hosted job connecting to PROD without a separately reviewed credential/network/privacy design.

## Decisions/gates
- [x] GitHub synthetic SQL-GATE-1 and TypeScript regression testing.
- [x] TEST structural fingerprints with no private data.
- [x] Candidate schema-only inventory + candidate-vs-TEST comparator staged.
- [ ] Explicit permission for **read-only metadata inspection of PROD**; not authorization for live SQL changes.
- [ ] PROD/TEST scoped financial parity assessed; current PROD backup source verified.
- [ ] Secure schema export/private restore and original FIN-02 RPC & RLS E2E.
- [ ] Independently authorized TEST deployment and later PROD deployment.

**Bottom line:** Academy is a migration-history/seed problem (OPS-02), not a reason to abandon a permanent self-running financial test lab.
