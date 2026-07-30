# Phase 2B — Manual validation checklist (SQL, review only)

Scope: `supabase/migrations_review/phase2_01_get_client_commercial_intelligence_v2.sql`.

**Nothing in `migrations_review/` has been executed, applied or deployed.** These
files are static artefacts for human review. Applying them requires a deliberate
decision outside this phase.

## 1. Static review performed in the repository

Repository-only review. There was **no connection to any Postgres database**, so
nothing here was compared against a deployed/production function definition.
Checked against `supabase/migrations/` and `src/integrations/supabase/types.ts`:

- [x] Table names exist: `clients`, `contracts`, `contract_lines`, `licenses`, `renewals`.
- [x] Column names used by the function exist in the generated TypeScript types
      (`contract_lines.contract_id`, `contract_lines.client_id`, `contract_lines.line_type`,
      `contract_lines.amount`, `contract_lines.billing_frequency`, `contracts.contract_end_date`,
      `licenses.license_end_date`, `renewals.renewal_date`, `renewals.status`).
- [x] Function signature preserved: `get_client_commercial_intelligence(client_uuid uuid)`.
- [x] Return shape (column names, order and declared types) matches the definition
      committed in this repository and the expectations of its consumers
      (`useClientCommercialIntelligence` and its callers), so no typed application
      change is required. Not compared against any deployed database object.
- [x] Lines are joined through `contract_id` and are **not** dropped when
      `contract_lines.client_id IS NULL`.
- [x] No broad dynamic string-replacement `DO` block; the function is defined in full.
- [x] No `CHECK` constraint that would reject existing legacy rows.
- [x] No `UPDATE` / `INSERT` / `DELETE` against customer data.
- [x] Deterministic keys/codes for signals and actions (no `gen_random_uuid()` inside).

## 2. Cannot be validated without a real Postgres connection

These require running the SQL against the actual database and are explicitly **not**
verified here:

- [ ] The function compiles (`plpgsql` / SQL parse errors, ambiguous column refs).
- [ ] Runtime types match the declared `RETURNS TABLE` exactly (Postgres is strict:
      `numeric` vs `integer` vs `text` mismatches only surface at execution).
- [ ] Actual owner/`search_path`/permissions/grants after `CREATE OR REPLACE`.
- [ ] Query plan and performance on the real data volume.
- [ ] Real Watsons output equals EUR 4,221.60 ARR and renewal 2027-07-19.
- [ ] That the object currently living in staging/production matches the definition
      in this repository at all.

## 3. Suggested manual validation sequence (for whoever applies it)

0. This SQL has never been executed. Everything below must be run by a human,
   starting on a staging/branch database.
1. Snapshot the current definition:
   `SELECT pg_get_functiondef('public.get_client_commercial_intelligence(uuid)'::regprocedure);`
   Store it — this is the rollback artefact.
2. Apply the migration in a staging/branch database first.
3. Run the reference fixture:
   `SELECT recurring_arr, year1_value, next_renewal_date, confidence
      FROM public.get_client_commercial_intelligence('01fbe90e-d3ea-4635-96aa-8e04060b8182');`
   Expected: `recurring_arr = 4221.60`, `year1_value = 4221.60`,
   `next_renewal_date = 2027-07-19`, `confidence = 'high'`.
4. Spot-check a client with no contract lines: confidence must be `low`/`estimated`,
   never an exact ARR presented as fact.
5. Spot-check a client whose lines have `client_id IS NULL` but a valid `contract_id`:
   the lines must still be counted.
6. Compare a sample of 5–10 clients against the UI (`CommercialContractView`) —
   the two must agree, since both now use contract lines as the structured source.
7. Rollback = re-apply the definition captured in step 1.

## 4. Watsons data-normalization migration

`phase2_02_watsons_line_type_normalization.sql.template` is a **template, not a
migration**. Exact `contract_lines.id` values are not available from the repository,
so no executable matching SQL was generated. It must be completed by hand, with the
IDs read from production, before any review.

## Concurrency limitation (Phase 2D note)

The renewal duplicate guard (`renewal-identity.ts` / `renewal-workflow.ts`) is an
**application-level** protection: it reads existing renewals and only inserts when no
equivalent open row is found. It does **not** fully eliminate a race condition between
two simultaneous writes — two concurrent requests can both read "no duplicate" before
either insert lands.

An absolute guarantee would require a proper uniqueness constraint/partial unique index
in Postgres, designed only after validating the real renewal states and identity columns
(client_id + renewal_date + contract_id/license_id/target, restricted to open statuses).

This is documentation only — no constraint, index, or SQL has been created or applied.
