# PartnerOS R1 FIN-01 — PR #28 small TEST candidate / review decision
**12 October 2026 | Code-only / Draft review | no automatic TEST or PROD changes**

## Exact problem demonstrated in original Work audit
Current Business engine already computes discounts and a correct net quote, but old save serializer persisted **gross**, zero-discount `proposal_items`. The Work-run fictional Thai Union comparison found a €30,896.80 Year1 discrepancy: 23 gross source lines (€714,761) vs net proposal €683,864.20; subsequent accepted award/renewal required manual source/contract edits. That historical Won record is **not** authorized for rewrite.

## PR #28 — smallest repair only
- Four original changed files: `CreateProposalDialog.tsx`, pure `proposal-business-persistence.ts`, direct tests, dedicated CI workflow.
- The calculator `proposal-business-engine.ts` is **unchanged**. The wizard now builds `proposal_items` from original engine values: gross, net, discount type/pct/amount and `apply_discount_to_renewal`; the proposal header `discount_amount` is the sum of saved line discounts. A pre-save check matches exact Year1 and next-cycle numbers. The gross-base KeepIT 17% S&TA commercial rule stays unchanged.
- Focused review addition: one **UseIT** test covering Year1-only 5% software discount, recurring API 2% discount, service 10% discount, and Year2+ distinction. This closes a narrow coverage gap without another module.
- CI now additionally runs **`npm run build`** after targeted financial Vitest and `tsc`, to prove that this actual UI integration bundles. No migrations, no DB or role writes, no external emails.
- PR #28 must remain independent from nested PR #31/#34, which tackle the separate award source/renewal and permissions problems. FIN-03 #32 is a sibling and not part of this rollout.

## TEST source compatibility inspected read-only
- On actual Lovable TEST: `proposals.discount_amount`, `total_year_1`, `total_recurring`, `business_config` exist; `proposal_items` fields `gross_total`, `net_total`, `discount_amount`, `discount_type`, `discount_value`, `apply_discount_to_renewal`, `is_recurring`, `item_code`, `frequency` and required item metadata exist with compatible SQL data types.
- TEST has a deferred `proposal_terms_check` protecting approved commercial versions; for Draft it exits early. That is **not** an atomic transaction across frontend calls.
- The current Deal/Client Draft save still sends separate header update/insert, optional delete of previous items, item insertion, and best-effort Deal expected_value update. A failed second/third request can leave partial Draft data; [#43](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/43) remains open and **is not fixed by PR #28**.
- In current pre-FIN02 conversion UI, an amount field is editable and the award RPC relies on a separate supplied line payload. Consequently **PR #28 is NOT sufficient approval for Business adjudication/renewals**; hold conversion/award pending source and role checks from FIN02 #31/#34. This is a hard boundary for first smoke scope, not a request to rebuild pricing.
- Current Lovable TEST project Git source `main` and GitHub `main` both point to `6f35fa152fd07d9fc301daf51b523ad9c7e91209`. Vercel `get_project(partner-nexus-hub-90)` read-only metadata confirms project domains include **`partneros.manwinwin.com`** and the `partner-nexus-hub-90` aliases. Merging PR #28 into `main` may therefore trigger linked Lovable/Vercel deployments, **potentially exposing production-facing traffic**. The metadata alone does NOT prove a particular promotion trigger fires on each merge. Treat merge as a **deployment-affecting action**, not merely an internal code review; verify environment/git branch aliases before authorizing any merge. Obtain explicit owner approval **before merge** and confirm which preview/production targets the connected pipelines affect.

## Release checks (do not overclaim)
- [x] Source diff isolated and reviewed (no calculator changes).
- [x] Original financial serializer Vitest and TypeScript CI successful at old PR head `87b75d22ed460a4a967f92da4f031759dc5872ee`.
- [x] Exact TEST required column types and existing lifecycle triggers verified **READ ONLY**.
- [x] Small UseIT direct serialization regression added, targeted Vite bundle job staged on PR #28.
- [ ] **Latest head** targeted Vitest + `tsc` + Vite bundle green, with exact tested SHA recorded.
- [ ] Owner authorizes an actual **TEST-only promotion** after verifying GitHub main→Lovable/Vercel automatic deployment impact; this document does not authorize merge.
- [ ] With consent, create/use ONE synthetic Deal in TEST and save a Business KeepIT Draft. Verify header `total_year_1`, `total_recurring`, `discount_amount` and per-line `gross_total`, `net_total`, percentages and `apply_discount_to_renewal`. Open/reload same Draft and compare exact rows; test temporary Web flag on another clean Draft revision if possible. Then run separate UseIT source save and verify annual discount is first-year-only.
- [ ] Never touch original Won Thai Union or true customer deals. Do **NOT** run Award & Convert, create license/contract, send documents or close renewals as part of this limited FIN-01 QA.
- [ ] If write fails, do not manually patch records; capture first error, affected synthetic IDs, saved rows, then stop. No delete/cleanup without a reviewed plan.

## Safe return / rollback
1. Preflight: capture exact current main SHA, staged CI SHA, target environment and GitHub→Lovable/Vercel release hooks. No credentials in GitHub PR.
2. If promotion later approved, use one narrow PR merge. No FIN02 migrations, no unrelated refactors or PRODUCTION financial DB writes.
3. If failure, stop synthetic activity, preserve any partially saved Draft for forensic comparison (not customer data). Revert the narrow Git release commit or use a reviewed patch, **after checking automatic redeploy impacts**. Do not silently reverse previously saved financial discounts; rollback code does not undo committed database writes.
4. No automatic historical proposal reconciliation or backfill. Continue to FIN02 only after FIN01 Draft smoke is accepted.

## Recommendation
**Conditional GO for a limited Business Draft save TEST smoke after CI and explicit promotion approval; NO-GO for full R1 adjudication certification, FIN02/FIN03 deploy or PROD.** The remaining risk is the separate non-atomic Draft path and downstream editable award; do not expand PR #28 to cover either. Keep focus on the original Work findings and the minimal viable correction.
