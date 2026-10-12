# PartnerOS R1 — FIN02 Gate5D: Trusted server pricing and discount authority
**12 Oct 2026 | LAB PASS | 13/13 CI workflows green | Real TEST/PROD installation NO-GO**

## The concrete R1 destination
An authorized partner can create and negotiate a correctly priced Business proposal, compare KeepIT and UseIT, obtain legitimate approval, select the customer-accepted option and award it without pricing edits. PartnerOS creates a single Client/License/Contract and initial revenue, archives immutable customer-facing document versions, and closes the 2027 and 2028 renewals without emergency manual SQL repairs. Keep human negotiation, pricing approval and customer acceptance; eliminate manual database interventions.

FIN01/FIN02/FIN03/QA01 form the commercial path. F0, MEM01, OPS01, UX01 remain tracked. Customer Explorer is **separate OPS01 #40/#42** and is NOT a step in award.

## Read-only actual Lovable Cloud TEST findings (12 Oct)
- Actual public.pricing_rules exists and has code, unit_price, support_percentage, active, updated_at, can_override, currency and other attributes. Its RLS SELECT is available to authenticated roles; edits are controlled by HQ Admin. It does NOT expose a dedicated immutable pricing-rule version/history ledger in the inspected columns; updated_at is mutable metadata.
- public.partner_discount_limits table was not present in actual TEST catalog. The corresponding migration is in supabase/migrations_review/ and its comments expressly say it is not installed on Lovable TEST.
- The non-internal triggers on TEST public.proposals and public.proposal_items were inspected: status/terms/fingerprint/author/update guards exist, but the inventory did not show dedicated discount-authorization triggers. A scoped function-name search also did not locate the discount guard/resolver functions referenced by the review-only scripts. Do not conclude blanket safety from browser-side clamps.
- The source policy in src/lib/proposal-discount-policy.ts documents confirmed HQ maximum 100% both kinds; Reseller/unknown 10% software and 10% services; Implementer 10% software and 100% services; HQ-managed partner overrides may tighten/extend either and explicit zero remains zero. These are TECHNICAL MAXIMA, not automatic authorization to make any commercially negotiated offer.
- Real pricing engine also covers derived UseIT, API, SaaS hosting, plugins, modules, country/region implementation, rounding and gross-based KeepIT S&TA. This Gate5D proof does not implement that full business source.

## Code and tests delivered (only Draft PR #34; NOT migrations)
- [LAB-only server source and discount candidate](../../tests/sql/fin02/gate5d_server_catalog_discount_authority_lab.sql): PRIVATE fictional price-book rows not writable by browser roles; server actor resolved from auth.uid/profiles/roles/partner; limit resolver including per-partner override; function to derive BOTH frozen alternatives from trusted source rows and a Ready comparison, then invoke atomic Gate5C freeze. No client-supplied prices/hashes are treated as authoritative.
- [Negative tests and actual financial award](../../tests/sql/fin02/gate5d_server_catalog_discount_authority_assertions.sql): mock reseller software 15% denied against max 10%, unrelated partner denied, default HQ 100/100 / Implementer 10/100 / Reseller 10/10, explicit override 0 denied, frozen pair remains unchanged after price catalog rule changes. Valid selected KeepIT from verified source is awarded via original award_deal_proposal, with unique first revenue and first renewal.
- Mock catalog: KeepIT gross core EUR 1000, Web EUR 400, SAT 17% of core gross EUR 170, implementation EUR 50. Partner software 5%, Web 3% renewal-continuing, services 0%; selected KeepIT Year1 EUR 1558 and next-cycle EUR 558, total discount EUR 62. UseIT annual gross EUR 400, software discount 5% first year EUR 380, next-cycle EUR 400. Entire SQL scenario ROLLBACK at completion, preserving later existing Gate3/5C/rollback tests.
- [FIN02 source-backed Actions #38265861093](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38265861093): **SUCCESS**. [13/13 actions at tested code SHA 6d0b673d1a3f590c057b71bdf50c60c5d6fcc10a](https://github.com/vitormc88/ManWinWin.PartnerOs/actions?query=branch%3Afix%2Ffin02-server-renewal-contract-policy-20261011) pass. Expected ERROR log entries in rollback failure-injection tests are intentional.
- No real TEST/PROD writes, merges, deployments or Lovable/Work credits. PR #34 remains Draft.

## Real-world release blockers, not hidden by green synthetic CI
1. Full actual trusted ManWinWin Business price engine in backend: every supported module/plugin/hosting/UseIT derivation and region/rule version; exact unit/quantity/discount net matching and approved override evidence. Current private source is only a MOCK limited to five illustrative rules.
2. Reconcile TEST vs PROD discount enforcement and per-partner overrides. Review real roles and SQL authority before preparing an independent migration; never apply the PROD-oriented migrations_review file blindly to TEST. Numeric maxima and actual commercial approval are separate decisions. Test impersonation and malformed fixed discounts.
3. Wire the two-option frozen pair into authenticated Ready commercial workflow and compare-to-selected UI, with safe concurrent freeze and immutable pricing-rule provenance. Gate5C is not wired to CreateProposalDialog.
4. FIN01 #43: real atomic Draft save, server caps, idempotent lost-response replay and signed API validation. Full private TEST source/auth/trigger recovery #39 remains a separate release gate.
5. FIN03 #45: genuine DOCX/PDF, official option/selection fingerprints, write-once Supabase Storage paths, signed access, append-only archive, crash recovery. PR #32 remains a separate Draft branch.
6. QA01 hands-off Thai Union 2026→2028, including unauthorized discounts, interrupted saves, selection/freeze, signed docs, unique initial revenue and 2027/2028 renewals; no manual corrections, historical records untouched.
7. OPS01 Explorer #40/#42 remains independently tracked; no financial feature must assume its trigger side-effects are safe without pre-release checks.

## Horizon — milestone, NOT a calendar promise
| Stage | Current evidence | Next release condition |
|---|---|---|
| FIN01 Gate4D | atomic Draft save and form compatibility LAB PASS | Actual authorized TEST user/API/permission integration #43/#39 |
| FIN02 5A + 5C | original finance award + two immutable quote alternatives LAB PASS | frozen selected source integrated in real product with server pricing approval #44 |
| **FIN02 Gate5D** | **trusted mocked server catalog + discount policy to original award LAB PASS** | **complete real pricing_rules version and role-based discount authority** |
| FIN03 Gate5B | fictional bytes immutable document ledger LAB PASS | actual versioned DOCX/PDF object storage and document archive #45 |
| QA01 | full Thai Union acceptance matrix specified | full signed TEST browser/API E2E through second renewal 2028, no manual SQL changes |
| OPS01, MEM01, UX01 | separate open workstreams | their own separate testing and product rollout |

**Gate5D passes laboratory architecture, but actual TEST installation is NOT approved and PROD is untouched.**