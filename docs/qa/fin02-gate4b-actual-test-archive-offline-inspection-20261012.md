# PartnerOS FIN-02 — Gate 4B: real TEST archive, private offline inspection
**12 October 2026 | SOURCE ARCHIVE RECEIVED & OFFLINE READ VALIDATED | ISOLATED POSTGRESQL RESTORE NOT YET RUN | NO-GO**

## Provenance and scope
- User supplied a PostgreSQL custom-format **TEST Lovable Cloud database export** to this private conversation. The raw backup, token/URL, customer/Auth records, and extracted DDL/data MUST NOT be committed to GitHub, copied to public CI, Lovable prompts, or emailed.
- Exact byte length: **24,688,476** — equal to the size previously verified read-only against the TEST Storage object metadata. Object provenance remains a source-identification assumption until restored and compared against the 38 source fingerprints. The previously published signed URL is not reproduced here.
- Raw archival magic `PGDMP`, archive format **1.16.0**, custom archive, **Zstandard** compression; original database `postgres`, source PostgreSQL server **17.6**, exporter `pg_dump 18.6 (Debian 18.6-3)`. Archive header timestamp: **2026-10-12 09:27:15**, interpreted in the exporter local clock; timezone not asserted.
- Local file SHA-256 for forensic verification (hash only): `354dc82cf7063d23a043cabff1cef08aec5ee45e6e8f7f533786b62b5e93da17`.
- The trusted source format was independently parsed according to the PostgreSQL 17 custom archive header/TOC specification; zstd data frames were checked using locally installed `libzstd`. No SQL was executed; no network egress attempted; no original content was printed.

## Exact archive metadata (not a database restoration)
| TOC description | Total | In `public` |
|---|---:|---:|
| All TOC entries | **2,446** | — |
| TABLE | 158 | **107** |
| VIEW | 17 | **17** |
| FUNCTION | 235 | **175** |
| POLICY | 364 | **344** |
| TRIGGER | 105 | **94** |
| ROW SECURITY entries | 133 | **107** |
| TABLE DATA entries | **160** | 107 |
| INDEX entries | 243 | 153 |
| CONSTRAINT entries | 206 | 141 |
| FK CONSTRAINT entries | 187 | 158 |

These four public TOC counts — 107 tables, 175 functions, 344 policies and 94 triggers — match independent **live TEST read-only** inspection on 12 Oct and the [versioned 38/38 source checks](../../tests/sql/fin02/gate4_live_test_catalog_preflight.sql). The archive includes `auth`, `storage`, `private`, `cron`, `net` dependencies and other managed schemas, rather than only the financial subsystem.

## Data-block decompression integrity — actual local result
- All **160/160 TABLE DATA** blocks found at the TOC offsets were traversed, each ZSTD stream decompressed in memory with no decoder errors. Total decompressed COPY data stream length: **793,005,547 bytes**. This is a **block decompression integrity check only**, not `pg_restore --exit-on-error` nor a query against the restored database.
- The archive contains actual rows and must be treated as **potentially sensitive** notwithstanding its TEST designation. Specifically, without displaying any values, `auth.users` has **15** COPY rows, and `public.clients` has **57** COPY rows. `storage.objects` includes 85 metadata rows; Storage **binary assets** and external configuration are NOT restored by a PostgreSQL database archive alone.
- Do not infer that passwords/API tokens or personally identifiable data are absent. For full cloning, preserve sensitive data **only within an authorized private isolated host**; use separate synthetic identities/fixtures for destructive E2E.
- The archive contains 176 rows in `supabase_migrations.schema_migrations`, consistent with the earlier TEST metadata ledger count; this does not imply all historic migrations can be replayed cleanly on a blank schema.

## Core FIN02 footprint present before patch
Archive includes original public functions `award_deal_proposal`, `close_renewal`, `close_renewal_core`, `renewal_close_readiness`, and `proposal_contract_recurring`, plus the TEST client-sync and renewal revenue triggers. No initial-sale FIN02 patch trigger or previously PROD-only `zz_deal_award_record_revenue` was found in the relevant archive TOC.
This is evidence of **pre-patch object presence** only; executing against full original role/trigger stack remains outstanding.

## Execution environment limitation
The current ChatGPT sandbox has the uploaded bytes and can inspect the archive and decode Zstd streams **but has no PostgreSQL `pg_restore`, `psql` or server, no Docker engine, and no DNS access for package installation**. A private PostgreSQL server cannot be made available by this sandbox from the tools used. The handoff to a separate execution environment was not accepted. Accordingly:
- **NO database restore was performed here**.
- **NO FIN02 SQL migrations were applied to any instance**.
- **NO full original PostgreSQL transactional/roles/Customer Explorer E2E was executed**.
- Claims of FIN02 Gate 4B PASS would be false.

## Required next step: private full isolated restore
Use the already established **user-managed Windows Docker/Supabase PostgreSQL** local environment (see `docs/customer-explorer-prod-backup-preflight.md` for the prior tested method), but point the input strictly to this **TEST** archive rather than an old PROD backup. Isolate the restore target using no network egress, no ports, protected host directory, dummy/rescinded service secrets and disabled cron/job dispatch. Verify Docker image/Postgres extension and client version compatibility: the archive was exported with pg_dump **18.6** against PostgreSQL **17.6**, with format 1.16 and zstd compression.
1. Prepare isolated roles and Supabase extensions; the database dump **does not include cluster-global roles**. Review archive TOC for compatibility and schema-specific managed DB objects. No raw files in GitHub.
2. Restore into disposable DB using `pg_restore --exit-on-error`; separately verify extension prerequisites, role ownership/grants, `auth` / `private` / `storage` tables and functions, customer client-sync trigger, cron network isolation, 176 migration ledger rows, and source schema fingerprints **before any patch**.
3. On distinct isolated clone/snapshots ONLY, apply original stacked PR #28→#31→#34 SQL and independent FIN02 patches SEC35→SEC36→SEC37→SEC38. Validate original E2E financial award (€1,608), two €570 renewals, RLS tenant/role matrix, concurrency, forced failure rollback, Customer Explorer sync health and finance history. Conduct backup-and-fresh-restore and reverse rollback separately.
4. Report precise restore errors and deviations; no silent RLS grant/owner substitutions. Only after evidence and commercial/security decisions can a separate explicit TEST installation approval be requested.

## Release verdict
**Gate4B-1 archive acquisition and offline inspection: PASS.**
**Gate4B-2 faithful private TEST PostgreSQL restore: NOT EXECUTED.**
**Gate4B-3 actual FIN02/E2E after restore: NOT EXECUTED.**
**Production/TEST writes, Github merge, Lovable deployment: NONE.**
Track [#39](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/39) (private restore), [#40](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/40) (Explorer integration), and master [#29](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/29). Preserve FIN03, Commercial Memory and R1 UX backlog.
