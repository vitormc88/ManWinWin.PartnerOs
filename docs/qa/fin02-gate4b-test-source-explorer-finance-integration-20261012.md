# FIN02 Gate 4B — TEST-source Customer Explorer concurrency & finance E2E
**12 Oct 2026 · Read-only source TEST; all SQL on DISPOSABLE synthetic PostgreSQL 17; no live deployment**

## Context and honest scope
The user made available an actual Lovable Cloud TEST PostgreSQL 17.6 custom backup. Its archive metadata and compressed TABLE DATA were privately verified (see `fin02-gate4b-actual-test-archive-offline-inspection-20261012.md`), but the **complete archive was NOT uploaded to GitHub or Actions** due to auth/customer rows and sensitive metadata. We selected and reviewed only the small, credential-free definition of `private.sync_customer_explorer_directory()` and its `customer_explorer_clients_sync` trigger.

**Do not claim this was a full TEST clone:** The CI environment has intentionally synthetic financial records/roles; the `private.refresh_customer_explorer()` body is a synthetic audit/failure double. The original TEST function/trigger **wrapper** is source-backed, but the full Customer Explorer directory internals, real data, Supabase managed schemas, signed Auth sessions, cron, storage and external integrations were not restored.

## Finding — 2 concurrent client writes can silently disable Explorer
Real TEST original implementation:
- Statement-level AFTER INSERT/UPDATE/DELETE trigger on `public.clients`, calling `private.sync_customer_explorer_directory()`.
- For `clients`/`partners`, wrapper requests `pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))`.
- Failure to acquire lock (ordinary contention) raises SQLSTATE **55P03**, which the broad exception handler catches. It sets `private.customer_explorer_rollout.mode='off'`, `sync_failed_at` and `sync_error_code` without failing the client INSERT.
- A successful financial award therefore **may** commit new Client and switch off directory synchronization in another overlapping award/partner update. **This is confirmed as a source-function behavior**, NOT an observed current incident in Lovable TEST.

### Reproduction proof (no live changes)
[GitHub Actions #38235425691](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38235425691): PostgreSQL 17, only fictional clients; wrapper+trigger from actual TEST backup, stubbed refresh. **PASS**:
1. Ordinary INSERT: refresh audit advances, mode stays `hq`.
2. Idempotent `INSERT ... ON CONFLICT DO NOTHING`: statement-level trigger still refreshes, but creates no duplicate client (possible performance amplification).
3. Session A holds transaction advisory lock; independent session B INSERT **succeeds** but rollout mode becomes `off` with `sync_error_code=55P03`; refresh does not occur.
4. Simulated real refresh exception: mode becomes `off`, SQLSTATE `P0001` (existing semantic).
5. Transaction rollback reverts Client, audit and rollout mutations made inside the transaction.

## LAB-ONLY mitigation candidate — serialization instead of opportunistic lock
[Candidate SQL](../../tests/sql/fin02/gate4b_customer_explorer_serialized_candidate.sql) retains the original `SECURITY DEFINER` and external refresh-error handler but changes lock acquisition from `pg_try_advisory_xact_lock` to **blocking** `pg_advisory_xact_lock`.
- Same [CI #38235733482](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38235733482) passed: contender waited until first transaction committed, then inserted and refreshed, with rollout staying `hq`.
- Deliberately failing synthetic `refresh_customer_explorer` still moved mode to `off` (real errors remain signaled).
- Not enough for production: lock contention must be evaluated with **full original refresh SQL** for deadlocks, transaction latency, lock ordering, timeouts, repeated statements and HQ operational alerts. Alternative queued/coalesced refresh with retry is separate potential design.

## Integrated FIN02 original financial E2E plus Explorer wrapper
A new independent [financial+Explorer CI workflow](../../.github/workflows/fin02-gate4b-financial-explorer-bridge.yml) replays the original source-backed FIN02 award/renewal and 4 independent security/ledger migrations in PostgreSQL 17, installs the **original TEST Explorer trigger wrapper**, then installs the **isolated serialized candidate** with a synthetic directory refresh. It executes:
- Fictional €1,608 first award, €570 contracted renewal base, first and second annual €570 renewals (2027 and 2028).
- Missing/changed source-line rejection, canonical partner visibility, source policies and role isolation.
- Idempotent simultaneous award of same Deal, initial_sale exactly once, forced late-transaction rollback and retained history.
- Validates that Explorer's synthetic refresh runs and rollout stays `hq`, then executes PostgreSQL backup/fresh restore and four individually guarded rollbacks and negative drift tests.
- [Integrated CI #38236286656](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38236286656) **SUCCESS** at tested code SHA `339f27ec95483a629ce247e064a7904a7d753e13` following correction of a test-only SQL quoting mistake in the initial run. This **does NOT test full original Explorer refresh**; the actual original wrapper alone with unmodified `pg_try` was tested separately (the negative reproduction above).

## Security and provenance boundaries
- No raw TEST backup, auth users, clients, ZIP, data, secret, signed URL, SQL dump or private `refresh_customer_explorer` body was committed to repo, Actions or Lovable.
- Source of the <1 KB sync wrapper is a manually reviewed, credential-free TEST function/trigger definition. Other scoped original financial SQL had already been verified against read-only TEST and is checked in.
- TEST/PROD remained read-only and untouched; only DRAFT PR #34 branch was updated; no merge, deployment, Lovable AI prompts or Work credits used.
- This is **an enhanced synthetic domain-integration E2E**, not a faithful replica of the 2,446-object actual TEST DB and not complete signed Auth/user workflows.

## Exit gates / decision
**PASS:** TEST-source wrapper behavior reproduced and diagnosed; mitigation candidate isolated concurrency passed; original FIN02 financial RPC and ledger/renewal E2E with simulated Explorer refresh passed; recovery/rollback tests remained synthetic.

**OPEN (NO-GO for live TEST):** actual complete TEST restore, source-perfect original private refresh and background jobs, real signed Auth, lock-order/deadlock/timeout/alert analysis, Finance/Security signoff, compare mode and historic ledger decision, FIN03 documents and UX/Commercial Memory. Issue [#40](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/40) remains open; [#39](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/39) still tracks inability to privately restore the whole actual TEST archive without unsafe distribution of live TEST rows.

**Do not install the candidate directly in TEST.** Agree a standalone SEC40 migration, compatibility gate and forward-repair strategy only after testing the full original private refresh and user approval.
