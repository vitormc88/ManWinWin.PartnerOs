# Renewals: one cycle, one official close (revised, phased)

Planning only. Nothing changes in TEST or PROD until you approve. "Verified" = read directly in code or TEST. "PROD (you verified)" = your direct checks. "Inferred" = still needs checking on PROD.

## 1. Facts confirmed for this revision

| # | Finding | Source |
|---|---|---|
| F1 | The DOCX/PDF → Ready promotion lives in the proposals list, which is used **only on the opportunity page** (DealDetail). Renewal proposals never pass through it. | Verified (code) |
| F2 | The renewal proposal assistant (Renewals module and Client > Commercial) only ever saves **Draft**. A Ready save with readiness checks exists in the code, but nothing calls it. The checks run only in the browser. **There is no normal path today for a renewal proposal to reach Ready.** | Verified (code) |
| F3 | Partner > Renewals sets `Completed`/`Lost` by direct update: no `closed_at`, outcome, contract, next cycle or audit. | Verified (code) |
| F4 | **Lost can come back as pending.** The views build "derived" rows from contract, licence and S&AT end dates. When the only real row for a client is closed, an open derived row wins the selection, so a Lost renewal reappears as due. This affects Renewals and Partner (same source) and Client wherever it uses the same selection. | Verified (code); to confirm in the interface |
| F5 | `sync_partner_active_client_counts()` exists in PROD, not in TEST. | PROD (you verified) / TEST verified |
| F6 | 2 PROD renewals are `Completed` with no formal close. | PROD (you verified); identities to be read |

## 2. Decisions locked (D1–D6)
- **D1 Acceptance evidence:** a signed proposal, purchase order, acceptance email or other verifiable confirmation, with date, the person who confirmed, and a reference or file. An internal note alone counts only through an explicit HQ exception, which is audited. Validated never proves acceptance.
- **D2 No changes:** requires an auto-renewal clause **or** a recorded express confirmation from the client. No client-facing proposal, but an immutable snapshot of the renewed terms and the evidence is saved. Indexation is allowed only if the contract defines it, and the calculation is shown. Anything negotiated goes through the proposal route.
- **D3 Who closes:** HQ, and partner admins for their own partner's clients, within their commercial limits. Never another partner's client or an HQ Direct client. Enforced in the database operation.
- **D4 Cycles:** S&AT and hosting form one cycle only if they share the same commercial agreement, are negotiated and accepted together, and share the period and conditions. A KeepIT perpetual licence never forms a cycle by itself.
- **D5 Difference categories:** price change, plan change, discount, indexation, scope change, **Year 2 price progression already agreed**, **end of promotional discount**, other (note required). The value already agreed for the next period shows as **Unknown** when it doesn't exist; it is never assumed. Only an unexplained difference on the same component and period blocks.
- **D6 Sent:** set manually when the proposal was sent outside PartnerOS; set automatically only when PartnerOS itself sends it and confirms. Download or print never changes the status.

## 3. Phases

Each phase is its own migration set. Each set is written against the documented PROD baseline, rehearsed on TEST, tested through the interface, then applied to PROD only with your approval.

### Phase 0: Baseline (read-only)
- A read-only PROD script for renewals, proposals, contracts, revenue history, client counts, `close_renewal`, client-creation/award functions, triggers and policies.
- A schema diff between TEST and PROD.
- Identity and context for the 2 `Completed` PROD renewals: client, partner, dates, linked proposal/contract, activity history. Each gets an individual recommendation for you to decide; none is changed.
- Bring TEST up to the PROD baseline in a controlled way, e.g. add `sync_partner_active_client_counts()` exactly as it is on PROD.
- **Acceptance:** the diff is documented, TEST matches PROD for the objects these phases touch, and the 2 records are presented.
- **Rollback:** none needed for PROD (reads only). Alignment on TEST is reversible per object.

### Phase 1: Urgent PROD hotfixes
- **1a Client counts:** recalculate only the affected partners: on insert, the new partner; on delete, the old one; on reassignment, both. Never `WHERE true`, never all partners.
- **1b HQ Direct revenue:** the client is marked explicitly as HQ Direct (no partner). Revenue history accepts no partner **only** for HQ Direct clients, with a database guard. Partner metrics, commissions and partner reports exclude it; HQ reports show it as "HQ Direct". This comes after an inventory of every view, function, policy and report that assumes revenue has a partner.
- **Acceptance:** on TEST then PROD, awarding a proposal for a new partner client and for a new HQ Direct client both succeed. Counts change only for the affected partners. No partner metric or commission includes HQ Direct revenue.
- **Rollback:** restore the previous function definitions; the HQ Direct flag column is kept but unused.

### Phase 2: Close the gaps in the current flow (no cycle restructuring)
- **2a Draft → Validated:** a "Validate" action in the renewal assistant, and an `validate_proposal` operation in the database that runs the readiness checks and saves the status **in the same transaction**. The status can't be set to Validated in any other way.
- **2b Proposal states:** Draft → Validated → Sent (D6) → Accepted (with D1 evidence) | Rejected | Superseded. Remove the download/print promotion on the opportunity page.
- **2c No manual close:** Partner > Renewals keeps editing of priority, owner, forecast value and notes; its Renewed/Lost buttons open the official closing dialog. A database guard rejects any change to Completed/Won/Lost that doesn't come from `close_renewal`.
- **2d `close_renewal`:** for the negotiated route, an explicitly chosen proposal, which must be Accepted with evidence; the others become Superseded. Permission rules D3. Per-component, per-period reconciliation with the D5 categories; an unknown agreed value is shown as Unknown.
- **2e Lost stays closed:** a closed cycle suppresses derived rows for the same period, and in all three views. The contract and licence are not ended early. A new derived row appears only for a genuinely later period.
- **Acceptance:** on TEST, through the interface: no route reaches Validated without passing the checks; download/print never changes status; the partner tab can't set Completed/Lost; closing negotiated requires a chosen, accepted proposal; a Lost renewal doesn't reappear in Renewals, Client or Partner; a partner admin can't close another partner's renewal or an HQ Direct one. Then repeat on PROD with one QA record, cleaned up afterwards.
- **Rollback:** drop the guards and the validation operation, and restore the previous `close_renewal`. New proposal statuses stay readable.

### Phase 3: No-changes route (D2)
- Before building, I present the exact evidence fields and the records created, for your approval: the snapshot of terms, the evidence, the indexation calculation, the next cycle and the audit.
- Acceptance and rollback are defined in that sub-plan.

### Phase 4: Cycles by contract/service, and history
- An inventory first: KeepIT perpetual with no active S&AT/hosting; rows that mix components with different dates or agreements; every Completed/Won/Lost row without `closed_at`; proposals at Ready with no validation trail.
- Then the cycle model (D4) and a reviewed migration of historical data, record by record where needed.
- **Acceptance:** each affected client is reviewed, and no perpetual licence shows an annual renewal.
- **Rollback:** backup tables made before the migration.

## 4. What stays open for you
- The 2 PROD `Completed` records: a decision per record after Phase 0.
- Approval of the Phase 3 evidence and records sub-plan.
- Approval before each PROD apply.
