# Existing-customer addition proposals

Open **Clients & Licenses → client → Commercial → Actions → Add Users / Add Modules / Add Plugins**. Select only the additional quantities/components, review the remaining months, applicable price table, billing basis, implementation and payment terms. Existing licensed components cannot be selected again. Save the draft before using follow-up actions.

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
