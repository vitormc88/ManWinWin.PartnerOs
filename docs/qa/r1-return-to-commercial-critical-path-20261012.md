# PartnerOS R1 — Return to the commercial critical path
**2026-10-12 | Review/lab only | No live DB writes, merges or deploys**

## Decision and dependency
The original commercial journey is Pricing -> persisted proposal -> award -> Client/License/Contract -> initial sale -> renewals -> official immutable documents -> complete negative E2E.

Customer Explorer is NOT a step of an adjudication. Source-table triggers may run when a Client is created, so they belong to an integration-safety check, but building the financial R1 must not wait for rollout of a new Explorer architecture.

OPS-01 Issue #40 owns synchronization behavior; Issue #42 owns scheduler, freshness/alerts and safe retries. Both remain open as independent reliability work. Do not silently disable or replace source triggers in live TEST.

## Original user workstreams retained

| Workstream | Completed/code evidence | Still required |
|---|---|---|
| F0 — Diagnosis | Original Thai Union mismatch localized (historical gross proposal lines vs net contracted values) | Preserve exact historic commercial provenance; no automatic backfill |
| FIN-01 — Pricing Business | Draft PR #28 saves discounts and renewal flags per line, preserves gross-base 17% KeepIT S&TA; new pricing→award seam test PASS | Atomic Draft storage verification, permission/failure tests, code review, authorized TEST integration |
| FIN-02 — Contract/Renewal | Draft PR #31 builds on #28; Draft PR #34 on #31 adds backend guard and next-cycle price, isolated security/financial E2E, four SEC35–38 migrations and rollbacks | Legacy policy and discounts expiry; KeepIT/UseIT selected-option snapshot; faithful original TEST/Auth/trigger review, approved TEST installation and full E2E |
| FIN-03 — Documents | Draft PR #32 based on #28 guards DOCX/PDF against unsaved configuration/pricing drift | Immutable versioned snapshots, append-only archive, RLS, document E2E; reconcile PR #32 sibling branch with FIN02 stack later |
| MEM-01 — Commercial Memory | RFC 0 and source map | Permissions/UX/architecture decision and implementation |
| OPS-01 — Reliability | Explorer race reproduced and isolated async queue Gate4C passed | #40, #42 monitoring, alerts, scheduler, security, rollback; not a blanket stop on FIN01–03 development |
| UX-01 — Simplification | UX friction identified | Role-based redesign and validation |
| QA-01 — E2E | Thai Union scenario identified and previous manual corrections logged; synthetic finance Gate3 pass | Repeat full 2026→2028 journey with NO manual fixes, role negatives, docs, retries and production-like integration |

## New FIN01→FIN02 seam result (2026-10-12)
The new test src/lib/__tests__/r1-pricing-to-award-seam.test.ts invokes actual FIN01 buildBusinessProposalItemRows, assertBusinessProposalTotals and actual FIN02 businessAwardIntegrityBlocker together. It uses wholly fictitious pricing rows and simulated saved source IDs.

It verifies:
- Thai Union gross 714,761.00; discounts 30,896.80; Year1 net 683,864.20.
- Renewable 3% Web discount yields Year2+ 393,018.20; expiring Web discount yields Year2+ 403,811.00.
- 0% discount, gross-base KeepIT S&TA 43,451; offsetting +100/-100 price alteration, missing source IDs, original gross-only bug and unsnapshotted KeepIT/UseIT comparison all fail closed.
- GitHub Actions Business pricing integrity R1 #38244149402: SUCCESS, including the seam tests and TypeScript. All 11 workflows at tested SHA 57c09dc38ad91bd445081369821a01d4e3fd3288 passed. Pure seam testing is NOT a DB persistence integration.

## New FIN01/QA source risk, issue #43
Read-only CreateProposalDialog source inspection found a Deal/Client Draft save writes header, deletes prior proposal_items and reinserts item rows via separate Supabase requests. There is no client-side encompassing DB transaction. Mid-sequence error therefore presents a plausible partial-Draft risk (NOT proven in actual TEST). The renewal path uses a distinct atomic save_renewal_proposal RPC. Issue #43 tracks exact DB-source guard review, negative transaction/permission tests, potential atomic save RPC and QA-01 hands-off validation before FIN01 release approval.

## Release topology and priorities
1. PR #28 FIN01 -> PR #31 FIN02 -> PR #34 FIN02 backend form a dependency stack. All OPEN DRAFT, unmerged.
2. PR #32 FIN03 is a sibling based on PR #28, not automatically included in the FIN02 stack. Reconcile it only after approved financial data-model integration; no unauthorized rebase.
3. First: FIN01 persistence atomicity/role/failure tests (#43) and readiness to approve a controlled TEST deployment.
4. Then: FIN02 temporary-vs-recurring discounts, KeepIT/UseIT frozen award option, original backend/RLS/ledger TEST preflight (#39 remains full DB restore blocker to actual release), 2027 and 2028 renewals.
5. Next FIN03 immutable priced documents, then QA01 complete Thai Union with no manual SQL or data edits.
6. Maintain MEM01/OPS01/UX01 as explicit workstreams, separately tracked. OPS must still pass Client-write side-effect safety before any real TEST change. Safety integration remains mandatory; new asynchronous Explorer deployment is not a prerequisite for writing financial code.

**No live TEST/PROD changes, no PR merges, no deployment, no Lovable/Work credits. PR #34 remains Draft.**

References: master #29; FIN01 PR #28; FIN02 PRs #31/#34; FIN03 PR #32; Explorer #40/#42; Draft persistence #43; full private restore #39; Explorer numeric-only product choice #41.
