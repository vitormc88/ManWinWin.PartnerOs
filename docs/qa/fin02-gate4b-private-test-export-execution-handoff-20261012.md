# PartnerOS R1 FIN-02 — Gate 4B private TEST export and restore handoff
**12 Oct 2026 | PREPARED, script static guard PASS, actual TEST export / recovery NOT EXECUTED**
**Do not merge, deploy, publish or change TEST/PROD.**

## Why this is still a gate
A query into the Lovable-managed TEST database successfully verified 38/38 read-only catalog invariants and the exact source-financial baseline. But the linked Supabase admin connector explicitly refuses TEST project access: only PROD is listed under that connection. Lovable's TEST database SQL connector exposes SELECT reads, **not a pg_dump file/role export or restored private snapshot**. We must not substitute the PROD archive or a stitched synthetic financial catalog for a faithful TEST recovery.

## What is implemented
- [Private Windows TEST-only export script](../../tools/fin02/Gate4B-Export-TEST-Schema.ps1)
- [Source TEST 38-check catalog preflight](../../tests/sql/fin02/gate4_live_test_catalog_preflight.sql)
- [GitHub Windows AST and fail-closed identity check](../../.github/workflows/fin02-gate4b-private-export-lint.yml): [run #38224082518](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38224082518) **PASS**, code `60900ef441d4`. Other five FIN-02 SQL/RLS/financial workflows on that SHA also passed.

The private script:
- Rejects wrong TEST username/project ID and **explicitly rejects PROD** before reading an archive or opening a database connection.
- Requires PostgreSQL **17** local client tools and certificate-verifying TLS (`verify-full`), no stored DB password or command-line password.
- Runs the already-tested 38 TEST catalog SELECT checks before attempting archive export; aborts on any drift.
- Runs a **schema-only** `pg_dump` to a PostgreSQL custom archive: functions, policies, triggers, tables, indexes, permissions, managed schemas. No customer/business/Auth data rows.
- Captures cluster roles using `pg_dumpall --globals-only --no-role-passwords` and *only version/name* values from the 176-entry technical migration ledger. Do not confuse this with a full dump of migration SQL bodies or Academy contents.
- Produces an archive index, hashes, local receipt with `restore_tested=false`, protected Windows ACLs.
- Writes **only locally under user profile** by default. Nothing is pushed to GitHub, Lovable or Supabase. The export command is read-only on TEST; the live database is never restored over.

**Limitation:** No actual TEST archive, certificate, DB password, host or output file is accessible in this chat. The script was AST linted and source identity-negative-tested on Windows CI; the real TEST connection/dump was **not** run or confirmed. If any step fails, STOP and record only a sanitized error code.

## Operator action on already prepared Windows/Docker machine
1. Open the **TEST** database's authorized Connect/Database settings (not the PROD project). Obtain the official **TEST** Session Pooler host (or TEST direct DB host), username `postgres.avxxzmoayxzrykwqzoqn` for pooler, and connection credentials **privately**. If the TEST dashboard/DB password is not accessible, ask its administrator for permission/read-only connection or have that administrator execute the script locally. NEVER paste password or connection URI into chat, screenshots, GitHub issues, Actions logs or Lovable AI.
2. In the existing checkout of `fix/fin02-server-renewal-contract-policy-20261011`, prepare PostgreSQL 17 binaries and trusted Supabase TLS CA certificate already used in the earlier Customer Explorer backup procedure. Confirm both sources independently. The repo script will not disable TLS verification.
3. From **Windows PowerShell/Command Prompt** with the actual approved TEST host and local paths, run a command equivalent to:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\fin02\Gate4B-Export-TEST-Schema.ps1" -PgBin "C:\Path\To\PostgreSQL17\bin" -DbHost "TEST_SESSION_POOLER_HOST" -TestUser "postgres.avxxzmoayxzrykwqzoqn" -CaCert "C:\Path\To\TrustedSupabaseCA.crt"
   ```
   Password prompts are raised by PostgreSQL client tools and handled only on the operator's computer. A connection to the direct DB uses `postgres` and host `db.avxxzmoayxzrykwqzoqn.supabase.co` instead.
4. The procedure must report **38/38** live TEST checks and **176** migration metadata entries before claiming the export complete. A new local `receipt.json` explicitly states `restore_tested=false`.
5. Report **only** the non-sensitive status (e.g., '38/38, 176, archive created successfully') here. Do not upload `.pgcustom`, `roles-no-passwords.sql`, the archive TOC or the receipt, since SQL function definitions and role configuration can themselves embed secrets.

### Special release safety
A schema-only export represents the **TEST structure**, NOT a full working copy of its actual application data or signed Auth users; we explicitly want to use **synthetic commercial identities and reference fixtures** after private restore. No claim of production-like authentication or Academy data completeness is possible until tested and signed off.
Follow the private schema restore with the prior verified Supabase PostgreSQL 17 compatible Docker procedure, `--network none`, no published ports, disabled pg_cron/pg_net/mail/integration egress, and a fresh disposable database. Inspect the archive TOC and roles first; restore may require changes because managed Supabase roles/extensions can conflict with an empty cluster. Every compatibility exception must be written to a private receipt, not silently skipped. Do not run a generic restore into live TEST or PROD.

## After local export — Gate 4B offline runbook
- Verify archive SHA256/TOC, role export without secrets and TEST project identification.
- Restore source schema, roles and technical migration ledger to a compatible, network-isolated **private** PostgreSQL/Supabase 17 target; no real customers or Auth identities.
- Run the 38-check contract on the *unmodified* recovered baseline plus expanded fingerprints of 107 public tables, 175 functions, 344 policies, 94 triggers, 294 indexes, 420 constraints, private and storage schemas/grants.
- If no exact structural parity, STOP and determine whether managed built-in schemas/roles, extensions or restore order are to blame; do not forge a green check.
- Run actual PR #28→#31→#34 migrations in order **only in disposable recovery**, including four SEC35/36/37/38 migrations and their guarded rollbacks.
- Test real financial functions, signed-equivalent scoped role privileges, two accepted renewals, concurrency and forced rollback; include the uncovered real TEST Customer Explorer client-sync integration (#40) and external side-effect suppression.
- Re-run export/backup/restore drill against the **private recovered copy** and verify ledger/event preservation.
- Preserve master #29, blockers #35–#40 and FIN03/Commercial Memory/UX/QA. Release remains **NO-GO** for live TEST until an explicit separate approval.

## Public/vendor reference
Supabase current manual backups: https://supabase.com/docs/guides/platform/backups
Supabase backup/restore guidance: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
Supabase migration notes: https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres

**Current decision: Gate 4B private full TEST restore pending authorized client-side export.** Laboratory restore and GitHub safety checks must never be mistaken for restored TEST.
