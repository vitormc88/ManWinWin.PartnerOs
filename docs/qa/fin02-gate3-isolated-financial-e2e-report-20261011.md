# FIN-02 — Gate 3 Financial E2E / concurrency / rollback evidence
**2026-10-11 | SOURCE-BASED ISOLATED CI PASS / LIVE TEST NOT DEPLOYED**

## Execution receipts
- **[GitHub Actions FIN02 Gate3 run #38182461822 — SUCCESS](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182461822)** — commit `d58c244e13122fefaf71b787d9c0d01d2d8eabac`.
- Same commit: [Disposable SQL #38182461840](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182461840), [catalog-backed SQL #38182461800](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182461800), [TEST RLS matrix #38182461870](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182461870) and [TypeScript/pricing #38182461821](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182461821) **SUCCESS**.
- PostgreSQL 17 on temporary GitHub Actions container; synthetic identities, source rows and financial values. No Supabase project links, Auth secrets, credentials, customer records, real email or side-effect jobs. No TEST/PROD writes, migrations, merges or deployments.

## Exact components used, and explicit exceptions
- Real TEST-backed **eight financial table schemas**, all 327 source column signatures, all 19 internal and ten scoped foreign keys, plus four TEST-defined lifecycle/revenue/renewal-activities tables with exact checks/relationships.
- TEST's 36 finance-table RLS policies, 14 additional revenue/activities/lifecycle policies and 17 TEST SQL permission functions; fake JWT sub claim and role templates, **not real signed JWT verification**.
- Actual unchanged `award_deal_proposal`, `close_renewal_core` and **official `close_renewal` wrapper**, `renewal_close_readiness`, `workflow_violation`, real enforced `renewal_workflow_settings`, source financial helper functions, and PR #34 FIN02 migration.
- Original TEST `renewal_closure_record_revenue`, `contract_lines_refresh_total`, `contracts_refresh_total`, `deals_track_status_change`, `phase1b_guard_client_hq_direct`, `phase1b_guard_revenue_partner`, `proposals_status_guard`, `renewals_terminal_guard`, `renewals_guard_closed` triggers. **Not every original TEST trigger is installed**; particularly fingerprint/terms-check, other task cleanup and external notification processes remain in release gates.
- **Two intentionally lab-only policy/feature overlays are essential for green Gate3**:
  1. The TEST-compatible first-sale ledger candidate `gate3_initial_sale_lab_candidate_and_revenue_triggers.sql`, because live TEST has NO initial-sale trigger and PROD's uses a `source_deal_id` history column absent TEST. Track [#37](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/37).
  2. RLS SELECT policy candidate `gate3_partner_canonical_read_rls_candidate.sql` for `licenses`, `contracts`, `renewals`, because the award RPC writes `partner_uuid` without legacy `partner_id`, and current TEST RLS would hide its own newly created objects. The **unmodified TEST denial is reproduced and asserted before applying this lab-only overlay**; cross-partner denial after applying is also asserted. Track [#36](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/36).
- The independent [Clients write-permission vulnerability #35](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/35) remains unfixed in live TEST. Its lab-only candidate is tested by Gate2B, but **not silently promoted to the live Gate3 source model**.

## Functional end-to-end case (fictional Business KeepIT)
| Source item | Year-1 gross | Year-1 discount | Year-1 net | Recurring next period |
|---|---:|---:|---:|---:|
| Perpetual Core License | €1,000 | €0 | €1,000 | €0 |
| Web access annual | €400 | €12 (3%, expires) | €388 | €400 |
| S&TA annual | €170 (17% of €1,000 gross license) | €0 | €170 | €170 |
| One-time implementation | €50 | €0 | €50 | €0 |
| **TOTAL** | **€1,620** | **€12** | **€1,608** | **€570** |

### Stages confirmed by executed SQL
1. Reject +€100/-€100 offsetting source-line tampering **after temporary client insertion**, then verify the transaction left zero Client/License/Revenue orphans.
2. **Original** award RPC returns new client, license, contract and first renewal; Deal and Proposal become Won; four contract lines source-linked, total €1,608; Web line first-period €388 but frozen next-cycle €400; recurring estimate €570; original partner, IDs and license model preserved. On immediate retry, return `already_awarded=true`, no duplicate client/license/initial_sale.
3. Dedicated test first proves **original current TEST RLS hides fresh canonical-UUID-only License/Contract/Renewal** from its owning partner, despite Client visibility. Sandbox-only SELECT policy overlay then makes all three visible to owner while different partner stays denied.
4. **Official** `close_renewal` under enforced TEST workflow rejects a renewal proposal still **Ready without acceptance evidence**. Then a synthetic fixture is marked **Accepted with acceptance date/type** under the test-only prevalidated marker; this simulates existing evidence, **not** real electronic acceptance or document delivery.
5. First 2027 closure through the real official wrapper after acceptance: recurring €570, one-time €0, Web upgraded from €388 first-year net to €400 after discount expiry, S&TA €170; one 2027 renewal ledger entry €570, exactly one 2028 upcoming renewal; original historical Web €388 / future €400 preserved in the closure snapshot. Retry `already_closed=true`, no duplicate event or next cycle.
6. Second 2028 closure through official wrapper: recurring €570, one-time €0, single 2029 future renewal, exactly two `renewal` ledger entries and two renewal lifecycle events; no €50 implementation replay or expired discount reinstatement.
7. Independent **two-session first award concurrency**, both waiting for a coordinator-held row lock: one returns `already_awarded=false`, other `true`; exactly one Client, License, Contract, ContractLine, Renewal, `initial_sale` and proposal-won event. Both transactions committed.
8. Independent forced **AFTER-WON failure after the lab initial-sale ledger trigger inserted the movement**: verifies the whole call rolls back Client/License/Contract/Renewal/Deal-Won/Proposal-Won/Lifecycle/Revenue, with no manual cleanup or partial row.
9. Verified final main fictional case ledger: one `initial_sale` of €1,608 and **two** `renewal` entries of €570 each (total €1,140).

## Scope: laboratory gate accomplished vs release readiness
**Gate3-Green (strictly defined):** successful TEST-source-based financial RPC workflow, scoped business guard triggers and policy suite, full source-line reconciliation, ledger-with-candidate, first/second renewal, historical snapshots, retry, concurrent first-award and deep transactional rollback. Repeatable CI, no Work/Lovable credits and no local Docker Desktop.

**Still NOT proven / must not claim PROD or TEST deploy-ready:**
- Complete TEST trigger stack and deferred proposal terms/fingerprint enforcement (e.g. `proposals_capture_fingerprint`, `proposal_terms_check_trg`, `renewals_closure_cleanup`, partner totals, external jobs). Only selected triggers present; no cloud email, notifications or CRM/billing integration.
- Original online Proposal Validate → Sent → Accepted evidence/document flow and real JWT/auth session/revocation. Evidence was a synthetic accepted fixture validated **by the official close wrapper**, not a real customer acceptance.
- Approved remediation for **three independently tracked release blockers** [#35](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/35), [#36](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/36), [#37](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/37). The current live TEST would *not* pass all positive Gate3 cases because #36 and #37 remain.
- Legacy imported records, cross-year partial licenses, comparison KeepIT/UseIT selected-option frozen source, persisted original approved documents (FIN03), historic Thai Union revenue backfill and Commercial Memory.
- An authorized TEST deployment rehearsal, external integrations, full rollback and data-history reconciliation; no PROD changes.

## Exit and recommendation
**Gate 3 isolated financial laboratory PASS**, but **release GO/NO-GO remains NO-GO**. Resolve/approve the two lab-only bridges as real security+ledger migrations and #35 Clients authorization remediation with rollback, then repeat the complete Gate3 suite on source-complete TEST clone including missing triggers and finally on live TEST after separately authorized deployment. Keep original R1 master issue #29 and FIN03/Commercial Memory scope visible.

Workflow: `.github/workflows/fin02-gate3-financial-e2e.yml`. SQL fixtures in `tests/sql/fin02/gate3_*.sql`, including `gate3_run_concurrent_awards.sh`. All data and user identities are synthetic.

## Addendum — source-exact financial table write authorization
**Gate2B deepened during Gate3 review, isolated PostgreSQL only.** Read-only original TEST policy and authenticated-grant inspection plus execution on **synthetic legacy-partner fixtures** confirm a `partner_sales` account with `clients:view` and `renewals:no_access` can UPDATE its own existing License, Contract and Renewal rows directly at the table RLS boundary. Existing TEST rules only restrict by partner, not required effective module edit. Cross-partner writes remain denied. **This demonstrates a database RLS policy exposure, not an actual write to cloud TEST and not a complete HTTP/app/trigger bypass demonstration.**

- **Original policy reproduction:** [GitHub Gate2B #38182817031](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182817031).
- **Candidate only:** `tests/sql/fin02/rls_financial_write_permission_candidate.sql` and its `_assertions.sql`: `can_manage_client` for Contracts/Licenses DML; `renewals:edit` plus canonical UUID/validated legacy partner fallback for direct Renewals DML. No live DB migration. [PASS #38182979368](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38182979368).
- **Approval decision still needed:** partner_admin currently has `renewals:view`, so direct renewal UPDATE is denied under the stricter candidate but the official `close_renewal` SECURITY DEFINER flow remains a separately authorized route. Product owner/security must approve that split, and full original triggers, Auth/JWT, legacy-only data, client permission overrides and rollback need further tests.
- [Security Issue #38](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/38) is a **fourth release blocker** alongside #35, #36 and #37. The initial isolated Gate3 PASS remains valid **under lab-only overlays**, and is **not** a PROD/TEST deployment approval.
