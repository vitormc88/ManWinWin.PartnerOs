# Prospecting / Target Account — Final v1 Architecture Plan

Plan only. No code, schema, data, permission, route or UI changes.
Methodology correction applied: **Ready for Outreach does not create a Lead.** The Target Account stays the active parent record throughout Module 5 — Outreach & Engagement.

## 1. Target Account lifecycle and transition rules

```text
Researching ──► Ready for Outreach ──► Converted (Lead created)
     │                  │
     └──────────────────┴────────► Deprioritised ──► (reopen) Researching
```

| From | To | Trigger | Rule |
|---|---|---|---|
| — | Researching | Account created | Only company name + country required |
| Researching | Ready for Outreach | User action "Mark Ready for Outreach" | Soft gate: warn (never block) if fit indicators empty, no evidence record, no hypothesis, or no person with a conversation role |
| Ready for Outreach | Converted | User action "Create Lead from this Account" | Requires a primary prospecting contact with at least one usable channel; the only event that creates a Lead |
| Researching / Ready for Outreach | Deprioritised | User action + short reason | Reason stored as free text; account remains readable and reopenable |
| Deprioritised | Researching | "Reopen" | Clears deprioritised reason to history note |
| Converted | any | — | Terminal for owners; HQ-only unlink/reopen, always preserving `converted_lead_id` |

Outreach happens **inside** `Ready for Outreach`. No additional status is required: outreach state is a property of activity records (last attempt, outcome, channel), not of the account's lifecycle. Adding an "In Outreach" status would duplicate what the activity log already answers and would create a second, drifting ladder. Recommendation: keep the four statuses; expose a derived, non-persisted *engagement chip* on the list ("No outreach yet / Attempted / In Conversation / Silent") computed from activities, exactly as `qualification.ts` separates engagement state from lifecycle status today.

## 2. Exact meaning of each concept

| Concept | Means | Owner question | Created when |
|---|---|---|---|
| **Target Account** | A company we have chosen to research and pursue attention on. No relationship required. | "Is this worth our time, and what do we still not know?" | We decide to research it |
| **Lead** (`incoming_leads`) | A company **plus a person** where meaningful two-way engagement or a legitimate next step exists. | "Is this real and qualifiable?" | Someone replied, met us, requested something, or a concrete next step is agreed |
| **Opportunity** (`deals`) | A qualified, valued pursuit with stage, value and expected close. | "Will they buy, when, and for how much?" | After qualification |
| **Client** (`clients`) | A paying customer with licenses, contracts and renewals. | "Are we delivering and renewing?" | After a won deal |

Target Account is the only pre-relationship object. It never carries budget, timeline, TIMD, expected value, probability, close date, product recommendation or proposal data.

## 3. Final database entities and relationships

```text
target_accounts ──1:N── target_account_evidence
       │        ──1:N── target_account_signals
       │        ──1:N── target_account_people
       │        ──1:N── target_account_activities   (Module 5 outreach; built later,
       │                                             table shape reserved now)
       └──0:1──► incoming_leads.id  (converted_lead_id, set once, on Converted)

manual_tasks.related_type = 'target_account', related_entity_id = target_accounts.id
   (existing polymorphic task table — no schema change needed)
```

**How outreach attaches later without a redesign:** `target_account_activities` is defined in the v1 migration but not surfaced in the v1 UI. It mirrors the proven `lead_contact_attempts` shape (`channel`, `outcome`, `notes`, `performed_by`, `performed_at`) with an optional `person_id` to `target_account_people`. Module 5 then only adds UI plus a derived engagement chip — no parent-model change, no status change, no data migration. Contacts already live on the account, so outreach never needs a Lead to exist.

## 4. Final field set

**`target_accounts`** (one row = one researched company)

*Company (block 1)*: `company_name` (req), `country` (req, `COUNTRY_LIST`), `website`, `website_domain` (derived, normalised), `industry` (`SECTOR_OPTIONS`), `maintenance_environment` (short text), `size_context` (short text, optional).

*Why It Fits (block 2)*: `fit_indicators` — jsonb array of keys from a fixed vocabulary: `asset_intensive`, `critical_assets`, `dedicated_maintenance_org`, `multi_site`, `planned_maintenance`, `spare_parts_complexity`, `traceability_compliance`, `service_maintenance_complexity`. Plus `fit_score` 0–3.

*Evidence & Hypothesis (block 3)*: `maintenance_hypothesis` (short text, on the parent, visually labelled "what we think is worth investigating — not a fact"). Evidence lives only in the child table, so the two can never be confused.

*Signals (block 4)*: `signal_score` 0–3 on the parent; signal records in the child table.

*Unknowns (block 6)*: `unknowns` — jsonb array of keys: `current_system_process`, `main_challenges`, `team_size`, `asset_environment`, `current_priorities`, `stakeholders`, `project_timing`, `other`. Plus `key_research_gap` (one short line).

*Prioritisation (block 7)*: `fit_score`, `complexity_score`, `signal_score`, `access_score` (each 0–3, default 0), `confidence` (`low|medium|high`), `priority_total` (generated column = sum, /12). `priority_band` derived in the frontend (9–12 High, 6–8 Medium, 0–5 Low) — not stored, so band thresholds can change without a migration.

*Workflow/ownership*: `status`, `deprioritised_reason`, `owner_user_id`, `partner_uuid`, `created_by`, `converted_lead_id`, `created_at`, `updated_at`.

**Children**

- `target_account_evidence`: `fact` (req), `source`, `link`, `evidence_date`, `created_by`, `created_at`.
- `target_account_signals`: `signal_type` (req, from `expansion_new_site`, `new_equipment_capex`, `maintenance_hiring`, `new_leadership`, `digital_transformation`, `erp_technology_project`, `compliance_audit`, `sustainability_efficiency`, `acquisition_growth`, `new_contract_service_expansion`, `other`), `description`, `signal_date`, `source`.
- `target_account_people`: `full_name` (req), `job_title`, `conversation_role` (`maintenance_problem_owner`, `operations`, `management`, `it_technical`, `finance_economic`, `quality_hse`, `user_influencer`, `unknown`), `is_primary_contact` (partial unique index: one true per account), `email`, `phone`, `linkedin_url`, `notes`.
- `target_account_activities` (reserved for Module 5): `channel`, `outcome`, `notes`, `person_id`, `performed_by`, `performed_at`.

**Research Completeness** — derived, never stored, in `src/lib/prospecting.ts`. Eight equally weighted checks: country+industry set, ≥1 fit indicator, fit_score>0, ≥1 evidence record, hypothesis present, ≥1 signal, ≥1 person with a role, key_research_gap present. Displayed as a percentage with the missing items listed, following the `missingInformation()` pattern already in `qualification.ts`.

Completion target: a researched account is ~10 short fields plus 1–3 evidence rows, 0–3 signals and 1–2 people — comfortably 5–10 minutes.

## 5. Status model

Four statuses only: **Researching, Ready for Outreach, Deprioritised, Converted**. No extra outreach status (rationale in §1). Stored in a dedicated `status` column with its own vocabulary in `src/lib/prospecting.ts`; never mapped into `LIFECYCLE_STATUSES` or `PIPELINE_STAGES`.

## 6. Conversion rules

**Event:** explicit user action "Create Lead from this Account", available only from `Ready for Outreach`, only when a primary contact with email or phone exists. Never automatic, never triggered by a status change.

**Copied into the new `incoming_leads` row:** company_name, country, sector (from industry), the primary contact's name/email/phone/job_role, `linked_partner_id` from `partner_uuid`, `assigned_user_id` from `owner_user_id`, `lead_source = 'Prospecting'`, and a notes block containing the hypothesis, the key research gap and a compact evidence/signal digest.

**Not copied:** scores, confidence, fit indicators, unknowns, individual evidence/signal/people rows — those stay on the account as the research record of truth.

**Linked:** `target_accounts.converted_lead_id` → the new lead. Recommended companion: a `source_target_account_id` column on `incoming_leads` for reverse traceability and analytics (one nullable column, no behaviour change to existing leads).

**Original account:** status becomes `Converted`, stays fully readable, becomes read-mostly (evidence/signals/people frozen for editing; a banner links to the lead). It is never deleted or merged, so research history survives.

## 7. UX architecture

**`/prospecting` list**

Columns: Company (+ country flag/name), Industry, Priority `/12` with band chip, Fit / Signal mini-scores, Research Completeness %, Primary contact, Status chip, Engagement chip (derived, once Module 5 lands), Owner, Updated.
Filters: status, priority band, owner, country, industry, confidence, completeness threshold, "has evidence", "has primary contact". Search on company name and domain. Default sort: priority desc, then completeness desc.
Header KPIs: total active accounts, Ready for Outreach count, High-priority count, average completeness.
Primary action: "New Target Account" — company name, country, website only.

**`/prospecting/:id` detail**

Stacked cards, in methodology order: 1 Company · 2 Why It Fits · 3 Evidence & Hypothesis (evidence list above a visually distinct hypothesis box) · 4 Signals · 5 Relevant People · 6 What We Don't Know · 7 Prioritisation (four 0–3 sliders + confidence).
Right rail: Priority /12 + band, Research Completeness ring with the missing-item list, Confidence, Key Research Gap, Status actions (Mark Ready for Outreach / Deprioritise / Reopen / Create Lead), Tasks (via `manual_tasks`), and later the Outreach activity timeline.
Duplicate warning: a non-blocking amber banner on create and on domain edit.
Reuses existing patterns: `IncomingLeads.tsx`/`LeadDetail.tsx` layout, `CountryCodeCombobox`, `SectorSelect`, `LeadTaskList`, and the `ConvertToOpportunityDialog` dialog pattern for the lead-creation dialog.

## 8. Duplicate / company identity

Normalise `website` to `website_domain` (lowercase, strip scheme/`www`/path) on save; normalise company name (lowercase, strip legal suffixes and punctuation) for matching only. On create and on domain change, run a single read-only lookup across `target_accounts`, `incoming_leads`, `deals` and `clients`, matching on domain first then normalised name, and show matches with entity type and a link. **Always a soft warning with "Create anyway" — never a hard block**, because subsidiaries, sites and group companies legitimately repeat. No merge engine, no background dedupe job in v1.

## 9. Permissions / RLS

Reuse the `incoming_leads` model verbatim:
- SELECT: `is_hq_user(auth.uid()) OR (partner_uuid IS NOT NULL AND partner_uuid = get_user_partner_id(auth.uid()))`.
- INSERT: authenticated, with `partner_uuid`/`owner_user_id`/`created_by` stamped from the caller's profile.
- UPDATE: HQ admin/standard, or the owning partner.
- DELETE: `hq_admin` only.
- Children inherit via an EXISTS check on the parent row.
- GRANTs: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`; no `anon` grant.
- New module key `prospecting` added to `MODULE_KEYS_LIST` / `MODULE_LABELS` / `ROUTE_MODULES` / `FALLBACK_MODULE_ORDER`, so it is governed by the existing per-user module-permission UI. Not in `INTERNAL_ONLY_MODULES` — partners are the primary users.

## 10. Academy integration (Module 4 pilot)

The mission "Build your First 5 Target Accounts" links to `/prospecting` and is verified by data, not by UI steps: a single read-only SQL helper counts target accounts owned by the learner that meet a methodology bar (≥1 evidence record, hypothesis present, ≥1 person with a role, fit_score set). Because the check reads tables rather than clicks, screens can be redesigned freely without breaking the mission. v1 ships the mission as a normal manual-completion item with a link and the criteria stated in the copy; automatic verification is a later enhancement using the same helper. The methodology vocabularies (indicators, signal types, roles, unknowns) live in one pure module so Academy copy and the product read the same list.

## 11. MVP vs later

**MVP (v1)**
- Four tables + reserved activities table, RLS, GRANTs.
- `src/lib/prospecting.ts` pure helpers: vocabularies, `priorityTotal`, `priorityBand`, `researchCompleteness`, `missingResearchItems`, `normaliseDomain`, status transition guards.
- `/prospecting` list + `/prospecting/:id` detail with the 7 blocks and right rail.
- Status actions, soft readiness gate, Create Lead conversion with `converted_lead_id` + `source_target_account_id`.
- Soft duplicate warnings; tasks via `manual_tasks`.
- Module key, sidebar entry, route guard.
- Unit tests for scoring, completeness, domain normalisation, transition guards; RLS tests for partner isolation.

**Later**
- Module 5 outreach timeline UI on the reserved table + derived engagement chip.
- Prospecting analytics (completeness distribution, signal freshness, conversion by band, evidence per account).
- Automatic Academy mission verification.
- Bulk import, AI/auto signal discovery, dedupe/merge engine, account-level task templates, territory rules.

Explicitly **out** of v1: AI automation, advanced analytics, bulk import, auto-signal discovery, merge engine.

## 12. Migration and environment safety

Before any migration runs, the implementation must verify and state in the chat:
1. The connected Supabase project ref, and that migrations are being applied to **TEST `avxxzmoayxzrykwqzoqn`** only.
2. That PROD `qownzparzsaeoyccgwuj` is untouched — no query, no migration, no seed against it during the build.
3. Every new `public` table has explicit GRANTs in the same migration, RLS enabled, and policies created in the required order.
4. The migration is additive only: no ALTER of `incoming_leads` beyond one nullable `source_target_account_id` column, no changes to `deals`, `clients`, `manual_tasks`, or any existing policy.
5. Idempotency: `CREATE TABLE IF NOT EXISTS`, guarded policy creation, re-runnable without error.
6. Verification after apply in TEST: partner-isolation checks with a simulated user (rolled back), one full create → research → ready → convert cycle, and confirmation that no durable test rows remain.
7. PROD rollout is a separate, explicitly requested step with the same migration file, validated independently — never bundled with the TEST build.

## Recommended v1 (implementation-ready)

Build `Target Account` as a new first-class entity: `target_accounts` plus `target_account_evidence`, `target_account_signals`, `target_account_people`, and a reserved `target_account_activities`. Four statuses; Ready for Outreach is where outreach happens and creates nothing. A Lead is created only by an explicit "Create Lead from this Account" action once real engagement exists, copying company + primary contact + context notes and linking both ways. Scores are four 0–3 sliders totalling /12 with derived bands, plus derived Research Completeness — attention prioritisation, never purchase probability. Partner-scoped RLS copied from `incoming_leads`, governed by a new `prospecting` module key. Soft duplicate warnings on domain and normalised name across four tables. No budget, timeline, TIMD, value, probability, close date or product fields anywhere in the model.

## Unresolved decisions needing business input

1. **HQ visibility of partner target accounts** — recommended: HQ sees all (consistent with leads), but prospecting lists are competitively sensitive; confirm.
2. **Who may create a Lead from an account** — any partner user with edit access, or partner admins only?
3. **Deprioritised reason** — free text, or a fixed picklist for later analytics?
4. **Confidence semantics** — confidence in the research quality, or in the fit judgement? Wording must match Academy copy exactly.
5. **Access score definition** — must be defined by the methodology (e.g. do we have a named contact, a warm path, a channel?) before it is scored consistently.
6. **Whether `source_target_account_id` on `incoming_leads` is acceptable** — it is one nullable column on an existing table; alternative is relying only on the account-side link.
