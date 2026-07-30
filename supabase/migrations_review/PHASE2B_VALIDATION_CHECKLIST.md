# Phase 2B — Manual validation checklist (SQL, review only)

Scope: `supabase/migrations_review/phase2_01_get_client_commercial_intelligence_v2.sql`.

**Nothing in `migrations_review/` has been executed, applied or deployed.** These
files are static artefacts for human review. Applying them requires a deliberate
decision outside this phase.

## 1. Static review performed in the repository

Checked against `supabase/migrations/` and `src/integrations/supabase/types.ts`:

- [x] Table names exist: `clients`, `contracts`, `contract_lines`, `licenses`, `renewals`.
- [x] Column names used by the function exist in the generated TypeScript types
      (`contract_lines.contract_id`, `contract_lines.client_id`, `contract_lines.line_type`,
      `contract_lines.amount`, `contract_lines.billing_frequency`, `contracts.contract_end_date`,
      `licenses.license_end_date`, `renewals.renewal_date`, `renewals.status`).
- [x] Function signature preserved: `get_client_commercial_intelligence(client_uuid uuid)`.
- [x] Return shape (column names, order and types) unchanged versus the currently
      deployed definition, so `useClientCommercialIntelligence` needs no typed change.
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
- [ ] Actual owner/`search_path`/permissions after `CREATE OR REPLACE`.
- [ ] Query plan and performance on the real data volume.
- [ ] Real Watsons output equals EUR 4,221.60 ARR and renewal 2027-07-19.

## 3. Suggested manual validation sequence (for whoever applies it)

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
