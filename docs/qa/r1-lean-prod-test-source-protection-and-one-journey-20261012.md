# PartnerOS R1 — Lean production protections and ONE financial journey
**12 Oct 2026 | no new product features | isolated original PROD discount-policy replay PASS | original financial source journey PASS | real signed TEST UI E2E OPEN**

## Mandate / stop condition
The target is for a partner to prepare an authorized Business quote and award it, with coherent Client, License, Contract, single initial revenue, approved document and 2027/2028 renewals; **no emergency manual DB repairs**. Stop adding gates or rebuilding pricing formulas. If the normal flow passes in an authorized faithful TEST clone, FIN02 needs no speculative new pricing functionality. Only fix a reproduced issue, with its failing test.

## Source evidence (read-only; no customer records or secrets copied)
1. Existing `main` Business calculator and the PR #34 engine differ **only by a TypeScript import path**, not by calculation logic. The discount policy source is unchanged; the Deno 2 execution of the original shared engine passed its actual runtime parity tests.
2. PROD Supabase `qownzparzsaeoyccgwuj` vs Lovable TEST `avxxzmoayxzrykwqzoqn`: **38 active Business rule codes each; code sets, unit prices, support percentages, currency all match**. Only observed difference in `can_override`: `BUS_KEEPIT_SAT`, `BUS_USEIT_SAT` set true in PROD, false in TEST.
3. The Business engine itself obtains S&TA percentage from `support_percentage`, not the `can_override` flag. Thus these two differences affect administrative override eligibility, not directly the original engine's percentage calculation. A product owner must confirm whether this asymmetry is intentional; do not auto-sync PROD/TEST settings.
4. **PROD ALREADY enforces discount caps**: `public.partner_discount_limits`, enabled `enforce_proposal_discount_limits` on `proposals`, `enforce_proposal_item_discount_limits` on `proposal_items`; supporting private functions `current_proposal_discount_limits`, `enforce_proposal_discount_limits`, `enforce_proposal_item_discount_limits`. These are *not* the similarly purposed but differently named draft functions from migrations_review. TEST currently lacks this limit table and the corresponding enabled source triggers.
5. Source functions return early for `auth.uid() IS NULL` in privileged/system work contexts; use of service-role sources must be audited before any public operation, without assuming a vulnerability from this condition alone.

## Goal A: isolated protection replay — DONE in synthetic PG17, faithful clone still OPEN
- [Existing PROD discount guard source transcribed from READ-ONLY inspected function definitions](../../tests/sql/fin02/prod_discount_source_readonly_replay.sql), run only in [GitHub Actions fictional PostgreSQL17 workflow](../../.github/workflows/r1-prod-discount-source-replay.yml).
- [CI run #38284976555](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38284976555) **SUCCESS**. Fictional role/JWT-claim context proves reseller 15% denied, fixed €20 on €100 denied with 10% cap, fixed €10 accepted, partner-specific 0% override enforced, Implementer service discount 80% allowed while software 15% blocked, authorized HQ 95% allowed, HQ flag without HQ role denied.
- This proves the copied **actual PROD trigger logic** behaves correctly under the synthetic role matrix; it is **NOT** TEST's complete database, true JWT signature or original RLS graph.
- Full user-provided TEST PostgreSQL custom backup was verified **locally**: `partneros-manwinwin_261012 (1).backup`, SHA256 `354dc82cf7063d23a043cabff1cef08aec5ee45e6e8f7f533786b62b5e93da17`. The current container does NOT have `pg_restore`, `psql`, PostgreSQL server or Docker. Its apt package index update timed out. **We have NOT restored this archive to a faithful disposable Supabase-compatible test environment.** Do not publish it to GitHub, send it to a public CI runner, or claim its Auth/RLS/cron/storage integration is restored.
- **Next minimum step (blocked):** obtain an isolated private environment with PostgreSQL restore and relevant Supabase roles/Auth/extensions; securely restore the provided archive, then overlay **the exact existing PROD protection functions and policies**, *not* migrations_review alternatives, with a reversible isolated change plan. No writes to actual TEST/PROD.

## Goal B: one financial end-to-end journey — source SQL PASS, normal APP/UI E2E OPEN
- The existing original-source [FIN02 financial workflow #38284976368](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38284976368) **SUCCESS** on fictional disposable PG17. It already covers a synthetic 2026 Business selected award, exactly one Client, License, Contract, initial revenue €1,608, subsequent 2027 and 2028 renewals of €570 each after a temporary Web discount expires, award retry/concurrency, role and forced rollback negatives. FIN02 Gate5A/5C/5D suites in that pipeline further cover recurring vs first-year-only discounts and source selection.
- **The previous workflow uses SQL and synthetic roles, not a real authenticated partner using current CreateProposalDialog and award UI**. It therefore does NOT close the user's requirement for the *normal application process*. Do not create another synthetic module just to call it a new full E2E.
- **Single final smoke once genuine private clone and authorized actors exist**: log in as test reseller; create synthetic Business comparison and apply permissible Web discount; save it normally and re-open it; select commercially approved KeepIT (and verify comparison can't directly award); review and award via existing conversion; assert exactly 1 new Client+License+Contract and initial revenue; close first 2027 and second 2028 renewals through existing app processes; refresh/retry once and provoke one forbidden other-partner write; verify no duplicate revenue, no overwritten official document and no SQL repair. Actual doc immutability must be evaluated without asserting that a laboratory fake-byte ledger is production functionality.
- If the normal flow fails, isolate the FIRST error and repair only that failing component. If it passes, do not invent further FIN02 development.

## Decision and project horizon
**14/14 GitHub Actions SUCCESS** at tested source SHA `ae11054668248ab76be6a7ed9ae2ceefd7273d63`; adding this report later does not change tested executables. [Original Business Deno run #38277248191](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38277248191) PASS.

| Domain | Status | Practical conclusion |
|---|---|---|
| Pricing engine | Original code unchanged; PROD/TEST monetary catalog equivalent | **Preserve it**, no overhaul |
| PROD discounts | Installed; exact source synthetic role replay PASS | No need to recreate PROD guard |
| TEST discounts | Missing compared with PROD | Align only in private faithful clone, then seek permission for TEST |
| S&TA can_override | Two differences detected | Owner decides intended rule; no silent editing |
| FIN01+FIN02 award/2027/28 | Original-source SQL E2E PASS | User-facing TEST session E2E still OPEN |
| FIN03 docs | Synthetic ledger PASS, real write-once docs not verified | Address only if smoke demonstrates material gap |
| TEST clone #39 | Original backup available, faithful restore NOT executed | **Sole infrastructural blocker to app-authenticated evidence** |
| OPS01 Explorer; MEM01; UX01 | Separate R1 workstreams | Not part of this financial test gate |

### Decision / scope control
- No new pricing schema/features, no new synthetic Gate labels. Single test file + single CI workflow + this factual report.
- No GitHub PR merge; #34 stays OPEN/DRAFT. No actual TEST or PROD writes, no production release, no Lovable paid credits.
- **Overall:** technical regression and PROD-source role guards PASS; actual replica and application E2E **not yet proven**. We will not call the business R1 done prematurely, nor keep expanding it without failing evidence.
