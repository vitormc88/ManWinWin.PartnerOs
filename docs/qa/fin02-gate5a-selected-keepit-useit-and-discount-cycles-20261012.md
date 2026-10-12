# PartnerOS R1 FIN-02 Gate 5A — selected KeepIT/UseIT and discount cycles
**12 Oct 2026 | Original award RPC, disposable SQL PASS | NOT installed in TEST or PROD**

## Original roadmap
FIN01 Pricing Business → FIN02 authorized selection/award/contract/renewal → FIN03 immutable official documents → QA01 Thai Union 2028, no manual fixes. Commercial Memory MEM01, UX01, OPS01 Customer Explorer #40/#42 remain distinct. This Gate5A work is on the existing Draft PR #34 stack (#28 → #31 → #34), not on TEST or PROD.

## Confirmed approved commercial behavior
The **award wizard is price review-only**, approved 11 Oct 2026. It may not change price, quantity, discount, line description, billing frequency or total. Negotiated terms are revised in the proposal and revalidated; the resulting saved selected option is the award source.

A comparison proposal in mode `compare_keepit_useit` cannot be directly awarded. The backend `fin02_assert_business_award` requires a single-mode `keepit_only` or `useit_only` selected proposal, matching the caller's license option, gross/net/discount per line, first-year and next-cycle totals and contract source-item identities. This server check is distinct from the UI warning.

## Source-backed CI newly executed
- [Actual original award/renewal source with FIN02 migrations, two renewals and Gate5A #38256589041](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38256589041): **SUCCESS**.
- [Gate5A SQL](../../tests/sql/fin02/gate5a_selected_option_discount_matrix.sql) runs in one disposable transaction and **ROLLBACK**s all its fictional comparison/selected sources, awards and ledger events afterward. Gate3's original financial assertions, concurrency, rollback and guarded migration reverse tests run normally afterward.
- At tested commit `d431ad8a045bd528357709a64f3cfd2a581251d9` all **12/12 GitHub Actions succeeded**.

| Mode / promotion | First-year selected recurring line | Next-cycle same line | Verified first renewal estimate |
|---|---:|---:|---:|
| KeepIT Web discount 3%, **continues** | €388 (€400 gross − €12) | €388 | €558 with €170 gross-base KeepIT S&TA |
| UseIT annual discount 5%, **expires** | €380 (€400 gross − €20) | €400 | €400 |
| KeepIT Web 3% **expires** (earlier Gate3) | €388 | €400 | €570 with €170 S&TA |

KeepIT 3% continuation also has one-time €1,000 license and €50 implementation in this synthetic scenario: first-year total €1,608. UseIT first-year total €380 (one recurring line). The original two-renewal Gate3 tests already prove the original KeepIT *temporary* promotion produces €570 at 2027 and 2028 and doesn't re-recognize one-time implementation.

Assertions include: Direct compare award rejected with the exact source error; attempting to change chosen KeepIT to UseIT with IDENTICAL first-year and recurring totals rejected separately by backend mode guard; individually sourced contract amounts/discount flags and frozen `contract_lines.pricing_snapshot` kept; first renewal estimate derived from per-line next-cycle policy; distinct versioned chosen proposal linked through `parent_proposal_id`, original compared proposal remains Ready; initial-sale revenue unique, existing award retry idempotent. Invalid scenario leaves no Client/License/revenue orphans.

## Important discovered incompleteness — Issue #44
The source Business editor calculates BOTH KeepIT and UseIT in memory via `computeBusinessOptions(rules, businessConfig, models)`, but persists `business_config` input fields and only the **headline option** proposal_items via `businessResult.keepit || businessResult.useit`. That DOES NOT capture two independent signed-off priced sets at the commercial decision point. The Gate5A test fabricated both option sources as synthetic SQL fixtures; it validates what the backend does WHEN given a separately saved selected revision, **not** a complete production UI selection/price-freezing feature.

[#44 — Frozen comparison alternatives and selected-option provenance](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/44) requires a verified pair of immutable line-price snapshots at a chosen approved lifecycle state, selected line/economic-terms matching to ONE frozen alternative, pricing-rules/config version, rights, audit, and FIN03 official document fingerprint. The `parent_proposal_id` and `business_config.pricing_frozen` test marker alone are NOT cryptographic or financial authorization; they do not prove the quote price was the selected alternative. Current backend correctly blocks the unsafe direct comparison path.

## FIN03 and QA01 hand-off
PR #32 (Draft sibling based on PR #28) prevents mismatched business document rendering but **does not yet create append-only content-hashed DOCX/PDF official artifacts**. Current `storeProposalDocument` calls Supabase Storage with `upsert: true` on deterministic paths and then updates a mutable `proposals.docx_url` reference. Repeated generations can overwrite an earlier approved customer-facing document. A separate FIN03 official snapshot ledger and write-once storage identity plus atomic association is needed before marking FIN03 complete.

QA01 must rerun Thai Union through pricing/selection, Ready, document, signed acceptance, award, 2027/2028 renewals, idempotent retries, role failures and deliberately injected transaction abort **without any manual SQL corrections**. Use synthetic TEST-approved data, never silent alterations to historic Thai Union rows.

## Gates and permissions
- **Gate5A original RPC negative/positive synthetic tests: PASS**.
- **Freeze two alternatives + selected snapshot server enforcement: OPEN (Issue #44)**.
- **Gate4D Draft atomic save and UI compatibility: LAB PASS / actual TEST NO-GO (#43)**.
- **FIN03 immutable doc ledger and signed access: OPEN (#32)**.
- **Full original TEST Supabase-compatible private restore/auth/role integration: OPEN (#39)**.
- **No TEST/PROD SQL writes, merges, deployments, backend migrations or Lovable credits used**.
