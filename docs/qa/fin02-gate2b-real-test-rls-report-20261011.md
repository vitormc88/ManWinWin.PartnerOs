# FIN-02 — Gate 2B real TEST RLS and RPC entry authorization
**Evidence date: 2026-10-11 · Status: SOURCE-EXACT POLICY LAB PASS / FULL ORIGINAL-RPC E2E STILL OPEN**
**Run:** [38180211062 — FIN02 Real TEST RLS Role Integration](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38180211062) **SUCCESS**. No cloud database credentials or live data used in GitHub.

## Architecture exercised
- **Eight catalog-derived financial tables**: exact 327 TEST column signatures; all **19 internal and 10 external FK constraints** exercised with narrow synthetic parent tables. This is a *scoped financial dependency graph*, not a full dump of TEST.
- **36 actual TEST financial RLS policies**, including **six RESTRICTIVE probationary rules**, installed *unchanged* on isolated PostgreSQL 17.
- **17 actual TEST permission helper function bodies**, preserving SECURITY DEFINER SQL: `has_role`, `is_hq_user`, `has_module_access`, `get_effective_permissions`, `get_user_partner_id`, `can_manage_client`, proposal-source helpers and probationary helpers. `app_role` enum values match TEST.
- TEST module role template values for Clients/Renewals read-only captured (18 records, no real user profiles).
- Synthetic IDs only: 2 partners and 7 user profiles (HQ Admin, HQ Standard, partner A Admin, partner A Sales, partner B Admin, partner A Connector/probationary, overridden HQ Standard).
- Auth simulation is `auth.uid()` reading an explicitly set synthetic session claim `request.jwt.claim.sub`. **Not** real Supabase Auth cryptographic/JWT verification.
- Original **actual** award and renewal SQL definitions from PROD/TEST (previously proven identical in body pre-FIN02); PR #34 migration applied to them. Negative and early-fail paths executed using the real function bodies and role helpers.

## Proved with runnable SQL, no real records
| Scenario | Result |
|---|---|
| HQ Admin & HQ Standard can read financial records for both synthetic partners | PASS |
| Partner A/B Admin see only own partner's eight financial record types | PASS |
| Partner Sales can read own client data without seeing the other partner | PASS |
| Probationary Connector denied all eight financial record types | PASS |
| Anonymous denied all financial rows when SELECT GRANT exists (proposal/items are not granted to anon) | PASS |
| Partner Admin A cannot update Partner B client | PASS |
| Actual `award_deal_proposal`: anon, Sales(view only), Partner B foreign deal, and HQ Standard downgraded to view denied | PASS |
| Actual award routine: HQ Admin and own Partner Admin passed authorization, then deliberately failed on a mismatched proposal source before any write | PASS |
| Actual `close_renewal_core`: unauthorized Partner B and Sales, plus downgraded HQ Standard, denied | PASS |
| No client/license/contract-line/renewal side-effects from negative path tests | PASS |
| Full successful original atomic award, Won state, ledger event and 1st/2nd renewal | **NOT RUN / Gate 3** |
| Real Supabase-signed identity/JWT and complete role grants + all app triggers | **NOT RUN / integration limitation** |

### Security finding SEC-01 — Client module permissions bypassed by TEST policies
The **unchanged** TEST `clients_insert` and `clients_update` policies allow a partner user to write their own partner's client without checking whether `has_module_access('clients','edit')` is true.
- `partner_sales` has clients:view and *not* edit in actual TEST templates, yet direct RLS `INSERT` and `UPDATE` **succeed** with synthetic rows.
- HQ Standard role default is clients:edit. A synthetic per-user override downgrades the effective access to clients:view, but direct TEST RLS UPDATE **still succeeds** because `is_hq_user` bypasses the module level.
- Existing PROD policy definitions **already require** clients:edit, so this is a real TEST/PROD security drift. Do not blindly replace entire PROD policy in TEST: TEST has legacy partner_id and separate probationary restrictive policy semantics.
- [Dedicated issue #35](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/35).
- **Lab-only** correction candidate: `rls_clients_write_permission_candidate.sql` adds edit threshold to TEST's existing ownership predicates. The separate candidate tests **PASS**: Sales and downgraded HQ cannot INSERT/UPDATE; valid HQ Standard and Partner Admin retain authorized updates, partner-crossing and probation remain denied.
- **The candidate was never applied to live TEST or PROD**, nor merged/deployed. Design/security approval and full role negative tests still required before deployment.

### False-positive correctly eliminated
Originally anticipated exposure of contracts to a probationary partner because `contracts` lacks an explicit probationary policy. Actual test demonstrated **no exposure**: `contracts_select` subquery passes through restrictive `clients` RLS and denies visibility. The test expectation was corrected rather than adding an unnecessary new policy.

## Important limitations/remaining gates
1. Full successful `award_deal_proposal` → synthetic Client/License/Contract/Renewal and complete `close_renewal_core` execution still needs additional real dependent tables, side-effect triggers, original grants and synthetic data suitable for ALL transactional paths. Denied-entry tests are real routine execution, not positive E2E.
2. Synthetic session claim `auth.uid` is *not* Supabase Auth verified JWT, OAuth, login, invitation or revocation test. No cloud authentication or external email/notification operations were simulated.
3. No literal customers, permissions/users, access tokens, API keys, invoices or production records were copied to GitHub. Zero TEST/PROD writes.
4. `SEC-01` fixes require separate authorization; PR #34 cannot be considered deployable while financial auth drift is unresolved.
5. FIN02's first-sale revenue history gap, compare KeepIT/UseIT selected-option frozen snapshot, FIN03 immutable documents and the R1 lifecycle/UX queue stay open.

## Work products
- `.github/workflows/fin02-real-test-rls.yml`
- `tests/sql/fin02/rls_support_schema.sql` (10 exact external FK dependencies + minimal synthetic identity graph)
- `tests/sql/fin02/rls_real_test_helpers.sql` (17 original helper bodies)
- `tests/sql/fin02/real_test_rls_policies_reference.sql` (36 original RLS policies)
- `tests/sql/fin02/rls_synthetic_financial_roles_and_data.sql` (source-derived access templates, synthetic people/partners)
- `tests/sql/fin02/rls_access_matrix_assertions.sql` (original policy read/write negative/positive)
- `tests/sql/fin02/rls_actual_financial_rpc_negative_assertions.sql` (original financial RPC negative/early-fail)
- `tests/sql/fin02/rls_clients_write_permission_candidate*.sql` (proposed lab-only fix and regression tests)

**Release status: DO NOT MERGE / DO NOT DEPLOY TEST OR PROD.** Scope-limited Gate 2B policy and entry-authorization lab is passing; full operational E2E and production-grade authentication remain unproven.
