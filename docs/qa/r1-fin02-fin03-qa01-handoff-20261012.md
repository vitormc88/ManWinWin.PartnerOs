# PartnerOS R1 — FIN02 Gate5A → FIN03 Gate5B → QA01 Thai Union 2028
**12 Oct 2026 · Both standalone disposable SQL laboratories PASSED · full signed TEST E2E NOT STARTED**

## Ground truth and delivery boundaries
This work follows the owner's original R1 sequence: F0 diagnosis, FIN01 Pricing Business, FIN02 Contract/Renewal, FIN03 official documents, MEM01 Commercial Memory, OPS01 reliability, UX01 simplification, QA01 no-manual-correction E2E. Customer Explorer is **separate OPS01 #40/#42**. Its presence as a `clients` trigger side effect must be regression checked before live TEST installs but is not an adjudication stage.

### FIN02 evidence / unresolved
- Source-original `award_deal_proposal` + independently reviewed FIN02 safeguards on disposable PostgreSQL 17 [Gate5A #38256589041](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38256589041) **PASS**.
- Frozen per-source contract policy correctly distinguishes:
  - KeepIT Web €400 gross, €12 discount (3% continues): first-period €388, next-cycle €388; with €170 KeepIT S&TA gross base, total recurring €558.
  - UseIT €400 gross, €20 discount (5% expires): first-period €380, next-cycle €400.
  - Existing Gate3 KeepIT 3% expiry first-period €388, recurring €400, total recurring €570, maintained through 2027 and 2028.
- Comparison cannot award; selected mode cannot be changed in conversion, **even with equal totals**. Distinct selected Ready revision, separate comparison Ready revision and source items, per-line pricing_snapshot, unique revenue and idempotent award pass. All Gate5A fictional writes were ROLLBACKed in its own transaction.
- **Blocking [#44](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/44)**: comparison form stores only headline priced proposal_items plus Business configuration, not two distinct permanently frozen item-price arrays. Before release, capture both alternative snapshots at approval time and enforce selected version matches one approved snapshot under backend auth; our lab simply seeded both alternatives for proof, NOT UI feature complete.

### FIN03 evidence / unresolved
- [Draft PR #32](https://github.com/vitormc88/ManWinWin.PartnerOs/pull/32) guards document generation from unsaved pricing and some rule drift, but the existing storage helper still uploads same path with `upsert:true` and mutates `docx_url`. This is NOT immutable archival.
- New standalone [FIN03 Gate5B PostgreSQL lab #38258181471](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38258181471) **PASS**, using fake byte arrays for DOCX/PDF content: version/kind/commercial fingerprint/sha256/path/actor ledger, read-by-owner ACL, immutable records and fictional object bytes, identical retry idempotent, different-bytes same-version denied, new v2 official artifact added without overwriting v1 DOCX/PDF. Source-style path keeps proposal ID as second component for the current Storage bucket RLS structure.
- This **does NOT** prove real DOCX/PDF rendering, actual Supabase Storage write-once permissions, signed download policy, object upload/DB linkage atomicity, full TEST RLS, or matching historical prices. #45 [official document ledger](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/45) captures these real release gates.

## QA01 — Thai Union synthetic no-manual-fix acceptance sequence
This is a **future test plan**, NOT a completed run. The 2026 Thai Union numbers below come from the original R1 investigation and serve as synthetic oracle values, never overwrites of historical Won data.

| Step | Action through authorized product workflow | Machine-verifiable acceptance |
|---|---|---|
| 0 | Create isolated, consented synthetic TEST client/deal/proposal under representative HQ + Partner roles | Real source ID, owner, partner, dates, clean ledger; no manual corrective SQL |
| 1 | Configure Business 8% software and 3% Web with chosen discount-renewal flag; KeepIT gross 17% S&TA | Saved per-line gross/discount/net; Year1 **€683,864.20**, discount total **€30,896.80**; gross base S&TA never discounted |
| 2 | Save Draft atomically, refresh browser/re-login, deliberately interrupt once after header/line phase | No partial items; exact previously committed rows; duplicate retry produces one proposal revision; wrong role denied |
| 3 | Build **both** KeepIT and UseIT snapshot alternatives at the commercial version; choose and mark ONE single-mode revision Ready | Both independently frozen with pricing-rule/approval fingerprints; compare revision preserved; selected revision hash matches exact option; cannot award compare directly |
| 4 | Produce official DOCX and PDF using stored terms and one version; simulate retried upload | SHA256 of actual downloadable bytes, append-only official ledger, immutable version and source fingerprint; no overwrite; unauthorized download denied |
| 5 | Record legitimate signed customer acceptance and adjudicate selected revision through review-only conversion | Exactly 1 Client, License, Contract, initial sale €683,864.20, correctly sourced contract lines, first renewal; no manual price changes in conversion |
| 6 | Attempt mixed line swaps +€100/−€100, forged mode and replay/parallel award; inject late failure | Every invalid attempt rejected and fully rolled back, no orphan client/ledger, original accepted docs untouched; award retry idempotent |
| 7 | Close 2027 renewal via Accepted source proposal with real evidence | If 3% Web renews, expected recurring baseline **€393,018.20**; if the promotion expires, **€403,811.00**. Never bill first-year one-time services as renewals |
| 8 | Close 2028 renewal using previous frozen contract baseline | Historical 2026/2027 closure snapshots preserved; unchanged negotiated recurring policy carried once, 1 unique ledger/renewal cycle |
| 9 | Audit reverse of every failure and cross-role visibility | No manual SQL repair, consistent proposal+document+contract+license+renewal sources, signed file re-download bit-identical, no visibility leak, no duplicated revenue |

**Clarification:** "without manual corrections" does not prohibit a human from legitimately negotiating, approving, selecting or signing; it means the application's normal authorized workflows must complete without emergency database edits or silent direct backfills.

## Strict gates for a real QA01 release run
1. Source-authorized TEST-specific backup/recovery and security role/trigger dependencies (full private TEST clone #39 remains open). Don't use real historic Thai Union rows as a scratchpad.
2. Complete FIN01 Draft atomic saving with server-side discount authority, replay idempotency and actual authorized UI/API integration #43.
3. Complete FIN02 source-authenticated dual-option snapshots / chosen mode freeze #44; backend rules from Gate5A remain.
4. Complete FIN03 genuine DOCX/PDF immutable artifact upload, verified content hash, storage RLS, signing and snapshot ledger #45; no accidental deletes or overwrites.
5. Execute end-to-end via actual application roles and TEST frontend with failure/negative injections. Current isolated SQL checks prove components, **not** the integrated user journey.
6. Only after independent review and the owner's explicit TEST installation consent are migrations or frontend cutovers allowed. Never directly deploy to PROD from this program.

## Release-status summary
- Gate5A FIN02 original SQL server negative / discount matrix: **PASS synthetic, live TEST NO-GO**.
- Gate5B FIN03 version/hash/append-only ledger proof: **PASS synthetic, real file/store integration NO-GO**.
- QA01 Thai Union through 2028 without repairs: **NOT YET EXECUTED**.
- PR #28 → #31 → #34 FIN01/FIN02 stack Draft; PR #32 FIN03 sibling Draft on #28, not automatically integrated.
- No TEST/PROD SQL mutations, merges, deployments, live files, external emails, Lovable agents or Work credits used.
