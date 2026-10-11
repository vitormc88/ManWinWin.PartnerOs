# FIN-02 / FIN-03 — Financial truth across Proposal → Award → Renewal
**Draft technical policy, 11 October 2026. NOT DEPLOYED.** Related: PR #28, PR #31, PR #32; master #29.

## Confirmed commercial policy
Business KeepIT S&TA is 17% of the **gross eligible software license base**, before software discounts, plus the applicable fixed S&TA components. Do not rebase it on discounted software net.

## Reproduced post-Work problem
Thai Union R1 v2: proposal header Year 1 EUR 683,864.20, but 23 persisted proposal lines total EUR 714,761.00. Contract after ten manual changes totals EUR 683,864.20, with nine source-linked line prices now differing from the proposal lines. Next-cycle value EUR 393,018.20 was carried to the 2027/2028 renewals, but the Web/App 3% renewing-discount provenance was lost. These are synthetic TEST records. Do not silently backfill historical Won data.

## Invariants
1. Each proposal line contains price rule, quantity, gross, discount type/rate, net, currency, billing period, applicability to renewal and origin. Gross minus discount equals net at cent precision.
2. KeepIT S&TA derives from the **gross** eligible license value; software net discounts do not alter its base.
3. For recurring products distinguish **Year 1 billed net** from the **next-cycle contracted amount**. They can differ legitimately when a first-year discount expires.
4. Every positive priced line must map exactly once from proposal_item to contract_line. Net price, identity and billing frequency must match individually; sum equality alone is insufficient.
5. Renewal baselines derive from frozen currently contracted recurring lines and policy, not from mutable public catalogue prices or from original first-year totals.
6. Approved proposal documents are immutable outputs of frozen commercial revisions, each with content hash, source fingerprint, version and status.
7. Historical first-year invoices/implementation fees remain historical; renewal must not re-recognize them as current recurring revenue.

## Current model gap
Proposal_items already have gross/net, discount and apply_discount_to_renewal, although legacy Business serializer discards them (PR #28 fixes future saves). Contract_lines has amount, billing_frequency and source_item_id, but **no next-cycle amount or discount policy snapshot**.

**Candidate additive schema (requires approval and a separate migration):**
- contract_lines.year1_gross and year1_discount, numeric values
- contract_lines.next_cycle_amount and explicit pricing frequency/unit
- contract_lines.pricing_snapshot JSONB (rule ID, gross base, percentage, applicability, applied policy/version, source_item_id)
- proposal_documents append-only ledger for document provenance and immutable artifact storage
Legacy rows stay untouched and visibly labelled for review.

Joining contract_lines.source_item_id to proposal_items is useful evidence but should not be the only future recurring source once contracts have amendments or subsequent renewals.

## Server award gate — separate reviewed migration still required
At the database boundary, under the existing authorization and row locks, validate that:
- awarded proposal is eligible, in the same deal and has an approved commercial revision;
- each positive priced source row maps exactly once and has matching price and period, even if total sums match;
- Year 1 and next-cycle values reconcile separately to the proposal and the selected mode;
- KeepIT gross-base S&TA and promotional-expiry rules are preserved in the contracted snapshot;
- the whole client/license/contract/renewal write is atomic and idempotent;
- approved exception overrides have an actor, role, reason, before/after values and event record.
Do not broaden SECURITY DEFINER privileges. Historical already-awarded requests remain idempotent.

PR #31 provides a **frontend safety preflight**, not a backend security boundary. It intentionally blocks comparison-mode awards and non-renewing recurring discounts pending correct source-of-truth design. These restrictions must be resolved before release.

## FIN-03 — document decisions needed
- Does Mark Ready freeze a commercial revision, or only Mark Sent?
- Is a PDF print a non-official preview unless it creates a stored immutable artifact?
- Should a previously sent DOCX be downloadable byte-for-byte? **Recommended yes.**
- Compare KeepIT/UseIT: store both priced alternatives and the selected award as distinct immutable snapshots.
- Never upsert a sent/accepted document under an old filename. A new revision creates a new artifact. Status changes require matching fingerprint.

PR #32 currently prevents a document being freshly generated when the saved Business config/price lines disagree or the wizard has unsaved edits, and generates renewal DOCX from saved rows. Full immutable document storage is **still unimplemented**.

## Required acceptance matrix
| Case | Expected |
|---|---|
| KeepIT no discount | Header, item nets, contract and renewal agree; SAT gross |
| KeepIT software 8%, Web 3% renewing | Year 1 and Year 2 correct, 3% policy retained |
| KeepIT software 8%, Web 3% ending after Year 1 | Next cycle increases correctly without losing rule |
| UseIT and KeepIT/UseIT Compare | Right option snapshotted without mixed lines |
| Contract line +EUR100 / -EUR100 | Server rejects though total equal |
| Two simultaneous awards, or retry after successful award | Exactly one client/license/contract/renewal (no duplicates) |
| Failure mid-award | Transaction rollback has zero orphaned rows |
| Catalogue price modified after proposal approved | Document/contract stay frozen at approved figures |
| HQ, partner, anon, probationary role matrix | RLS/authorization enforced, negative tests pass |
| Original Thai Union R1 Won | Historical exceptional adjustment clearly auditable, never quietly rewritten |

## Gates
1. Review PR #28, #31, #32 and keep all Draft until tests and architecture are approved.
2. Agree discounted recurring model and Compare-mode award semantics.
3. Propose and test additive TEST-only DB migration and RPC enforcement, never PROD.
4. Define immutable artifact workflow and verify saved document fingerprints.
5. Repeat a clean, no-manual-override Thai Union-like E2E and negative permission tests.
6. Approve PROD separately with rollback and reconciliation plan.
