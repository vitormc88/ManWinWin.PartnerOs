# PartnerOS R1 / FIN-02 — Gate 4 TEST inspection, restore drill, private clone hold
**12 Oct 2026 | Gate 4A COMPLETE; Gate 4B BLOCKED pending source-faithful private TEST schema recovery; live TEST/PROD UNCHANGED**

## Safety and evidence boundaries
- This report separates (A) direct **read-only inspection of the actual Lovable-managed TEST** database, (B) **synthetic** PostgreSQL 17 financial tests and archive restoration on GitHub Actions, and (C) the **not-yet-obtained private full TEST recovery**.
- Do not read this document as authorization for live TEST writes, Lovable sync, PR merge, Vercel release or PROD changes.
- Source TEST: Lovable project `09e44188-ec64-4ec3-8add-b3b54882408c`, Supabase ref recorded in prior read-only handoff `avxxzmoayxzrykwqzoqn`. **Not** PROD `qownzparzsaeoyccgwuj`.
- All database queries in this investigation were **SELECT-only** catalog/migration metadata, never business/PII data, auth credentials or secret values.
- The linked Supabase account currently lists only PROD; a direct TEST Supabase project/branches lookup was explicitly denied by the connected account permissions. The TEST database remains accessible for safe catalog SELECT through the Lovable database query connector. This interface has **no verified pg_dump/export or restorable snapshot endpoint**. An SQL metadata query is NOT a database archive.
- Previous complete repository migration replay stopped at real historical Academy module data prerequisites; **do not** bypass data invariants and claim an authentic TEST clone.

## Gate 4A — validated against live TEST
### Structural inventory
| Current live TEST area | Quantity |
|---|---:|
| public tables | 107 |
| public data columns across base tables | 1,587 |
| public columns including views (information_schema) | 1,773 |
| public RLS policies | 344 |
| public non-internal triggers | 94 |
| public functions | 175 |
| public views/materialized views | 17 |
| public foreign/primary/unique/check constraints | 420 |
| public indexes | 294 |
| recorded Supabase schema migrations | 176 |

Other actual schema dependencies (separate from public): `private` four tables and 17 functions; `auth` 27 tables; `storage` eight tables, 20 policies and seven triggers; `cron` two tables and two policies; `net` two tables and 12 functions. Count of only public objects cannot constitute full TEST parity.

### Live catalog fingerprint manifest — metadata only
| Inventory scope | Count | MD5 signature |
|---|---:|---|
| public base-table columns | 1587 | `a8072a2559ee45c7abfb829ba085a1c6` |
| constraints | 420 | `2032ab705e62fd630be5fd1001730bd4` |
| indexes | 294 | `7434775e1c2a76756de9a436171189ad` |
| 344 public RLS policies | 344 | `0cf19164e54bfbb7a9e53e57bfca256a` |
| 94 public triggers | 94 | `bc7aededc8374838e2f067aeeef3fffd` |
| 175 public function definitions | 175 | `623b7fd9ac0e25e8f4ed9ca7b7aea0ad` |
| 107 public table ACLs | 107 | `eba01b8a412e1e721b7489501a858575` |
| 175 public function ACLs | 175 | `1659b39c3a93ce6c743569a61385825f` |

**Note:** signatures above are descriptive drift baselines, not cryptographic authentication of database origin, secrets or complete SQL export. Function hashes depend on `pg_get_functiondef` rendering/version. Global role membership, private/auth/storage schemas, extension state, cron config and operational integrations need separate checks.

### Executed live read-only acceptance SQL
[Versioned 38-check SQL baseline](../../tests/sql/fin02/gate4_live_test_catalog_preflight.sql) executed directly against live Lovable TEST with **38 PASS, 0 DRIFT**:
- Eight canonical financial tables: 327 columns and exact type/default/nullability MD5 profiles match the Gate 2A TEST catalog.
- Eleven target `clients`/`licenses`/`contracts`/`renewals` policy hashes and `PERMISSIVE`/`authenticated`/command definitions match the independent R1 baseline.
- Eight core financial function source hashes match the earlier source snapshot `tests/sql/fin02/test_schema_fingerprint_20261011.json`.
- Public object counts are unchanged; Supabase migration ledger contains 176 entries and no FIN-02 patch migrations; PROD-only initial-sale mechanism/source_deal_id column absent; TEST unique source reference constraint present.
- Existing Customer Explorer client-sync trigger function signature matches inspected live TEST and is a NEW integration boundary for the next gate.

### Live TEST trigger graph gap
The actual TEST clients table has a **statement-level AFTER INSERT/DELETE/UPDATE** `customer_explorer_clients_sync` trigger to `private.sync_customer_explorer_directory()`. This privileged function attempts an advisory lock and `private.refresh_customer_explorer()`, catches errors and can switch the rollout mode to `off`; this means a financially successful award *could* leave Explorer synchronization disabled under untested conditions. Current read-only TEST rollout status was `mode='hq'`, `sync_failed_at IS NULL`, `sync_error_code IS NULL`. This is a **testable risk, NOT a demonstrated failure**. Other live triggers include revenue total synchronization, partner active-client counts and renewal assignment/closure guards. Their complete original interaction is not yet reproduced by the synthetic financial lab.
- Full private-TEST clone must assert successful Explorer refresh and no undesired `mode='off'` transition after award, retry, forced rollback and concurrent award.
- Review transactional rollback semantics, side effects, `cron`/`pg_net`, protected `private` functions, Storage/notifications and authenticated API sessions. Do not invoke these on live TEST merely to test.

## Gate 4A synthetic backup recovery — PASS, NOT a TEST recovery
[Run #38220869551](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38220869551) at code SHA `f597aa43182d` completed **success** with [script](../../tests/sql/fin02/gate4_synthetic_backup_restore_drill.sh) running `postgres:17` `pg_dump` and `pg_restore`, checksum verification, new disposable database, parity for 11 policy predicates and financial writer/trigger and restored €1,608 initial sale + two renewals €570 each. Archives were removed after the job and never uploaded. All other four SQL/RLS/pricing workflows at the same SHA also passed.
The exercise restores the **synthetic financial test database only**; it does not certify a backup of TEST, Auth sessions, private Customer Explorer, Storage objects, email, cron, third-party API configuration, or actual SQL migration history.

## Gate 4B BLOCKED — full TEST structural private recovery prerequisite
There is no confirmed mechanism in our current accessible connectors to produce a **source-faithful TEST export** with extension/role/ACL/schema/functions/triggers/RLS and migration-history baseline, or to restore it into a compatible private isolated host.
1. **Obtain authorized read-only schema-only TEST archive** through its actual TEST database dashboard/session-pooler or IT handoff. Do not use PROD export and do not transmit the DB password in chat. Client-side `pg_dump --schema-only` reads source without changing it; verify connection TLS/certificate as done in the pre-existing isolated PROD procedure.
2. Export *technical only* migration-ledger baseline and role/ACL metadata if allowed; preserve original signed session/privileged function assumptions. A schema-only dump by itself does not contain the 176 migration-ledger rows or Academy/reference data, so it cannot be called an integral **runtime** replica.
3. Restore to an isolated PostgreSQL 17-compatible Supabase runtime with extensions, managed schemas/roles, no Internet egress, no live SMTP/Webhooks/Resend/Storage tokens, no active cron jobs or outbound `pg_net` effects. Keep archives, logs and checksum receipts private and encrypted/restricted; **never commit raw database dumps to GitHub or attach them to cloud Actions**.
4. On unmodified restored schema run the versioned [38-check catalog baseline](../../tests/sql/fin02/gate4_live_test_catalog_preflight.sql) and the full eight-category manifest fingerprint; **all expected and observed metadata must match before any FIN02 migration is tried**. Investigate any differences, including missing migration-ledger metadata; do not waive drift to force green.
5. On the disposable clone only, apply PR #34 financial source migration then separate #35→#36→#37→#38 migrations (PR #34 stacked above #31 and #28). Use actual original full triggers/functions, Auth/API role boundaries and **synthetic** commercial entities, including Customer Explorer state.
6. Exercise accepted renewal twice, pricing tamper, RLS downgrades, revoked users, cross-tenant claims, concurrent awards, historical-row integrity, forced rollback, and post-rollback client sync; verify no external side effects.
7. Run four independent rollback scripts, preserve ledger/history, reject drift and measure backup restore to a *fresh* isolated database. Document the difference between technical RLS rollback and safe live operational response.
8. Only after full-copy evidence and Finance/Security signoff present a **new explicit approval request for TEST deployment**. PROD remains separately unauthorized.

## Release verdict
- **Gate 4A actual TEST metadata checks: PASS (38/38); synthetic archive restore: PASS; CI 5/5 GREEN.**
- **Gate 4B private source-faithful TEST restoration: BLOCKED / NOT EXECUTED.**
- **Finance/security release: NO-GO FOR REAL TEST** until full private-copy integration, signed role/API and backup/restore evidence.
- Keep #35/#36/#37/#38 open until real deployment validation; no automatic historical Thai Union initial-sale backfill. Track FIN03 archived documents, Commercial Memory, UX/continuity, differing PROD/TEST permissions and overall R1 QA separately.

## Required next access step
Ask the PartnerOS TEST database administrator/owner to provide a **private schema-only export and migration-ledger technical manifest**, or to run the reviewed local backup procedure on the already established personal Docker environment. Do not request credentials or raw dumps through chat. The archive must be kept solely in a user-authorized isolated machine. Without this input, stop at Gate 4A rather than substitute a stitched synthetic schema for a genuine TEST clone.


## Gate 4B continuation — private archive execution kit prepared (12 Oct 2026)
- [Source-locked Windows client-side export script](../../tools/fin02/Gate4B-Export-TEST-Schema.ps1) committed to DRAFT PR #34. It demands known TEST connection identity, rejects PROD, validates TLS `verify-full`, checks original live 38/38 fingerprints, then exports schema-only `pg_dump`, role metadata without password hashes and version/name migration ledger to restricted LOCAL Windows folder.
- [Windows AST/negative target gate](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38224082518) **SUCCESS** at code SHA `60900ef441d4`; five other FIN02 Actions at same SHA SUCCESS. These checks did NOT connect to any DB.
- [Operator private extraction and restore runbook](fin02-gate4b-private-test-export-execution-handoff-20261012.md) documents the locally retained archive, explicit environment/secret controls, source-first parity, private Docker recovery and roles/trigger integration acceptance conditions.
- Access restriction remains: connected Supabase does not authorize TEST project; Lovable SQL SELECT access is not a backup API. **No TEST archive was generated, no full private TEST schema restored, and no actual TEST FIN02 SQL executed.**
- Gate 4B retains **NO-GO** until a credentialed TEST administrator performs the script privately and then the source-faithful isolated recovery and E2E. No branch merge, deploy, PROD or TEST writes authorized.
