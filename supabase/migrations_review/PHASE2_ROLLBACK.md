# Rollback — Phase 2 commercial intelligence v2

Migration: `supabase/migrations/20260730150504_phase2_commercial_intelligence_v2.sql`

## Target object (verified identifiers)

- function: `public.get_client_commercial_intelligence(uuid)`
- owner: `postgres`
- security_definer: `false`
- pre-change definition hash: `35177b11c554457ed9016fc43d2cf2e9`

## Rollback procedure

Rollback consists of re-applying the **pre-change production definition captured
immediately before deployment**. That captured definition is the authoritative
source.

Do **not** reconstruct the rollback body from an older repository migration file:
repository history is not guaranteed to match the live production definition.

Steps:

1. Retrieve the pre-deployment capture of the function definition and confirm its
   MD5 hash equals `35177b11c554457ed9016fc43d2cf2e9`.
2. Re-apply that exact definition with `CREATE OR REPLACE FUNCTION`.
3. Confirm owner remains `postgres` and `security_definer` remains `false`.
4. Re-verify the hash of the restored definition.

If the captured definition is unavailable or its hash does not match, stop and
escalate — do not improvise a replacement body.
