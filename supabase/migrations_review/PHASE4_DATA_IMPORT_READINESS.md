# PHASE 4 — Data Quality & Safe Production Import Readiness

Status: **code-first, review-only**. No SQL, migration, backfill or data change was executed.
Production (including the Watsons client `01fbe90e-d3ea-4635-96aa-8e04060b8182` linked to FITC) is untouched.

## 1. Import write-path matrix

| Path | Mandatory input | Idempotency key | Dependencies | Writes | Rollback |
|---|---|---|---|---|---|
| `src/pages/ClientOnboardingWizard.tsx` (manual legacy onboarding) | client name, partner selection, license, contract lines | none (human-driven, one client at a time) | partner must exist | `clients`, `client_contacts`, `licenses`, `licensed_modules`, `contracts`, `contract_lines`, `renewals` | manual delete of the created client tree |
| `src/lib/lifecycle-engine.ts` → `convertProposalToCustomer` | won proposal + resolved deal | `source_proposal_id` on client/contract; existing-client match by `partner_uuid` + name | proposal, deal, partner | `clients`, `licenses`, `contracts`, `contract_lines`, `renewals`, `lifecycle_events` | `lifecycle_events` trail + `source_proposal_id` |
| `src/lib/lifecycle.ts` → `findOrCreateClientFromDeal` / `createLicenseAndRenewal` | deal with canonical `partner_uuid` | canonical partner scope + exact name (fail-closed when partner is legacy-only) | deal, partner | `clients`, `licenses`, `renewals`, `contracts` | manual |
| `src/pages/ClientDetail.tsx` / `PartnerDetail.tsx` (renewal + contract line CRUD) | client, canonical line type, amount | `renewal-identity.ts` equivalence (client + date + logical target) | client | `renewals`, `contract_lines` | per-record delete dialog |
| `supabase/functions/ingest-lead` | external lead payload | external lead id | — | `incoming_leads` only | not part of the client import surface |
| **Phase 4 (new)** `src/lib/import/import-planner.ts` | validated batch rows | `<identityKey>#<entity>` (deterministic) | partners pre-exist | **none — planning only, no executor** | `rollbackManifest` (list of idempotency keys, reverse order) |

## 2. Input schema

`src/lib/import/import-types.ts` — `ImportClientInput`:
identity (`source_system` + `external_client_id`, or a human-confirmed `client_code`),
`commercial_name`, `country`, `partner_uuid` (or `hq_direct`), optional `legacy_partner_id`
(display only), `license`, `contract` + `lines`, `renewal`, `declared_totals`, `lifecycle_events`.

## 3. Validation rules (`src/lib/import/import-validator.ts`)

Blocking (`blocked`):
- no stable identity key; missing `commercial_name`;
- missing / non-uuid `partner_uuid` for a partner client — a legacy `partner_id` is **never** promoted;
- duplicate identity key inside the batch (all involved rows);
- BackOffice users missing or `<= 0` (BackOffice users = licensed quantity);
- contract line without a canonical `line_type`, `amount`, `currency` or explicit `billing_frequency`;
- mixed currencies in one contract;
- declared vs computed totals differing by more than 1.00 currency unit;
- malformed ISO dates.

Review (`needs_review`):
- non-canonical license product or unresolved hosting;
- name collision inside the batch or against production — **never an automatic merge**;
- module included in Base (e.g. Cost Budget Control) dropped from the module list;
- `renewal_date` different from `contract_end_date`;
- lifecycle event without a historical date (recorded as `occurred_at_known: false`);
- totals differing by 0.01–1.00.

Normalization notes: `Employee Accesses` and the LIC structural license version are ignored;
`Pedidos Manutenção Web` maps to `Maintenance Requests`; an empty operational version stays empty;
`imported_at` / `created_at` are technical and are never used as business dates.

## 4. Execution order and rollback

`clients → licenses → licensed_modules → contracts → contract_lines → renewals → lifecycle_events`
(partners must already exist — they are never created by the import).
Every operation is `insert_if_absent` and matched by explicit external key only.
Rollback uses the plan's `rollbackManifest`: idempotency keys grouped per table in reverse order
(`lifecycle_events` first, `clients` last). It is self-contained and does not depend on TEMP TABLEs.

## 5. Human execution checklist

1. Prepare the batch as `ImportClientInput[]` (canonical `partner_uuid` resolved by a human).
2. Run `validateImportBatch(rows, { existingNames })` and review every warning/error.
3. Resolve `blocked` and `needs_review` rows at the source — never by editing computed values.
4. Run `buildImportPlan(batch)` and inspect the ordered operations plus the rollback manifest.
5. Archive the manifest before any execution.
6. Execution itself is **out of scope for Phase 4**: no executor exists and no writes are performed.

## 6. Known limitations

- Duplicate detection is per-batch; a cross-check against production external keys must be supplied
  by the operator (`existingNames` only covers name warnings).
- No unique index exists yet on `(source_system, external_client_id)`; concurrent imports could still
  race. Recommended as a future review-only migration.
- The Watsons fixture (`src/lib/import/__tests__/watsons.fixture.ts`) is a frozen snapshot used for
  regression only; it performs no runtime query and must never be used as an import source.
