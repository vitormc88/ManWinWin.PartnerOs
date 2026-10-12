# FIN-02 — GitHub-hosted Gate-2 schema reconstruction: investigation receipt
**11 October 2026 · read-only TEST, disposable cloud CI only · not certified · no deploy**

## Objective
Rebuild all PartnerOS TEST schema/function/RLS dependencies on a hosted Supabase local stack from the Git repository; apply PR #34 and test actual `award_deal_proposal`, `close_renewal_core`, triggers, roles and policies without Docker Desktop or Lovable credits.

## What was confirmed in actual TEST (Lovable read-only)
- 107 public tables; 175 public functions; 344 public RLS policies; 94 public non-system triggers; 176 migration history entries.
- Git `main` includes **194 migration SQL files**. 174 DB history entries have a Git file with a matching/nearby (≤15 s) timestamp, **76 shifted** by seconds. Two DB entries have no close filename; several newer files have no exact history entry. Differences in ledger names/timestamps **do not** prove missing DDL; multiple changes were installed directly through SQL editor. Never batch apply guessed "missing migrations" to TEST.
- Core financial table columns and MD5 of key procedures / RLS policy definitions were captured in `tests/sql/fin02/test_schema_fingerprint_20261011.json`. It includes **no customer data, personal identifiers or credentials**.
- Award and renewal core definitions on TEST are the actual PRE-FIN02 versions. The comparison scripts exclude those two from unchanged-code equality because PR #34 deliberately patches them.

## GitHub Actions artifacts
- `fin02-disposable-postgres.yml`: PostgreSQL 17 synthetic financial subsystem, exact migration + repeat, SQL invariants; **PASS**: https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38172153027
- `fin02-full-migration-replay.yml`: Supabase CLI, `supabase start` + `supabase db reset --local` on runner (NO linked project, cloud access token or seed), with `full_schema_probe.sql` and structural fingerprint comparison prepared.
- Full replay **failed** before reaching PR #34 because historic schema files contain QA fixture operations and application-data prerequisites, as described below.

## Failures discovered, in order (not hidden)
1. Run #38174660353: `20260811135135_abf9a6fc-...sql` combines a legitimate revised `renewal_automation_run` with a `ZZV811` test harness that inserts synthetic clients with nonexistent partner references in a clean database. Foreign key `clients_partner_uuid_fkey` blocked. We excluded **only the QA fixture block in the temporary runner copy**, retaining its function DDL; original Git history unchanged.
2. Run #38174893931: `20260813233336_378ea80a-...sql` consists of synthetic P0 user/partner cleanup. Deleting synthetic roles on a clean DB triggers the **correct** "Cannot remove the last active HQ Admin" guard. We excluded **only its seven fixture DELETE statements in the temporary runner copy**, retaining the temp-table DROP; original Git history unchanged.
3. Run #38175060376: `20260820180353_3aa9cbfe-...sql` is a data-dependent Academy remediation. It requires existing `academy_modules.slug='module-5-qualification'`, mission rows, resource and eight question codes, and explicitly raises if absent. A clean schema replay does not contain those application records. **Stopped here rather than strip additional application semantics**.

## Further bounded attempt — synthetic Academy preconditions
- Live TEST (read-only) confirms Qualification Module 5 exists, with its two relevant missions and eight target questions; the earlier failure was **missing reference data in a fresh local replay**, not evidence of broken Academy in TEST.
- Added a **test-only synthetic Academy fixture** at `tests/sql/fin02/academy_precondition_fixture.sql`, injected as a local-only temporary migration into GitHub runner workspace before the historic Aug 20 data remediation. It was not copied to TEST, main or the deployed migration tree.
- First fixture-backed run #38175601745 progressed beyond the original Module-5 gate but stopped at another August migration requiring four more Module-5 missions.
- After extending that synthetic fixture, run #38175754060 progressed further and stopped at `20260821104157_58542100-...sql`, which requires a **Module 1 Welcome to ManWinWin** Academy record that was never seeded by the Git migration chain.
- **Stop criterion reached:** adding synthetic course modules sequentially would produce an increasingly artificial Academy, not a faithful representation of TEST. No further replay bypasses should be added merely to obtain a green check.
- Replay remains manual. Any green SQL-Gate-1 result is distinct from the blocked schema Gate-2 result.

## Additional SQL integrity hardening
- New policy trigger tracks UPDATE of `contract_lines.renewal_amount` and `pricing_snapshot`, recomputing financial terms from the linked Business `proposal_item` rather than accepting direct alterations.
- Existing sourced Business lines can no longer be unlinked by changing `source` to manual/legacy or clearing `source_item_id`. A future approved contract-amendment procedure remains a separate workstream.
- SQL negative tests exercise attempted price/policy tampering and attempted removal of lineage.
- Disposable PostgreSQL 17 SQL Gate-1 **run #38175998624 passed**, including re-running the migration and all new negative tests. This is not a claim that TEST schema/RLS Gate-2 has passed.

## Decision on CI automation
Full historical replay workflow is **manual (`workflow_dispatch`) pending migration/data-baseline repair**, to avoid repetitive red status checks / wasted CI minutes. The targeted financial CI and disposable PostgreSQL SQL gate remain automated and green. No historical migration has been edited or rebased.

## What these tests prove
- FIN-02 isolated SQL financial gate has real PostgreSQL execution, not just TypeScript assertions.
- A fresh replay of *all existing* Git migrations is **not currently a valid representation of the deployed Lovable TEST system**, because the migrations alone omit required Academy/application seed baseline and include one-off verification operations.
- No evidence that this issue is a current runtime defect in the Academy. It is a reproducibility/deployment-hygiene problem.
- The current branch contains a future schema-parity probe, but it **has not yet run through the completed full migration set**, so it cannot be marked passed.
- PROD and Lovable TEST were NOT changed by this investigation.

## Gate 2 next acceptance path
**Preferred:** an authorized, read-only, structure-preserving TEST export (schema, functions, roles/grants, triggers and RLS; anonymized/synthetic business data) restored into a disposable Supabase PostgreSQL 17 environment, preferably using the already-tested Docker procedure from Customer Explorer. Reproduce TEST, not a stale PROD backup. Use network isolation and disable cron/notifications, with a local restore audit receipt.

**If TEST export is unavailable:** scope a versioned, sanitized *financial-domain baseline* assembled from TEST's actual catalog, not from the 194 files alone. Its assumptions and omissions must be explicit. Match table/policy/routine hashes; run original RPCs under representative role and concurrent sessions before claiming Gate 2. This is more engineering work than a proper export.

Avoid:
- creating a Supabase branch of PROD and calling it TEST;
- applying untracked migration files to TEST to "fix" its ledger;
- weakening last-HQ-admin protection or inserting fictitious training data into the real TEST;
- uploading TEST exports, auth contents, secrets, or client data to GitHub Actions artifacts;
- granting direct access to GitHub CI runners to TEST/PROD databases.

## Release state
FIN-02 status: **SQL Gate 1 passed, full schema Gate 2 blocked by historical replay/data-baseline drift, TEST E2E not executed**. PRs #28, #31 and #34 remain Draft, no merge/deploy. FIN-03, Commercial Memory and OPS/UX backlog unchanged.
