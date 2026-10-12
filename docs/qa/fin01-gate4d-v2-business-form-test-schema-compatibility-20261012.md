# PartnerOS R1 — FIN01 Gate4D v2 Business Draft form / TEST schema compatibility
**12 Oct 2026 | source-anchored LAB PASS | Actual TEST install NO-GO**

## Scope
This work is on the original R1 FIN01 Pricing Business → FIN02 Contract/Award path. Customer Explorer is independent OPS01 #40/#42 and is not an adjudication step. FIN03 immutable official documents and QA01 Thai Union no-manual-intervention 2028 journey remain later milestones.

## Source alignment — actual reviewed code and TEST metadata
- Original CreateProposalDialog.tsx builds a Business proposal payload from insertData and buildProposalSourcePayload. A new read-only source contract check verifies **53 current form/source keys** against the SQL Draft adapter allowlist: exact match under CI.
- Lovable Cloud TEST was queried **read-only** for metadata of 116 public.proposals and public.proposal_items columns. The synthetic LAB overlay adds 83 columns (64 proposal + 19 items) using the real TEST names, types and defaults. Zero actual customer rows or secrets exported.
- The source Deal form passes a null canonical partner UUID while legacy deals.partner_id is a text identifier. Previous candidate's unsafe UUID-to-text comparison was eliminated; source actor authorization instead delegates to can_manage_proposal_source (simulated with a synthetic owner helper in the LAB).
- The real TEST proposal_items UPDATE RLS policy is represented in the lab; initially missing in the mini fixture, it silently filtered metadata updates. The new adapter now also verifies affected line count and aborts the transaction if any line mapping fails under RLS.
- Actual full TEST roles, RLS policy bodies, triggers and PostgreSQL cluster still have NOT been restored (#39).

## Implemented LAB-ONLY (no supabase migration, no frontend change)
- Candidate v1 atomic Draft save continues to validate amounts and source actor, row-version conflict, and one-call header + item replacement. It has been adjusted to use the correct Deal source helper rather than compare different legacy/canonical partner identifier types.
- [v2 full form SQL adapter](../../tests/sql/fin02/gate4d_ui_form_compatible_candidate.sql): accepts the 53 current Business UI header/source fields; stores version, language, plan, delivery, payment, implementation metadata, discounts and every current Business item column; checks author/status/source identity and linked client contract/license. Document URL, acceptance and official lifecycle fields are forbidden.
- Comparative KeepIT/UseIT proposals remain **savable as Draft** with the KeepIT headline lines and full Business config. They remain explicitly **unawardable** until FIN02 creates an authorized frozen chosen-option snapshot.
- The Deal expected_value update is included **inside the same transaction** and fails closed if the update is denied. This differs from the current separate best-effort browser request; it is NOT activated yet.
- RLS and reference schema extension: [fictional same-Client linked refs and per-line UPDATE policy](../../tests/sql/fin02/gate4d_ui_form_source_extensions.sql); [actual TEST column metadata overlay](../../tests/sql/fin02/gate4d_ui_test_catalog_columns.sql); [assertions](../../tests/sql/fin02/gate4d_ui_form_compat_assertions.sql); [UI drift checker](../../tools/fin02/gate4d-ui-form-field-contract.mjs).

## Real CI evidence
[GitHub Actions FIN01 Gate4D #38253090434](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38253090434) SUCCESS. At tested source SHA 6ac13751ecd7186492a26b70c734d3b82dd7eb09 all **12/12** workflows passed. The results include:
- 53/53 actual form/source fields match the SQL allowlist (supports shorthand TypeScript properties and numbered column names).
- Previous Gate4D negative cases: injection after old Draft item deletion rolls back header and all items; unauthorized other-partner actor denied; 0%/temporary vs continuing discounts reconcile; forged lifecycle/status blocked.
- Two real independent concurrent PostgreSQL sessions: one saved Draft version wins, stale competitor rejected; four final lines intact.
- Extended current-form comparison Draft and compare → KeepIT edit preserve all required header and per-line metadata, created_by and lead_id.
- Client-source proposal can retain existing contract and license only when linked to its Client; Deal-source proposal updates only its own source Deal expected_value.
- Test-trigger-injected failure at FINAL Deal expected_value update rolls back the earlier header and item updates and leaves the previous Proposal / Items / Deal value byte-equivalent.

All executions were in **disposable PostgreSQL 17 with wholly synthetic data**, not in real TEST.

## Non-negotiable release blockers
1. Server-side Business discount approval by actual role and catalog/policy thresholds; amount arithmetic alone is not authority. Need exact KeepIT S&TA gross-base rule, price table version and authorized exceptions.
2. Idempotent lost-response retry (stable request ID, payload hash and replay outcome), plus concurrent CREATE/version uniqueness across source records. Current same-UUID repeated create refuses duplicate but does NOT silently return the prior success.
3. Full actual TEST Auth JWT/RLS/probationary partner permissions; source Deal/Client mapping; original status/terms/fingerprint and other triggers; complete schema restore #39 and rollback/signed-API verification.
4. Current UI Ready/Sent/Accepted/Won official workflow and Professional/renewal-origin routing stay unchanged. Only Business Deal/Client Draft is addressed; comparison award remains forbidden.
5. No switch in CreateProposalDialog or migration has been made; before adoption review client-generated proposal IDs, updated_at race UX, versioning, server fees, Deal value and official document references against FIN03 snapshots.
6. Separate approval for every actual TEST migration/deployment. PR #34 remains Draft/unmerged, TEST/PROD unchanged.

## Outcome and next milestone
**Gate4D v2 source-fields/test-column compatibility LAB = PASS. TEST release = NO-GO.**
Issue #43 tracks remaining FIN01 persistence gaps; #29 R1 master. Proceed with source-backed FIN02 renewable vs expiring discounts and KeepIT/UseIT chosen-option snapshot, then FIN03 versioned immutable docs, then QA01 fully automated Thai Union journey to 2028, while safeguarding all release gates.
