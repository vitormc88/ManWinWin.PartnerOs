# Partner Growth — Sprint 4B technical & product design (TEST design only)

**Date:** 2026-10-11  
**Depends on:** Sprint 4A + hardening PR #22  
**Current status:** design for review; no operational conversion deployed  
**Owner:** HQ Partner Growth  
**Non-goals:** merging into main/PROD, sending invitations, assigning Academy completions, issuing certifications, changing commercial rights automatically

## Goal

Convert a **Signed + legally reviewed + ready_for_handoff** partner prospect into **one** operational PartnerOS partner record, preserving the recruitment trail. Then separately invite users and assign precisely scoped Academy/operational access.

### Terminology (do not conflate)

- **Recruitment stage**: prospect negotiation and contract executed.
- **Converted/official partner**: operational partner record exists; agreement is valid.
- **Invited**: one or more named contacts have been authorized and invited to a scoped user role.
- **Academy readiness**: individual learning and practical validation, read from real Academy records.
- **Commercially activated**: partner has completed the first qualified activity appropriate to CMSC/CMAR/CMAI. Not equivalent to account creation or signature.

## Read-only findings from current TEST/schema

1. `partner_prospects.converted_partner_id` is already unique, FK to `partners.id`; the current `pg_prospect_guard` deliberately rejects all changes to conversion fields. A dedicated guarded procedure / receipt and trigger review are necessary.
2. `partners` auto-generates `partner_code` on insert, has unique lower(trim(company_name)) and currently defaults to `status='Active'`, `is_active=true`, `partner_type='Reseller'`, `partnership_level='Reseller'`. Must **never** rely on these defaults in conversion.
3. There are existing `partners` matching `partner_type='Strategic Connector'`; current `partnership_levels` includes Reseller, Implementer, Integrator and Strategic Partner. Model-to-operational-field mapping must be explicit and reviewed, especially CMSC vs `Strategic Partner`.
4. `profiles` and `user_roles` are tied to `auth.users`. Current `admin-create-user` invitation flow creates an active profile and grants role template permissions. It is **not** an appropriate atomic extension to conversion.
5. Current partner role templates have `onboarding='no_access'`, and the Academy's `can_access_academy()` checks onboarding permission. **No automatic invitation** until role-specific Academy access policy is validated.
6. Real Academy progress/certification is per individual user; the old Academy PartnerLifecyclePanel reads mock data and must not be used as source of activation truth.
7. `partner_onboarding` / `partner_certifications` include legacy text partner_id fields and should not be duplicated or backfilled implicitly.
8. Contract original is not yet stored in a private signed-original vault; current Signed relies on separately verified reference. Conversion must not imply custody or legal reapproval.
9. Partner status has existing Active/Archived operational usage. Any new Onboarding status requires testing every affected dashboard/list/API/RLS. Do not silently choose a new status or mislabel a newly converted CMSC as fully operational.

## 4B.1 — conversion engine (proposed implementation)

### Preconditions — all server checked atomically

- Authenticated, active, internal `hq_admin` only. Other roles and external users fail closed.
- Prospect row locked (`SELECT ... FOR UPDATE`).
- `recruitment_stage='Signed'`, non-null immutable signed agreement date/reference, HQ signature verification stamps.
- `partner_prospect_activation_plans.legal_review_status='approved'`, valid review ref and stamps.
- `readiness_status='ready_for_handoff'`, HQ approver + timestamp, HQ owner, objective and first-value milestone.
- `target_model = proposed_partner_type`.
- Primary contact and **verified legal entity identification** captured/confirmed in a dedicated preflight. Require canonical company/registered name and country; never invent details from drafts.
- `CMSC/CMAR/CMAI` mapping explicitly approved. **Strategic Alliance held for manual specialized flow**, not force-mapped as reseller.
- If normalized company name already exists in `partners`, **block** with existing candidate for HQ adjudication. Do not auto-merge or overwrite. If same prospect already converted, return the original conversion receipt idempotently.
- Ensure no other conversion references that target partner and no duplicate concurrent conversion.

### Atomic transaction and rollback

A single protected `SECURITY DEFINER` SQL RPC (or similarly atomic server-side transaction) should:

1. Validate all preconditions and admin authority, lock prospect.
2. Recheck idempotency + duplicate identity; fail closed with useful messages.
3. Create one `partners` row with **explicit** `partner_type`, `partnership_level`, `status`, `is_active`, HQ manager/owner, signatory/primary contact, country and partner code through existing generation trigger. Do not grant roles, create users, alter Academy progress or grant commercial rights.
4. Create immutable, private HQ-only conversion receipt (prospect id, partner id, signed contract reference, type, approver identity, performed at, immutable preflight snapshot). Unique per prospect and per partner.
5. Update original prospect's `converted_partner_id` and `converted_at` via narrowly revised trigger: allow **only** if a matching receipt created by the verified admin transaction exists, otherwise reject direct updates.
6. Record HQ audit event. Return the new partner ID + receipt.

If any action fails, the whole transaction rolls back. Retrying after network interruption returns the same resulting partner and never creates a second row. Never use permissive session GUC flags as a trigger bypass.

### UX

On Prospect 360° > **Activate**:

- Before eligible: readiness checklist with unresolved blockers, no conversion control.
- Eligible: **Prepare conversion** opens read-only review of identity, type, HQ owner, legal reference, primary contact, and activation status; highlighted rights warning.
- Final confirmation is a separate action: **Convert to Official Partner** requiring explicit acknowledgement of the signed version, verified legal identity and no automatic invitations.
- Success: link to operational partner detail; original prospect remains readable with immutable conversion receipt and navigation back to recruitment history.
- Already converted: show "Official partner" and existing link; no second button.
- A partner cannot trigger this action by sending their own request to the RPC.

## 4B.2 — access + Academy (separate work package)

- HQ chooses specific named contacts and roles **after** conversion. Never send a blanket invite to all prospects.
- Define a **CMSC minimum-permission template** before first invitation: Academy (onboarding), permitted referral submission, own activity visibility, no unrelated clients/pipeline/account administration; implement explicit RLS/capability gates.
- CMAR and CMAI receive progressive privileges only after relevant authorization, not immediately at contract signature. Academy module access follows actual `onboarding` permission.
- Reuse `admin-create-user` only after inspecting invitation, redirect, email collisions, role templates and existing-user handling. Prefer invite mode, no generated passwords in messages.
- Academy remains the source of progress and accreditation, never bulk-complete course records during conversion.
- Activation milestones reflect qualified lead for CMSC, commercial demonstration + qualified opportunity for CMAR, and supervised technical validation for CMAI.

## Design decisions requiring approval before transactional code

1. **Operational lifecycle status:** propose a separately visible `activation_phase` (Invitations Pending / Activating / Commercially Active), while keeping `partners.status` compatible with existing operational consumers. Decide whether `status='Onboarding'` is permissible only after downstream regression. No accidental "Active Reseller" as default.
2. **Exact business mapping:** CMSC → partner_type `Strategic Connector`; CMAR → `Reseller`; CMAI → `Implementer`. Confirm the corresponding partnership_level for each (especially CMSC) and distinguish role capability from contractual remuneration.
3. **Legal identity preflight:** source of truth for registered legal name/registration number, country and signatory, and where the signed original is stored.
4. **First invite policy:** CMSC restricted profile does not currently have Academy access. Approve new role template/gated permissions before sending any invitation.

## Acceptance tests to require before sign-off

| Case | Expected |
|---|---|
| Unsigned/legally pending/plan incomplete | Server refuses conversion |
| HQ Standard / external user | Server refuses conversion |
| HQ Admin eligible and confirmed | Exactly one partner + linked receipt/prospect |
| Same conversion submitted twice or concurrently | Same partner ID, no duplicates |
| Duplicate normalized company name | Block and return actionable conflict; no merge |
| Failure between partner INSERT and prospect link | Transaction rolled back |
| Wrong/unapproved target model or missing identity | Block |
| Conversion succeeds | No users, invitations, Academy completions or credentials created |
| After conversion | Prospect history retained; partner route opens |
| CMSC invitation (4B.2 only) | No unrelated clients/pipeline/admin rights |
| PROD before release | No Partner Growth tables or conversion routines touched |

Run TEST rollback-only SQL regressions with simulated authenticated roles, component Vitest tests, Vercel preview build, and eventually browser-authenticated HQ Admin / HQ Standard tests. Require explicit approval for any PROD migration or real invitations.

## Proposed delivery order

1. Approve the four design decisions above.
2. 4B.1: conversion preflight, immutable receipt and atomic RPC + UX in TEST (no user creation).
3. 4B.1: idempotence, conflicts, role isolation, failure rollback and navigation QA.
4. 4B.2: permission templates, contact invite flow, Academy access and real first-value milestone integration in TEST.
5. Separate release approval for PROD.
