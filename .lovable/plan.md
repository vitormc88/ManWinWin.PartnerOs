# Audit — Ideal Prospecting Data Model v1 (Target Account) vs current PartnerOS

Audit only. No code, schema, data, permission or UI changes were made.

## 1. What already exists and can be reused

**Entities (verified in the connected TEST database schema)**

| Concern | Existing | Notes |
|---|---|---|
| Inbound/partner leads | `incoming_leads` (47 cols) | company_name, country, sector, job_role, notes, lead_source, `linked_partner_id`, `assigned_user_id`, qualification fields (TIMD: interest/timing/budget/decision), `fit_*` booleans, engagement + nurture fields, `converted_to_deal_id` |
| Opportunities | `deals` (35 cols) | company_name, country, industry, stage, expected_value, probability, close date, `client_id`, `assigned_user_id` |
| Customers | `clients` (39 cols) | has `website`, `sector`, `country`, `partner_uuid` — the only place a company website field exists today |
| People | `deal_contacts` (role, is_decision_maker), `client_contacts` (role_function, is_primary) | Contact-role + primary-flag pattern already exists twice |
| Activity/evidence-ish | `deal_activities` (type, subject, description, date, tags, participants), `lead_contact_attempts` (channel, outcome, notes) | Timestamped narrative records, but attached to deals/leads |
| Tasks | `manual_tasks` with generic `related_source` / `related_type` / `related_entity_id` / `related_route` / `related_company` | Genuinely polymorphic — a new entity can plug in with no schema change |
| Scoring precedent | `src/lib/qualification.ts` — `fitScore()`, `qualificationSignals()`, `missingInformation()`, `qualificationReadiness()`, TIMD completion | Pure functions, no AI, exactly the style a Fit/Signal/Access/Complexity scorer should follow |
| Partner scoping | RLS on `incoming_leads` / `deals`: HQ sees all, partner sees own via `get_user_partner_id()`; module permissions via `user_module_permissions` + `MODULE_KEYS_LIST` in `src/lib/module-access.ts` | Reusable pattern verbatim |
| Reusable UI | `src/pages/IncomingLeads.tsx` + `LeadDetail.tsx` (workspace layout, filters), `CreateLeadDialog`, `ConvertToOpportunityDialog`, `OutreachIntelligence`, `LeadTaskList`, `CountryCodeCombobox`, `EntityCombobox`, `SECTOR_OPTIONS`/`COUNTRY_LIST` | Layout and conversion-dialog patterns transfer directly |
| Academy | DB-driven Phase/Module/Mission/Resource + explicit mission completion | A pilot mission can link out to real records |

**Semantic precedent worth copying:** `qualification.ts` already documents three deliberately separate concepts (lifecycle status vs engagement state vs qualification stage). A Target Account status set fits that discipline naturally.

## 2. What is missing

- No account-first entity. Every company-shaped record today is already a Lead, a Deal, or a Client. There is no pre-lead research object.
- No maintenance-fit indicator set (asset intensity, criticality, multi-site, planned maintenance, spare-parts complexity, traceability, service complexity). `fit_*` booleans on leads are qualification-fit, not prospecting-fit.
- No evidence records with fact/source/link/date, and no place for an explicitly-labelled hypothesis distinct from a fact.
- No signal taxonomy (expansion, CAPEX, hiring, leadership, digital/ERP, compliance, sustainability, acquisition, new contract) with date/source.
- No structured "what we don't know" unknowns or Key Research Gap.
- No prioritisation model Fit+Complexity+Signal+Access = /12 with bands and Confidence.
- No people layer detached from a deal/client (`deal_contacts` requires a `deal_id`; `client_contacts` requires a `client_id`).
- No website/domain field outside `clients`, and no domain normalisation or duplicate detection anywhere (the only uniqueness guard found is `partners_company_name_unique_normalized_idx`).
- No Research Completeness or prospecting-quality analytics.
- No Academy → real-record bridge.

## 3. What should NOT be reused (belongs to a later stage)

- `deals.expected_value` / `total_value` / `probability` / `expected_close_date` / `stage` and `PIPELINE_STAGES` — purchase-probability semantics; Target Account priority is research effort, not likelihood to buy.
- `incoming_leads` TIMD block (interest/timing/budget/decision) and `disqualified_reason`/`nurture_*` — confirmed qualification, later than prospecting.
- `deal_registrations`, `commissions`, proposals/pricing — commercial stage.
- `PIPELINE_STAGES` and `LIFECYCLE_STATUSES` must not absorb Researching/Ready for Outreach/Deprioritised/Converted; that would collapse three distinct ladders into one.

## 4. Recommended conceptual data model mapped onto existing architecture

New first-class parent plus small child tables, mirroring the existing `deals → deal_contacts/deal_activities` shape:

```text
target_accounts (1)                     status: Researching | Ready for Outreach | Deprioritised | Converted
  company_name, country, website, website_domain (normalised),
  industry/maintenance_environment, size_context
  fit_indicators (jsonb array of enum keys) + fit_score 0-3            [block 2]
  maintenance_hypothesis (short text)                                  [block 3]
  signal_score 0-3, complexity_score 0-3, access_score 0-3             [block 7]
  confidence (low|medium|high), priority_total (derived /12)
  unknowns (jsonb array of enum keys) + key_research_gap               [block 6]
  owner_user_id, partner_uuid, created_by, timestamps
  converted_lead_id / converted_deal_id (nullable, set on Converted)
    |
    +-- target_account_evidence   fact, source, link, evidence_date    [block 3]
    +-- target_account_signals    signal_type, description, signal_date, source  [block 4]
    +-- target_account_people     name, job_title, conversation_role, is_primary_contact  [block 5]
```

Scores stay in one row so filtering/sorting is cheap; the three child tables carry repeatable records. `manual_tasks` attaches with `related_type='target_account'` — no task schema change. Enum key lists live in a new pure module (`src/lib/prospecting.ts`) alongside a `researchCompleteness()` and `priorityBand()` scorer, following `qualification.ts` conventions.

RLS/permissions: copy the `incoming_leads` policy shape exactly (HQ full, partner scoped by `get_user_partner_id()`, insert open to authenticated with owner stamped), plus GRANTs to `authenticated`/`service_role`, and add a `prospecting` (or `target_accounts`) key to `MODULE_KEYS_LIST` so it is governed by the same module-permission UI.

## 5. Recommended UX flow

```text
/prospecting                 list + filters (status, priority band, owner, country, fit/signal score)
   -> New Target Account     company + country + website only (30-second capture)
/prospecting/:id             research workspace, 7 blocks as stacked cards:
   Company | Why It Fits | Evidence & Hypothesis | Signals | People | What We Don't Know | Prioritisation
   right rail: Research Completeness %, priority /12 with band, confidence, next research gap
   status control: Researching -> Ready for Outreach (soft gate: warn, do not block, if
                   fit indicators, >=1 evidence, hypothesis, >=1 person are missing)
                -> Deprioritised (reason note)
   "Convert" action, only from Ready for Outreach, reusing the ConvertToOpportunityDialog pattern:
       creates an incoming_lead (default) pre-filled from company + primary contact,
       stamps converted_lead_id, sets status Converted, makes the account read-mostly.
```

Academy pilot "Build your First 5 Target Accounts": mission body links to `/prospecting`, completion checked against 5 accounts owned by the learner, with at least one evidence record and a hypothesis each.

## 6. Minimum viable vs nice-to-have

**Minimum viable**
- `target_accounts` + `target_account_evidence` + `target_account_signals` + `target_account_people` with GRANTs and partner-scoped RLS.
- `src/lib/prospecting.ts` pure helpers: indicator/signal/role/unknown vocabularies, priority total + band, research completeness.
- List page, detail workspace with the 7 blocks, status transitions, convert-to-lead action.
- Module key + sidebar entry + route guard.
- Domain normalisation on save plus a soft duplicate warning against existing target accounts, `incoming_leads`, `deals`, `clients`.

**Nice-to-have later**
- Prospecting analytics (completeness distribution, signal freshness, conversion rate by priority band, evidence-per-account).
- Academy mission auto-verification against real records.
- Bulk import of target accounts, and account-level task templates.
- Merge/dedupe tooling and shared company-identity service across leads/deals/clients.

## 7. Risks and migration considerations

- **No data migration required.** This is additive; existing leads/deals/clients are untouched. Do not backfill target accounts from existing leads — a lead is downstream of a target account, and retro-generating parents creates fake research history.
- **Semantic drift risk:** the biggest danger is teams using Target Accounts as a second lead list. Mitigate by keeping value/probability/timeline fields absent from the schema, not merely hidden in the UI.
- **Status ladder pollution:** keep the four target statuses in their own column and vocabulary; never map them into `LIFECYCLE_STATUSES` or `PIPELINE_STAGES`.
- **Duplicate ambiguity:** company matching across four tables with only normalised-name and no domain today; ship domain normalisation with warnings only, never hard blocks, or partners will be unable to record legitimate subsidiaries.
- **Partner visibility:** decide explicitly whether HQ sees partner target accounts (recommended: yes, read-only visibility as with leads) before launch, since prospecting lists are competitively sensitive.
- **Conversion irreversibility:** allow reopening a Converted account only by HQ, and always keep the link to the created lead for traceability.

## 8. Recommendation on entity shape

Introduce `Target Account` as a **new first-class entity**, not an extension of `incoming_leads` or `clients`.

Reasons grounded in the current implementation: `incoming_leads` already carries 47 columns with confirmed-qualification semantics (TIMD, engagement, nurture, disqualification) and an ingestion webhook that would start creating half-formed target accounts; `clients` means "paying customer" and is wired to licenses, contracts, renewals and revenue; `deals` is value/probability-bearing. Overloading any of them would force conditional semantics into RLS, analytics and every existing screen, and would break the methodology rule that Target Account != Lead != Opportunity. A separate table with a one-way `Converted -> lead` link keeps each stage's vocabulary clean and lets the Academy methodology remain the source of truth.

**Naming:** use `target_accounts` / module key `prospecting`. Avoid `accounts` (collides conceptually with `clients` and with `account_manager` columns) and avoid `prospects` (already implied by `deal_registrations` language).
