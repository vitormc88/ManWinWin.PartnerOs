# FIN-02 — TEST migration and E2E acceptance gates
**Status: pre-deploy review, 11 Oct 2026. DO NOT APPLY TO PROD.**
Work from PR #28 (pricing serialization) → PR #31 (award wizard and preflight) → PR #34 (server/renewal policy). PR #32 (documents) is independent/stacked on #28.

## Preflight — no writes
1. Confirm the connected Supabase project is **TEST**, and compare project ref with Lovable environments; never infer TEST from UI alone.
2. Freeze source SHA, list effective SQL definitions/checksums of award_deal_proposal and close_renewal_core, compare the migration hooks. Test the one-time clause is unchanged.
3. Inspect already-existing columns/triggers/policies and prior migrations to avoid repeated or incompatible patches.
4. Export anonymized counts and financial reconciliation for all Business draft/Ready/Won proposals. Do not edit historical Thai Union.
5. Ensure DB restoration point / rollback procedure and authorized QA account prepared.

## Disposable sandbox migration test (REQUIRED before TEST)
Run exact migration `supabase/migrations/20261011213000_fin02_award_source_line_renewal_policy.sql` in a disposable database cloned from TEST.
- Verify 2 nullable contract columns and source snapshot trigger only for new/renewed Business lines.
- Verify prior award function authorization, idempotent return, row locks and operational outputs remain unchanged.
- Verify a direct authenticated RPC call with swapped +100/-100 on two sourced lines fails and leaves **zero** new client/license/contract/renewal rows.
- Verify anonymous, HQ Standard without permission, partner user outside scope and revoked roles all fail.
- Verify original historic records/values exactly unchanged.
- Verify 0%, 8% SW, 3% Web (renewing and nonrenewing), 17% gross KeepIT S&TA and UseIT.
- Verify original first-year discount is not silently applied/removed at next renewal.
- Verify close_renewal on a legacy contract without renewal_amount preserves previous behavior, including one-time billing.
- Verify closure with temp recurring discount and separate one-time implementation: Year1 billed net, next-cycle gross, one-time correct. Verify subsequent renewal cycle (third year) and idempotent retries.
- Verify no orphan rows or non-deterministic duplicate renewal creation under two concurrent sessions.
- Verify renewal baseline/readiness documents show the real next-cycle amount.
- Verify `close_renewal_core` update of earlier contract lines preserves previous closure_snapshot and updates current price snapshot, using the same inherited partner/RLS semantics.

## Post-migration read-only proof (TEST)
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='contract_lines'
  AND column_name IN ('renewal_amount','pricing_snapshot');

SELECT p.proname,
  position('fin02_assert_business_award' IN pg_get_functiondef(p.oid)) > 0 AS award_line_guard,
  position('FIN02_RENEWAL_POLICY_V1' IN pg_get_functiondef(p.oid)) > 0 AS renewal_core_policy
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('award_deal_proposal','close_renewal_core');

SELECT source, count(*) AS lines,
  count(*) FILTER (WHERE renewal_amount IS NOT NULL) AS with_next_cycle_price,
  count(*) FILTER (WHERE pricing_snapshot IS NOT NULL) AS with_policy_snapshot
FROM public.contract_lines
GROUP BY source;
```

## Explicit non-goals (still open)
- Original Thai Union Won v2 original proposal-items discrepancy is preserved as historical exception; no unreviewed backfill.
- FIN-03 immutable signed commercial documents/fingerprints not solved here.
- Compare KeepIT vs UseIT frozen alternative pricing *not* yet implemented; deliberately blocked for future awards. Product decision required.
- New contract-line fields do not themselves prevent all future manual contract amendments from every other UI path; audit/change authorization of post-award amendments remains under separate OPS/finance governance.
- Prospect→Lead→Deal Commercial Memory, autosave/timezone/permissions and notifications remain open in master R1 #29.

## Version-dependent rollback
This migration modifies existing RPC function definitions. A rollback is NOT just dropping columns. Before deployment, preserve the complete prior definitions and grants and test restoring them in a clone. Never drop new columns until all dependent code/references are reverted; do not run a rollback that deletes financial snapshots already created in TEST.

**Release rule:** CI Green is necessary but not sufficient. Mark FIN-02 complete only after executable SQL tests and clean TEST UI+DB E2E are evidenced.
