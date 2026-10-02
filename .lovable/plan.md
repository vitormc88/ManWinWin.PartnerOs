# Renewals: one cycle, one official close

Planning only. Nothing is built until you approve. "Verified" means I read it directly in the code or in TEST. "Inferred" means it is about PROD and still needs checking there.

## 1. Facts checked before designing

| Topic | Finding | Source |
|---|---|---|
| Draft → Ready in the proposal assistant | The assistant can **only save as Draft**. A Ready save path exists, with its readiness checks, but no button calls it. | Verified (code) |
| Where Ready actually happens | Only as a side effect of downloading the DOCX or printing the PDF from a proposal list. That path **skips the renewal readiness checks**. No "Mark Ready" button exists. | Verified (code) |
| Partner > Renewals tab | Sets `status = 'Completed'` / `'Lost'` directly, with no `closed_at`, outcome, contract update or next cycle. | Verified (code) |
| Official close | The `close_renewal` function exists and is used by the Renewals module dialog. Today it accepts the newest proposal at Ready or later. | Verified (code + TEST) |
| `sync_partner_active_client_counts()` | Not in TEST. It exists only in a review script. | Verified (TEST) / inferred present in PROD |
| Two PROD renewals "Completed" with no closure data | Reported by the audit; I can't see PROD. | Inferred: identify with read-only SQL |

## 2. Target model

```text
One renewal cycle = one commercial term of one contract (or one separable service).
All screens read the same cycle and call the same close_renewal.
```

**What forms a cycle:** a contract's recurring components that share the same end date and the same billing terms make one cycle (S&AT, SaaS subscription, hosting, UseIT term). Components with different dates or conditions get separate cycles, even for the same client.
- KeepIT perpetual licence: **never** a cycle by itself. Only its S&AT and/or hosting can renew.
- KeepIT perpetual with S&AT inactive and no hosting: no cycle. It shows as "No recurring agreement" and can be a win-back opportunity, not a renewal.
- UseIT: term-based, so it is a cycle.

**State machine (one field each, no ambiguity):**

```text
Cycle:     Planned -> In preparation -> Closed(Renewed | Lost)
Proposal:  Draft -> Validated (internal) -> Sent -> Accepted | Rejected | Superseded
```

- "Completed" stops being a state you can set. A closed cycle always has `closed_at`, an outcome, the accepted proposal or evidence, and its effects (contract update, next cycle, revenue history, audit).
- "Ready" is renamed in the interface to **Validated**: complete and checked internally. It does **not** mean the client accepted.

**Closing rules (enforced by `close_renewal`):**
- Renewed via **negotiated proposal**: a specific proposal must be chosen and be Accepted, plus acceptance evidence (date, who accepted, document or note).
- Renewed via **no changes**: no proposal. Evidence is the contract's auto-renewal clause or a recorded client confirmation, and the next term's price comes from current contract lines plus any agreed indexation. See decision D2.
- Lost: requires reason and date. The contract is left unchanged; the next cycle isn't created.
- Several proposals on one cycle: the user picks the accepted one; the others become Superseded automatically when it closes. Nothing is picked "because it's newest".

**Value reconciliation (per component, per period):** the closing screen shows three columns for each component:
`Current recurring` | `Already agreed for next period (contract)` | `New proposal recurring (Year 2+)`.
Year 1 one-time items are shown separately and never compared with recurring.
- Unexplained difference: blocks closing.
- Explained difference (price change, plan change, discount, indexation): allowed, with a required reason category and a note, saved in history.

## 3. Actions per screen

| Screen | Can do | Cannot do |
|---|---|---|
| Renewals module (main workspace) | Everything: prepare, create/validate/send proposals, record acceptance, close Renewed/Lost | — |
| Client > Commercial | Same cycle list for that client; open the cycle; start a proposal; close through the same dialog | Set a status directly |
| Partner > Renewals tab | See the portfolio; edit priority, owner, forecast value, notes; open the cycle; the "Renewed / Lost" buttons open the **same** official closing dialog | Set Completed/Lost directly (removed) |

## 4. Changes needed

**Frontend (TEST first)**
- Proposal assistant: add "Save as validated", which runs the existing readiness checks. Add explicit "Mark as sent" and "Record acceptance" actions on the proposal.
- Remove the silent Draft → Ready promotion on download/print.
- Closing dialog: select the proposal, choose the mode (no changes / negotiated), enter evidence, show the 3-column reconciliation.
- Partner tab: replace the direct status updates with the shared dialog.
- Status labels and filters updated everywhere (KPIs, badges, analytics).

**Database (TEST first, then a reviewed script for PROD)**
- `proposals`: statuses Validated/Rejected/Superseded, plus `accepted_at`, `accepted_by_name`, `acceptance_evidence`.
- `renewals`: `close_mode` (no_changes / negotiated), `evidence`, the reconciliation snapshot, and a guard that blocks any update to `Completed/Won/Lost` that doesn't go through `close_renewal`.
- `close_renewal`: require an explicit proposal plus Accepted status for negotiated; accept the evidence path for no changes; per-component reconciliation; mark the other proposals Superseded.
- `sync_partner_active_client_counts()`: recalculate **only** the affected partners (old and new on reassignment, old on delete), never all of them.
- HQ Direct revenue: the client is flagged explicitly as HQ direct (no partner). Revenue history accepts a null partner when the client is HQ direct, and only then. Partner metrics, commissions and partner reports exclude it; HQ reports show it as "HQ Direct". Before changing this, I audit every query, view, RLS policy and function that assumes revenue has a partner.

## 5. Existing data to review (report only, no automatic fixes)
- The 2 PROD renewals marked Completed with no closure data: read-only SQL to list them, plus a proposal per record (close properly, revert to open, or mark as historical).
- Every renewal with Completed/Won/Lost and no `closed_at`, in TEST and PROD.
- Proposals at Ready that were only promoted by a download.
- KeepIT perpetual clients showing an annual licence renewal.
- Clients where one renewal row mixes components with different end dates.

## 6. Sequence (keeps TEST and PROD aligned)
1. Read-only PROD comparison: the schema diff for renewals, proposals, revenue history, client counts and `close_renewal`, plus the data review lists. You or someone with PROD access runs it.
2. Write one migration set from the **PROD baseline**, not from TEST's history. Rehearse it on TEST.
3. Fix the two PROD blockers (targeted client counts, HQ Direct revenue) in the same reviewed set.
4. Frontend changes behind the new states. Focused tests for the state machine, close rules, reconciliation and multiple proposals.
5. TEST end-to-end through the interface: new client, award, client/licence/contract, Year 2 proposal, close negotiated, close with no changes, close Lost, the partner tab route.
6. Apply to PROD in a controlled window, then repeat step 5 on PROD with one QA record and clean it up.

## 7. Decisions I need from you
- **D1** Acceptance evidence for "negotiated": is a recorded date + client contact + note enough, or must a signed document be attached?
- **D2** "No changes" path: allowed only when the contract has an auto-renewal clause, or also with a recorded client confirmation? Is price indexation (e.g. inflation %) allowed here, or does any price change force a negotiated proposal?
- **D3** Who may close: HQ only, or also partner admins for their own clients?
- **D4** Do S&AT and hosting with the same end date always form one cycle, or should hosting always be separate?
- **D5** Reason categories for legitimate value differences: proposed list is price change, plan change, discount, indexation, scope change, other (note required). OK?
- **D6** Should "Sent" be set manually, or automatically when the document is downloaded?
