# PHASE 3 — Relationships & Historical Dates — Audit

Status: **code-first, review-only for schema/data**. No SQL was executed, no
migration applied, no backfill, no infrastructure/deployment change.

---

## 1. Partner reference matrix (from repository migrations + generated types)

| Table | Column | Type | Real meaning | Canonical? |
|---|---|---|---|---|
| `partners` | `id` | `uuid` PK | Canonical partner identity | ✅ source |
| `clients` | `partner_uuid` | `uuid`, FK → `partners.id` (`clients_partner_uuid_fkey`, `ON DELETE SET NULL`) | Canonical relation | ✅ |
| `clients` | `partner_id` | `text`, nullable, **no FK** | Legacy import reference: may be a uuid string, an external key, a code, or free text | ❌ legacy |
| `renewals` | `partner_uuid` | `uuid`, FK → `partners.id` (`renewals_partner_uuid_fkey`) | Canonical relation | ✅ |
| `renewals` | `partner_id` | `text`, nullable, no FK | Legacy reference | ❌ legacy |
| `profiles` | `partner_id` | `uuid` (used by `get_user_partner_id`, RLS) | Partner membership of a user — **different semantics** from `clients.partner_id` | ✅ (own meaning) |
| `deals`, `announcements`, `documents`, `notifications`, `community_posts` | `partner_id` | `uuid`/text mix per table, used by RLS helpers (`can_view_partner`) | Ownership scoping | per-table |
| `commissions`, `partner_badges`, `partner_certifications`, `partner_health_scores`, `partner_missions`, `partner_notes`, `partner_onboarding`, `partner_renewal_settings`, `partner_tiers` | `partner_id` | `uuid` NOT NULL | Direct partner child records | ✅ |
| `incoming_leads` | `linked_partner_id` / `linked_partner_name` | uuid / text | Lead → partner link + denormalised label | ✅ / display only |

Backfill history: migration `20260626112901` added `partner_uuid` to `clients`
and `renewals` and copied `partner_id::uuid` **only** where the text matched the
uuid regex *and* an existing partner row matched. Rows that failed either test
still have legacy-only references today — they must remain visible.

**Dangerous fallbacks found and removed in this phase**

- `clients` list rendered `partnerMap[c.partner_id]` (text key against a
  uuid-keyed map) with an `"Unknown"` fallback → replaced by
  `resolvePartnerIdentity`.
- Partner filter used `c.partner_id === partnerFilter` → replaced by
  `matchesPartnerFilter` (canonical uuid only, plus explicit `hq`/`legacy`).
- Client creation wrote `partner_id` **and** `partner_uuid` with the same value
  → new writes are canonical-only (`buildPartnerCreatePayload`).
- CSV export used the same text-keyed map → now uses the resolved label.

`get_client_commercial_intelligence` already reads `clients.partner_uuid` only
(Phase 2 function, unchanged here).

## 2. Canonical identity layer

`src/lib/partner-identity.ts` is the single shared vocabulary:

- `resolvePartnerIdentity(record, partners)` → `resolved | legacy_unresolved | conflict | unlinked`.
  Never falls back from `partner_uuid` to `partner_id`; a legacy uuid string
  that differs from the canonical value is reported as `conflict`, not merged.
- `matchesPartnerFilter` for list filtering.
- `buildPartnerCreatePayload` — canonical column only.
- `buildPartnerUpdatePayload` — returns `{}` when the user did not explicitly
  change the partner, so saving other fields cannot rewrite or clear either the
  canonical or the legacy raw value.

## 3. Customer Since — sources and precedence

`src/lib/customer-since.ts`

1. `clients.customer_since` (explicit historical field — **does not exist yet**,
   proposed additively in §5) — factual, confidence `high`.
2. `clients.first_installation_date` — factual, confidence `high`.
3. *(only when `allowEstimate: true`)* oldest `contracts.contract_start_date` —
   `isEstimated: true`, confidence `medium`.
4. *(only when `allowEstimate: true`)* oldest `licenses.license_start_date` —
   `isEstimated: true`, confidence `low`.
5. Otherwise `Unknown / Not recorded`.

`created_at`, `updated_at`, `imported_at` and sync timestamps are **never** a
Customer Since source. `ClientSummaryBar` calls the resolver with the default
(`allowEstimate: false`), so today an unrecorded client shows *Unknown*, where
it previously showed the record-creation date.

## 4. The three date classes

| Class | Fields | Use |
|---|---|---|
| Business date | `occurred_at` (when trustworthy), `metadata.effective_date`, `metadata.occurred_on` | Primary display + primary ordering |
| Record date | `created_at` | Secondary line: "Recorded on …" |
| Import date | `metadata.imported_at` | Secondary line: "Imported on …" |

`lifecycle_events.occurred_at` is `NOT NULL` in production, so imported rows can
carry a technical timestamp there. `resolveTimelineDates` treats `occurred_at`
as unknown when `metadata.occurred_at_known === false`,
`metadata.occurred_at_source ∈ {import, record_created}`, or when it exactly
mirrors `metadata.imported_at`. Unknown-date events are shown as
*Historical date unknown* and sorted last, deterministically (recorded date,
then id) — never injected into the middle of the history. Titles, descriptions,
actors, proposal links and payloads are untouched.

## 5. Review-only schema proposal

`supabase/migrations_review/phase3_01_historical_dates_and_identity.sql`
(additive, nullable, no constraints that reject historical rows, no backfill).

Rollback: every statement is `ADD COLUMN IF NOT EXISTS`; rollback is a
`DROP COLUMN` of the exact new columns listed in the file header. No legacy
column is renamed or removed in this phase.

RLS / grants / Data API impact — **not validated, must be checked in production**:
all proposed columns live on existing tables (`clients`, `lifecycle_events`),
whose policies are visible in the repository migrations; the effective RLS
state, the actual grants to `anon` / `authenticated` / `service_role`, and the
Data API (PostgREST) exposure of those tables were **not** verified here and
must be validated in production immediately before applying the migration.
Adding a column creates no new policy, but it does become readable by any role
that already holds a broad `SELECT` on the table, so column-level sensitivity
must be assessed against the grants observed at that moment.

### 5.1 Timeline columns consumed by the code today

`resolveTimelineDates` already reads `effective_date`, `imported_at` and
`occurred_at_known` as first-class optional columns, falling back to the legacy
`metadata` keys. Because the fields are optional and the query is `select("*")`,
the UI keeps working before and after the migration is applied.

`event_type` is now part of the resolver input: `client_imported` is a
technical import act, so its `occurred_at` / `created_at` is surfaced as
*Imported on …* and never as a historical business date or Customer Since.

## 6. Risks found

- Legacy-only rows previously rendered as `Unknown` partner (indistinguishable
  from a real data error) — now explicitly `Legacy / Unresolved`.
- Divergent `partner_uuid` vs `partner_id` rows can exist; their real count can
  only be confirmed in production.
- Some clients will now display *Unknown* Customer Since. This is intentional:
  the previous value was the PartnerOS record date, not a business fact.
- `lifecycle_events.occurred_at NOT NULL` means historically imported events
  cannot be distinguished with certainty until `metadata.imported_at` /
  `occurred_at_known` are populated by a later controlled migration.

## 7. Phased migration plan

1. **Phase 3 (this one)** — semantics in code only; legacy tolerated and labelled.
2. Phase 3b — apply the additive columns (review-only SQL above) after review.
3. Phase 3c — controlled, ID-explicit backfill with preview `SELECT`s, counts,
   confidence criteria and rollback; no name-matching SQL.
4. Phase 3d — only after (3c) reports zero unresolved rows: consider retiring
   the legacy text columns.

## 8. Read-only findings already confirmed in production

Obtained with read-only inspection; no write, migration or backfill was run.

- `clients.partner_id` = `text`; `clients.partner_uuid` = `uuid` with FK to `partners.id`.
- `renewals.partner_id` = `text`; `renewals.partner_uuid` = `uuid`.
- Watsons (`01fbe90e-d3ea-4635-96aa-8e04060b8182`) is linked to FITC through
  `partner_uuid` (canonical relation, not a legacy-only reference).
- Watsons `first_installation_date` = `2022-07-19`.
- Current identity distribution: 1 client, 0 legacy-only rows, 0 uuid conflicts.
- 3 `lifecycle_events`; none carries `metadata.imported_at`,
  `metadata.effective_date` or `metadata.occurred_at_known`.
- The `client_imported` event has `occurred_at === created_at` — handled in code
  as a technical import act.

## 9. Still only confirmable at apply time

- Effective RLS, grants and Data API exposure of `clients` / `lifecycle_events`.
- Identity-state counts at the moment of the migration (data keeps changing).
- Provenance of any future imported `lifecycle_events` rows.

## 10. Phase 3C — audited write paths for `clients` / `renewals`

Scope: only `public.clients` and `public.renewals`, where `partner_id` is a
LEGACY TEXT column and `partner_uuid` is the canonical FK to `partners.id`.
`partner_id` remains legitimate and canonical in other tables (`profiles`,
`partner_notes`, `partner_certifications`, `deals`, `partner_*` children) and
was deliberately left untouched there.

Write paths inspected in the repository (frontend; no Edge Function writes to
these two tables exist in the repo):

| Path | Table | Before | After |
| --- | --- | --- | --- |
| `src/pages/ClientDetail.tsx` — legacy contract → renewal | renewals INSERT | copied `partner_uuid` **and** legacy `partner_id` | canonical only, via `buildRenewalInsertPayload` |
| `src/lib/lifecycle.ts` — client from won deal | clients INSERT | wrote legacy `partner_id` | `buildPartnerCreatePayload` (uuid only) |
| `src/lib/lifecycle.ts` — renewal from license/contract | renewals INSERT | wrote legacy `partner_id` from client | `buildRenewalInsertPayload(client)` |
| `src/lib/lifecycle-engine.ts` — client from proposal | clients INSERT | wrote legacy `partner_id` | `buildPartnerCreatePayload` |
| `src/lib/lifecycle-engine.ts` — contract renewal | renewals INSERT | wrote both columns | canonical only |
| `src/pages/PartnerDetail.tsx` — manual renewal form | renewals INSERT/UPDATE | shared payload wrote `partner_id` on insert *and* on edit | partner columns removed from the shared payload; insert adds canonical uuid; edit no longer rewrites partner references |
| `src/pages/PartnerDetail.tsx` — materialize derived renewal | renewals INSERT | `partner_id` fallback | canonical `partner_uuid` |
| `src/pages/ClientOnboardingWizard.tsx` | clients + renewals INSERT | already canonical | unchanged |
| `src/pages/ClientsLicenses.tsx` | clients INSERT | already canonical | unchanged |
| `src/hooks/useClients.ts` (`update`, archive, reactivate) | clients UPDATE | passes caller fields / status only | unchanged — never touches partner columns |
| `src/pages/ClientDetail.tsx` — client save | clients UPDATE | `buildPartnerUpdatePayload` (Phase 3B) | unchanged |

Not claimed: this table covers the repository code only. Any write performed
outside this repository (SQL console, external integrations, future Edge
Functions) is not covered and must be reviewed separately.

Reads were not changed: legacy-only rows remain visible and labelled
`Legacy / Unresolved`; no historical record is hidden or normalized.

---

## Phase 3D — Read/write symmetry for partner identity (code-only)

Phase 3C made every `clients` / `renewals` write canonical (`partner_uuid`).
Phase 3D closes the remaining asymmetry on the **read** side.

### Corrected paths
| Path | Before | After |
| --- | --- | --- |
| `src/hooks/useClients.ts` | `.eq("partner_id", filter)` | filter is `partner_uuid`, applied via `applyPartnerScope` |
| `src/pages/PartnerDetail.tsx` | `useClients({ partner_id: id })`, `r.partner_id === id` | `useClients({ partner_uuid: id })`, `belongsToPartner(r, id)` |
| `src/lib/lifecycle.ts` (`findOrCreateClientFromDeal`) | name match scoped by legacy `partner_id` | scoped by canonical `partner_uuid` |
| `src/lib/lifecycle-engine.ts` (`findClientMatches`) | exact + fuzzy match scoped by `partner_id` | scoped by `partner_uuid` |

### Shared helper
`src/lib/partner-query.ts` (pure, tested):
- `canonicalPartnerScope(ref)` → `partner` (uuid) | `hq` (explicit null) | `unresolved` (legacy/non-uuid).
- `applyPartnerScope(query, scope)` → returns `null` for `unresolved`, so callers can never emit a guessed join.
- `belongsToPartner(record, partnerId)` → in-memory equivalent, built on `resolvePartnerIdentity`.

No new canonical/legacy vocabulary was introduced; `partner-identity.ts` remains the single source.

### Legacy-only behaviour (unchanged guarantee)
- Legacy-only rows are never joined, promoted, or auto-attached to a partner.
- They remain visible in unscoped lists as **Legacy / Unresolved** and require explicit human reassignment.
- When a deal/proposal carries a non-uuid partner reference, client matching degrades to an
  unscoped name match instead of a wrong partner-scoped one — an existing canonical client is
  still found, so re-processing the same deal does not duplicate it.

### Not changed (legitimate semantics)
`profiles.partner_id`, `deals.partner_id`, and partner child tables
(`partner_certifications`, `partner_notes`, `partner_missions`, …) keep `partner_id` as their
real relational column. Edge Functions (`admin-create-user`, `ingest-lead`) write
`profiles.partner_id` / `linked_partner_id` and were left untouched.

### Audit limits
- Code-only. No SQL, migration, backfill, or data change was executed.
- Production row-level state was not re-queried in this phase; conclusions about legacy-only
  volumes come from the earlier read-only Phase 3 audit above.
- Behavioural coverage is on the real helpers and the real matching function
  (`src/lib/__tests__/partner-query.test.ts`, `src/lib/__tests__/lifecycle-client-matching.test.ts`)
  with a fully mocked client — no production query is issued by the tests.
