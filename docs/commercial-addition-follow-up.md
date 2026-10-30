# Existing-customer addition proposals

## Preparation workspace (UX audit follow-up)

Open **Commercial → Create proposal → Extend License** for a shared basket of accesses, modules, plugins and API. Three stages separate items, period/prices, and review/payment. The investment summary and footer actions remain available; initial gross, concession and net are shown separately. A calculation may be previewed while payment is incomplete, but document export and official validation remain blocked until the applicable reviews are complete.

**Save Draft** also preserves incomplete work in `proposal_preparations`. These working copies are separate from commercial proposals, have no financial totals in analytics and cannot be adjudicated or activated. They appear in the client's Commercial area. Completing a working copy calls the existing strictly validated save operation and removes the preparation atomically; it creates/updates only a Draft. Source permissions, catalogue arithmetic, stale-source checks and concurrent-edit checks remain in force. A failed completion retains the preparation. Refreshing a saved catalogue requires reviewing the pricing reference again.

Closing an edited preparation offers keep editing, discard, or save-and-close. Browser refresh/navigation also receives an unsaved-work warning. Opening a saved proposal shows follow-up and the next action above the investment; editing is separate. Secondary revise/reject operations are under Other actions.

An initial-period offer is separate from an offer including renewals; the latter requires an explicit confirmation. Empty payment selections produce a pending-conditions message, never credit authorization.

**Review License Upgrade**, **Review Hosting Change** and **Commercial / Services Review** preserve the existing configuration and save the requested scope without generating a full new-license quote. Pending transition credits, proration and service rules are not guessed. Existing renewal proposals continue through their separate operational renewal flow. Service requests can be recorded for review; services are not silently added to the incremental basket or charged as a new implementation.

New preparation records have scoped SELECT RLS for commercial editors, no direct insert/update/delete grants, and authenticated operations using the existing client-commercial permission. The completion operation cannot convert a review request into a commercial addition.

Open **Clients & Licenses → client → Commercial → Actions → Add Users / Add Modules / Add Plugins**. Select only the additional quantities/components, review the remaining months, applicable price table, billing basis, implementation and payment terms. Existing licensed components cannot be selected again. Save the draft before using follow-up actions.

## Detailed commercial terms (30 October 2026)

New additions start with structured terms and Portuguese documents. Existing saved proposals retain their exact prices and payment policy; a Draft can explicitly enable detailed terms, after which its payment agreement must be completed again. Ready/Accepted snapshots are never silently migrated.

- **Negotiated unit tariff**: HQ records a customer-specific tariff with its agreement/justification. WEB and hosting use €/access/month; other recurring components use €/unit/year; perpetual purchases use €/unit. This is separate from Navaltik/partner revenue sharing.
- **Initial discount** reduces this purchase only. **Renewal discount** changes the annual contractual increase. Both are explicit; no blanket 10% is inferred from S&AT boilerplate. The annual contractual metric keeps the existing proposal generator convention; this release does not settle the pending multi-year discounted ARR policy.
- **Offer this period only** sets the initial discount to 100%, retaining the renewal tariff. **Offer including renewals** requires confirmation and sets both discounts to 100%. Justification is required. A zero-value proposal still follows evidence-based adjudication/activation and grants only its selected entitlements. HQ authorizes offers and negotiated tariff changes; partner software discounts respect their existing configured limit (10% default).
- **KeepIT support** follows the negotiated capital tariff. A discount on the initial capital purchase does not silently discount S&AT; its initial/renewal concession is separately visible and selected.
- Choose invoice schedule (100% award, or award/installation split), due days, explicit activation milestone and agreement reference. Payment text is generated identically on client and server. Full-payment and award-invoice-payment milestones require receipt confirmation. HQ-authorized credit activation requires its authorization reference and an explicit authorization confirmation, without declaring a fictitious payment. Zero-value offers use authorization confirmation too. Actual billing/collections remain external.
- Saving freezes and validates catalogue prices, arithmetic, document dates, billable-month policy, payment terms and actor limits. Protected server approvals bind the saved snapshot and document metadata; altered approved terms must be saved/reviewed again. Existing source locks and stale-data checks remain.
- **PDF** downloads directly, without a print popup, with PT/EN text, actual period, validity, unit tariff, initial/renewal discounts, payable-now amount, annual contractual increase and compact official ISO footer on every page. Large conditions paginate. Word uses the same content and footer asset.

Migration `20261030160433_commercial_addition_detailed_terms.sql` uses its Supabase-assigned journal version. It adds only the protected terms-approval table and private pricing/validation helpers, and extends existing audited operations. No real contracts, licences, proposal statuses or user permissions are backfilled.

Still pending Rita: automatic upgrade/unused-period credit rules, day-15 convention, approved source-price/rounding rules, support-day capacity/expiry, Purchase Requests identity and exceptional Professional entitlements. This release does not introduce those rules or import historical quotations as sales.

## Operational flow

1. **Save Draft** preserves the commercial snapshot and its prices. It changes neither ARR nor the installed license.
2. **Mark Ready** validates the saved proposal, reconciled annual baseline, source license/contract, line amounts and agreed terms. A short prorated quote may legitimately have an annual increment greater than its payable-now amount.
3. Download the PDF/Word and send it externally. **Mark Sent** records the actual send date; it does not send email. Downloading does not imply sending or acceptance.
4. **Adjudicate** requires an acceptance date and a PO, signed proposal or acceptance email reference. A documented internal exception is HQ-only. This is the first financial operation: record the annual increment, update the contract's annual total and open contract-renewal estimate, and freeze evidence. The installed license remains unchanged.
5. **Activate awarded additions** requires explicit receipt/payment confirmation and a receipt reference. Apply only the awarded BO/WEB quantities, selected modules/plugins and API access. This updates the existing license, not a second license, and adds no ARR again.

Proposals & follow-up retains recent adjudicated/rejected proposals. An adjudicated addition shows **Activation pending** until applied; the proposal displays the awarded annual increase, annual total, activation date, payment reference and workflow history. Client lifecycle events record adjudication and activation.

**Reject** requires a reason and leaves ARR/license unchanged. **Return to Draft** requires a reason and a fresh validation before sending/adjudication. Adjudicated proposals cannot be rejected or revised through these actions.

## Integrity and permissions

- All operations run through audited database operations; no browser status/contract/license writes.
- Client edit permission, or existing pipeline edit permission scoped to visible clients owned by the user's partner, authorizes addition operations. Users without commercial edit receive no mutation controls. This allows Josué's existing sales role to prepare/follow up Raven additions without general client/license/contract editing rights. Fulfillment history uses client visibility RLS; direct ledger DML and anonymous execution are denied.
- Proposal and source row locks, a unique per-proposal award ledger, frozen commercial fingerprints and idempotent adjudication/activation prevent repeated clicks from duplicating ARR or accesses.
- A failure rolls back status, award ledger, contract lines, renewal and license together.
- Source changes, unknown contract lines/currencies/frequencies, unreconciled manual adjustments or separate component renewals block adjudication with an actionable reconciliation message. A pending award for the same license must be activated before another award. Changed entitlements after award block activation instead of overwriting them.
- Existing historical `contract_value` is retained. Only exact known imported line aliases are normalized at adjudication so existing ARR is preserved alongside the increment. Prorated payable-now lines are not copied into ARR as annual values.
- Required payment is a human receipt confirmation, not payment processing or an accounting integration.
- External product/license-server provisioning is not performed: activation updates the licensed entitlements recorded in PartnerOS.

## Verification and release

The isolated SQL fixture (`tests/sql/commercial_addition_lifecycle_qa.sql`) contains synthetic data and captured pre-extension workflow definitions. Never execute this fixture against TEST/PROD. It exercises Draft/Ready/Sent/reject/revise, financial and license separation, failure rollback, stale-source/ownership guards, idempotency, BO/WEB/all seven non-API components/API activation, and original opportunity/renewal paths. CI runs it on its own disposable PostgreSQL service.

UI regression tests cover explicit validation, acceptance evidence, payment-gated activation, unsaved/read-only/error blocks, completion and rejection reasons. Existing addition pricing/documents/editor and proposal regressions remain in CI.

Migration journal versions: `20261030000156` (lifecycle) and `20261030000932` (scoped commercial permission), assigned by Supabase. The Barcino transaction was exercised in PROD with **ROLLBACK**, including actual commercial-intelligence ARR calculation and repeated adjudication/activation. Final persisted state remained Ready, ARR/renewal €14,031, 10 BO and 11 WEB, no award ledger. No real adjudication, payment or activation was recorded.

Post-migration advisors: no new missing-RLS or missing-FK-index findings. The authenticated SECURITY DEFINER entry-point notice is intentional: the public operation performs explicit authentication, source ownership and client edit checks before calling private helpers. All direct ledger mutations remain revoked. Newly-created unused-index notices are expected before real awards exist. The scoped frontend/proposal regression suite passed 101 tests.

Emergency containment: revoke authenticated execution of `commercial_addition_action`, and roll back the frontend deployment if needed. Preserve the fulfillment ledger and awarded financial records; do not undo real adjudications by deleting rows. Corrections to already-awarded commercial terms require an explicit reconciled adjustment with HQ.
