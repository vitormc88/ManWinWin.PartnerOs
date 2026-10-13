> **STATUS UPDATE — 13 October 2026: TEST LEDGER RECONCILIATION COMPLETED.** This document records both the original diagnostic and the now-completed authorized metadata-only repair. The original numbered instructions below are retained as historical release planning, **not** as pending work. Do not rerun the reconciliation installer: all five FIN02-related versions are now stamped in TEST.
>
> Executed only through Lovable-linked TEST database project `09e44188-ec64-4ec3-8add-b3b54882408c` after verifying original GitHub blob SHA for SEC35/36/38 and all 11 live policy fingerprints. The transaction-guarded source is `tests/sql/fin02/ops/sec35_sec36_sec38_test_ledger_reconcile_DO_NOT_AUTODEPLOY.sql` on [Draft PR #50](https://github.com/vitormc88/ManWinWin.PartnerOs/pull/50); first executed identically with `ROLLBACK` and independently proved no target-version rows persisted; only then committed `INSERT` of three `supabase_migrations.schema_migrations` metadata rows. No `ALTER POLICY`, no business data writes, no extra migrations or Lovable agent credits.
>
> **Independent postflight:** `tests/sql/fin02/fin02_test_dual_journal_postflight.sql` reported all TRUE: 11/11 installed policy fingerprints, three exact original SQL archive MD5 values, 3/3 native Drizzle rows, 5/5 financial source versions in Supabase (FIN02, SEC35, SEC36, SEC37, SEC38), 4/4 protected tables RLS, both expected financial triggers enabled, 130 existing contract lines and 5 revenue history rows unchanged. Original GitHub source full-byte equality independently validated after commit (SEC35 2956 bytes, SEC36 3004, SEC38 3692).
>
> **Remaining migration governance:** choose ONE owner for future schema rollouts and preserve a searchable mapping between Supabase canonical source and Lovable Drizzle journal. Never replay SEC35/36/38 (or SEC37). A future Lovable migration must retain existing Drizzle journal and its original version chain, even after PR #50 reverts unrequested generated application scaffolding from main.
>
> **Concurrent change observation:** during this follow-up, PR #49 ("Animate PartnerOS mark during app and sign-in loading") merged into main as `87a0cbca1a99bbe0cdb3dfd16c94a7ffe79e6fed`, leading to a new READY production Vercel deployment. This is an external code change, not part of the ledger reconciliation; do not overwrite or rollback PR #49 without separate authorization. PR #50 must preserve its content when eventually merged and only reverse the unrequested Lovable Drizzle application-scaffold changes.
>
---

# FIN02 R1 — TEST dual migration journal reconciliation (13 Oct 2026)

## Scope and confirmed evidence

The user authorized SEC35 → SEC36 → SEC38 to **Supabase TEST**, ref `avxxzmoayxzrykwqzoqn`, via Lovable native migrations on 2026-10-13. All eleven `pg_policies` signatures match the pre-reviewed forward candidates; transactions with existing TEST accounts (Postgres `ROLE authenticated` plus local `request.jwt.claim.sub`) passed Partner Sales deny, Partner Admin allowed operations, canonical-only reads, and cross-partner denial. The row counts directly after the tests were 130 `contract_lines` and 5 `client_revenue_history`. SQL write probes rolled back; signed-JWT/browser acceptance is still outstanding.

The native Lovable migration mechanism generated a **Drizzle journal**, alongside legacy `supabase_migrations.schema_migrations`:

| Applied policy set | Native Drizzle name | Drizzle row id, SHA256 hash | Supabase source version |
| --- | --- | --- | --- |
| SEC35 | `0000_fin02_sec35_clients_write_policy` | 1, `2762f2ef87e9950572b03db74aa4c7bb0ca38d1564d70fe15050ec38c5a16d54` | `20261012000100` |
| SEC36 | `0001_fin02_sec36_canonical_partner_reads` | 2, `6b87663e20a60ea93bbdcc6b43f822657075c612140c07de0be3b76c4d968121` | `20261012000200` |
| SEC38 | `0002_fin02_sec38_financial_write_policy` | 3, `998e8958341e73e41f0a95cc24aab37909503d9ee18fa97233ab8727c5536742` | `20261012000400` |

- `supabase_migrations.schema_migrations` **already includes** FIN02 `20261011213000` and SEC37 `20261012000300` with the original SQL source in `statements[1]`.
- The three SEC35/36/38 original Supabase source versions are **absent** from that ledger, even though their deployed policy hashes match exactly.
- Reproducible source and fingerprint-guarded reversals are in [Draft PR #47](https://github.com/vitormc88/ManWinWin.PartnerOs/pull/47): `supabase/migrations/20261012000100...`, `20261012000200...`, `20261012000400...`. **SEC37 is already installed and must not be replayed.**

## Repair decision: preserve TEST state and stage ledger only

**Nothing in this document is permission to write to a live database.** The checked-in `tests/sql/fin02/fin02_test_dual_journal_preflight.sql` is strictly READ ONLY and should be run before and after a separately approved reconciliation.

A future safe reconciliation should:

1. Verify exact connected project ref by independently trusted TEST-only environment metadata, do not infer TEST merely from `current_database() = 'postgres'`. Fail closed unless it is `avxxzmoayxzrykwqzoqn`; PROD is `qownzparzsaeoyccgwuj`.
2. Check that exactly the three expected Drizzle journal hashes are present, the exact eleven deployed `pg_policies` hashes match, both existing FIN02+SEC37 Supabase history versions exist, and three target Supabase versions are absent. Abort on any drift or conflicting history.
3. In a single controlled TEST-only transaction, **stamp only migration-history metadata** in `supabase_migrations.schema_migrations` for versions `20261012000100`, `20261012000200`, `20261012000400`, with the exact original GitHub migration source in each `statements[1]`, canonical names, and an auditable reconciliation receipt. **Do not execute that SQL source again**, `ALTER POLICY` again, delete Drizzle journal entries, overwrite business data, or rewrite historical finance.
4. Verify the resulting five Supabase financial versions, three Drizzle rows, eleven current policy hashes, and unaffected financial rows. Repeat negative/positive SQL role regression only inside `BEGIN ... ROLLBACK`, followed by separate actual signed-JWT/browser acceptance.
5. Explicitly declare which migration mechanism owns future TEST changes before another Lovable-native migration. The Drizzle journal persists in the database even if the unsolicited Lovable scaffolding is reverted from GitHub. Reverting the GitHub files **must not be mistaken for undoing a database migration**. A future Drizzle migration should not start from a blank `0000` journal or silently replay 0000/0001/0002.

Never use the GitHub Actions disposable Postgres gate as evidence of a live Supabase TEST deployment.

## GitHub and PROD frontend containment

Lovable's application-side edit unexpectedly merged into `main` as `cd84cd518fd26dd53d1bd22f9337770b036c1d8e`. It introduced Drizzle configuration/migrations, dev dependencies, lockfile and regenerated types. The Vercel-connected `main` auto-deployed to production, although database SQL was TEST-only. The user then explicitly authorized Vercel rollback, which was **confirmed** by the production alias `partneros.manwinwin.com` pointing to READY deployment `dpl_7dvL1KQMX5hdqVAKGTKnx3MjcGdN`, source `b1a8998b518d4a8d67ed6f7afac9c791146cafb3`.

This corrective PR restores exactly the **pre-unexpected-commit application tree** from `b1a8998b518d4a8d67ed6f7afac9c791146cafb3`. Do not merge it without separately approving a controlled PROD-code deployment, as `main` merges can auto-publish. All Lovable Drizzle DB history and all TEST RLS policies remain deployed regardless of Git revert. After merging, avoid a Lovable-native next migration until its journal/source retention strategy is agreed; the Drizzle SQL source remains available in Git commit `cd84cd5...`, and canonical guarded source remains in Draft PR #47.

### Release conditions still OPEN

- Signed JWT/browser role regression: Partner Sales direct-write denial, Partner Admin canonical-only reads, cross-partner denial, admin official renewal-close RPC.
- Supabase ledger metadata reconciliation as above.
- Verify/approve subsequent CI and Vercel release gates before publishing any GitHub `main` change.
- E2E full R1 journey Target→Lead→Deal→Proposal→Client→License→Renewal, FIN03 immutable documents, MEM01 memory, OPS01 routing/autosave/timezone/stage history, UX01.
- PROD financial/schema changes **not authorized**. SQL and live financial changes must remain in TEST until release signoff.

Evidence: [PR #47 security gate](https://github.com/vitormc88/ManWinWin.PartnerOs/pull/47), [master action register #29](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/29).
