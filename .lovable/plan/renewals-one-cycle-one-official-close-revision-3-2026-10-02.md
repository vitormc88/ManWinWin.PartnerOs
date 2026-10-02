# Renewals: one cycle, one official close (revision 3)

Planning only. Nothing is authorised in TEST or PROD. Each phase, including 0A, needs its own approval.
Labels: **Verified** = read directly in code or TEST. **PROD (you)** = your direct checks. **Inferred** = still needs checking on PROD.

## 1. Facts

| # | Finding | Source |
|---|---|---|
| F1 | DOCX/PDF promotes a Draft to Ready only in the opportunity proposals list (DealDetail). Renewal proposals never go through it. | Verified (code) |
| F2 | The renewal assistant only saves Draft. A Ready save path exists but is never called, and its checks run only in the browser. | Verified (code) |
| F3 | **"Award & Convert" on an opportunity needs Ready/Sent/Accepted/Won.** Today a download is the only way an opportunity proposal reaches Ready. Removing that promotion without a replacement would break award. | Verified (code) |
| F4 | Partner > Renewals sets Completed/Lost directly. | Verified (code) |
| F5 | When a client's only real renewal row is closed, an open row built from contract/licence/S&AT dates takes over, so Lost reappears as pending. | Verified (code); interface not yet tested |
| F6 | `trg_sync_partner_active_client_counts` on PROD fires **FOR EACH STATEMENT**; the function is not in TEST. | PROD (you) |
| F7 | 2 PROD renewals are Completed with no formal close. | PROD (you) |
| F8 | Proposal type allows Draft/Ready/Sent/Won/Lost. The award and close code also accept "Accepted". | Verified (code) |

## 2. Decisions D1–D6
Approved as the design basis (acceptance evidence, no-changes route, who closes, cycle grouping, difference categories, Sent). The wording is unchanged from revision 2.

## 3. Phases

### Phase 0A: Read-only inventory (no writes anywhere)
Deliverables and test matrix are in section 4.

### Phase 0B: Align TEST (needs separate approval)
- The goal is to **reproduce** the PROD P0 on TEST, not to mirror defects blindly. Only objects that phases 1–2 touch are aligned, each with a stated reason from the 0A diff.
- `sync_partner_active_client_counts()` and its statement-level trigger go on TEST exactly as on PROD, **only** to reproduce the award failure. They are applied in one migration that 1a replaces directly, so other TEST work never runs on the defect for long. The TEST automated tests that create clients are listed and re-run before and after.
- **Acceptance:** the award failure reproduces on TEST; no other TEST test changes result.
- **Rollback:** drop the added trigger and function (TEST only; no data involved).

### Phase 1a: Client counts, affected partners only
- Keep the trigger statement-level (efficient for bulk operations), and use **transition tables** (`REFERENCING OLD TABLE / NEW TABLE`), with separate INSERT, UPDATE and DELETE triggers.
- Affected set = the union of the partner from each new row and the partner from each old row, wherever the partner, the `Active` status or the soft-delete flag changed. This covers bulk changes, a partner moving to another (old and new), and Active ↔ inactive.
- Recalculate with one grouped count, only for that set. `WHERE true` is never used.
- **Tests:** insert 1 and 50 clients across 3 partners; move a client A→B; Active→Inactive→Active; soft-delete; an update with no relevant change. Each test asserts (i) the exact set of recalculated partner ids (captured in a test log), (ii) counts equal to a full independent recount, (iii) untouched partners unchanged, including `updated_at`.
- **DB/app compatibility:** a function-only change. Every app version works.
- **Rollback:** reinstalling the old version would bring P0 back, so it is **not** the rollback. Instead, a known-safe fallback: a per-row trigger that recalculates OLD/NEW partners, tested in the same run. If PROD validation fails, the fallback is installed and counts are recomputed once for the partners involved.

### Phase 1b: HQ Direct revenue
- Inventory first (from 0A): every view, function, policy, report, commission and metric that assumes revenue has a partner.
- An explicit HQ Direct flag on the client. Revenue history allows no partner only for flagged clients (database guard). Partner metrics and commissions exclude it; HQ reports show "HQ Direct".
- **Acceptance (full path, TEST then PROD):** HQ Direct client → proposal awarded → contract, licence and renewal created → Year 2 renewal proposal → closed Renewed → HQ Direct revenue row recorded → next cycle created. Commissions, partner metrics and partner client counts receive **nothing** from it. Repeat with a partner client as a control.
- **Compatibility:** an additive column and guard. Old app versions keep working; they just don't show the label.
- **Rollback:** the guard is relaxed to the previous rule only if no HQ Direct rows exist yet. If they do, the rows and the flag stay (no data loss) and only the reporting change is reverted. If PROD validation fails mid-way, block HQ Direct award in the interface until the fix is in.

### Phase 2: Close the gaps in today's flow

**Status transition matrix (enforced by database operations):**

| From → To | Opportunity proposal | Renewal proposal | How |
|---|---|---|---|
| Draft → Ready/Validated | Yes, with checks | Yes, with renewal readiness checks | `validate_proposal` (one transaction) |
| Draft → Ready by download | **Kept until a Validate button exists on the opportunity page**, then removed in the same release | Never | — |
| Ready → Sent | Manual / sent by PartnerOS | Manual / sent by PartnerOS | `mark_proposal_sent` |
| Ready/Sent → Accepted | Not introduced (award stays as today) | Yes, with D1 evidence | `record_proposal_acceptance` |
| Ready/Sent/Accepted → Won (award) | As today ("Award & Convert") | Not used; closing uses Accepted | existing award |
| → Rejected / Superseded | Unchanged (Lost) | Rejected manually; Superseded on close | close operation |
| Direct status edit outside these operations | Blocked except Draft edits | Blocked | trigger guard |

- "Validated" is only an interface label for `Ready` on renewals, so the stored value stays `Ready` and opportunities are unaffected.
- **Existing records:** opportunity proposals keep their status. Renewal proposals at Ready with no validation trail are listed in 0A and get no automatic change; they can still be closed only after recording acceptance.
- **2c** Partner tab: operational edits stay; Renewed/Lost open the official dialog. A guard blocks Completed/Won/Lost outside `close_renewal`.
- **2d** `close_renewal`: an explicit Accepted proposal + evidence; D3 permissions; same-component, same-period reconciliation.
- **2e Ambiguity guard:** while renewals are still grouped by client, closing is **blocked for manual review** when the client's open components have different contracts, agreements or end dates. The list of these clients comes from 0A.
- **2f Lost stays closed:** a closed cycle suppresses derived rows for the same period in Renewals, Client and Partner, including the contract-date and licence-date fallbacks. Tests cover each view and each fallback source.
- **Acceptance:** the full opportunity award flow still works (regression); renewal Draft→Validated→Sent→Accepted→Renewed; no Validated without checks; download never changes renewal status; partner tab can't close directly; ambiguous clients are blocked; Lost never reappears in the three views; partner admin can't close another partner's or HQ Direct renewals.
- **Compatibility:** release DB first (new operations and guards in **warn mode**: log, don't block), then the app, then switch guards to block. The old app keeps working while in warn mode.
- **Rollback:** switch guards back to warn (instant, no data loss). New statuses and evidence stay stored. The old app tolerates `Accepted` (it is already in its eligible list).

### Phase 3: No-changes route (D2)
A sub-plan with the exact evidence fields and records created, for approval before any build.

### Phase 4: Cycles by contract/service + history
- Inventory, then a per-client review and migration.
- **Reversal plan:** the migration writes a mapping table (old row → new cycles) and never deletes source rows (they are marked superseded). Reversal = re-point the views to the source rows and clear the superseded marks. The app reads the cycle model behind a switch, so the previous app version keeps working on the source rows. If PROD validation fails, the switch goes off and the mapping is kept for analysis.

## 4. Phase 0A: deliverables and test matrix

**Deliverables (read-only):**
1. A PROD script (SELECT only, catalogue + data counts) for you to run in the SQL editor, plus the same script on TEST run by me.
2. A TEST↔PROD diff for: proposals/renewals/contracts/licences/revenue history/clients columns and constraints; `close_renewal`, award/convert and client-creation functions; client-count function + trigger (timing, level, transition tables); proposal/renewal triggers and policies; commission and metric functions or views that read partner revenue.
3. The 2 Completed PROD renewals: identity, client, partner, dates, contract/licence, proposals, activities, revenue rows, a derived-row check, and an individual recommendation.
4. Inventories: revenue paths that assume a partner; clients with ambiguous components; renewal proposals at Ready without a validation trail; closed rows without `closed_at`; Lost renewals that currently reappear; KeepIT perpetual clients with no active S&AT/hosting.
5. A short report: verified vs inferred, plus the proposed scope for 0B.

**Test matrix (each check states its expected result):**

| # | Check | TEST | PROD | Pass when |
|---|---|---|---|---|
| T1 | Script contains no DML/DDL/function calls | grep + review | same file | 0 matches |
| T2 | Client-count trigger definition | absent | statement-level, as reported | matches F6 |
| T3 | `close_renewal` signature + eligible statuses | read | read | diff recorded |
| T4 | Award/convert function: client-creation path | read | read | the P0 cause is identified |
| T5 | Revenue NOT NULL / FK on partner | read | read | HQ Direct block located |
| T6 | Commission/metric objects reading revenue | list | list | full list |
| T7 | 2 Completed records | n/a | full context | 2 dossiers |
| T8 | Ambiguous-component clients | count + list | count + list | lists produced |
| T9 | Lost visible as pending | list | list | lists produced |
| T10 | Row counts before/after the script | equal | equal | no change |

## 5. Open for you
- Approve 0A (reading only).
- Decide each of the 2 PROD Completed records after their dossiers.
- Approve 0B, then each later phase and each PROD apply separately.
