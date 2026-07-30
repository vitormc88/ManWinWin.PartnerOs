# Phase 2 — review-only migrations

Nothing in this folder is executed by the platform. Files here are drafts for
human review; move them into `supabase/migrations/` with a fresh timestamp only
after review.

## Files

1. `phase2_01_get_client_commercial_intelligence_v2.sql`
   Deterministic redefinition of `public.get_client_commercial_intelligence`:
   canonical contract-line vocabulary, conservative legacy classification,
   contract-relationship-safe line association, explicit annualization,
   structured-lines-over-header precedence, renewal precedence
   (renewal row → contract end → license end) and deterministic action ids.
   Return shape unchanged — estimation metadata rides on `confidence` +
   `risk_signals` (`value_is_estimate`, `unclassified_lines`).

2. `phase2_02_watsons_line_type_normalization.sql.template`
   **Non-executable template.** Exact contract/contract-line UUIDs for Watsons
   are not available from repository fixtures (only the client id is known), so
   no executable data migration is provided. The template documents the intended
   guarded, idempotent updates; the reviewer must paste the real line ids
   discovered by the verification SELECT before it can be run.

## Staged rollout for the `line_type` CHECK constraint

No constraint is added yet — legacy rows still hold `line_type = 'recurring'`.

1. Apply `phase2_01` (read-side canonicalisation only; nothing breaks).
2. Review + apply the Watsons (and any other) data normalization, verifying with
   the SELECTs included as comments.
3. Only when no non-canonical values remain:

```sql
ALTER TABLE public.contract_lines
  ADD CONSTRAINT contract_lines_line_type_canonical
  CHECK (line_type IN ('license','mww_web','hosting','sat','module','plugin',
                       'implementation','training','discount','other'))
  NOT VALID;
-- later, after confirming the backfill:
ALTER TABLE public.contract_lines VALIDATE CONSTRAINT contract_lines_line_type_canonical;
```

`NOT VALID` keeps existing rows readable/updatable while enforcing the rule on
new writes; `VALIDATE` is a separate, revertible step.
