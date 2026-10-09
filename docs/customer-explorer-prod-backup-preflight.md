# PROD backup preflight — 2026-10-08

Status: **manual database backup verified; complete database archive recovery and Explorer rollback tests passed in isolated Supabase PostgreSQL; not deployed**. This validates database recovery, not Storage files, external project configuration or browser application recovery. No PROD schema writes, merge or publication performed.

- Project `qownzparzsaeoyccgwuj`, PartnerOS - PROD, PostgreSQL 17.
- Authenticated dashboard confirms Free plan has no scheduled backups.
- User chose a manual backup with no plan change.
- Read-only preflight counted 129 clients, 19 partners and 125 eligible numeric client IDs with no canonical duplicates; Explorer tables absent.
- Official EDB PostgreSQL 17.11 Windows native archive downloaded from the link on the official binaries page. Local archive SHA256: `80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`. This is a local integrity record, not an independently verified vendor checksum. No Windows service installed.
- Dashboard Connect / Session pooler identified `aws-1-eu-central-1.pooler.supabase.com:5432`, database `postgres`, username `postgres.qownzparzsaeoyccgwuj`.
- Native dump / restore help and pg_dump version checked. Prepared ignored local `Backup-PROD.ps1` and native `Backup-PROD.cmd`; user must enter existing DB password in native prompts, never in chat. No password is saved by either procedure. TLS verifies certificate and hostname using the official Supabase project CA; no insecure fallback.

## Windows launch and TLS correction

User screenshot showed PowerShell execution-policy rejection before script execution. The CMD alternative calls native PostgreSQL tools without changing PowerShell policy. User then reached the pooler but certificate verification with `sslrootcert=system` failed before authentication. No usable backup was produced.

The authenticated PROD Database Settings page exposes the official Download certificate link: `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. Downloaded over verified HTTPS into the ignored tools folder. Local SHA256 `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`; subject Supabase Root 2021 CA, expiry 2031-04-26. Both procedures now explicitly use this CA with `verify-full`. The certificate was not installed in Windows trust, and SSL enforcement/project settings were not changed.

A credential-free native psql probe against the exact session pooler, using `-w`, an absent password file and cleared PGPASSWORD, reached `fe_sendauth: no password supplied` instead of an SSL error. This verifies TLS/certificate/hostname negotiation on that connection, not authentication, dump success, or recovery. User must rerun the CMD procedure with their existing DB password.

## Export scope and verification

The script restricts the output folder to the current Windows user and SYSTEM, creates a PostgreSQL custom archive and role definitions without role passwords, validates the archive index and full decompression to NUL, and records hashes. It never connects pg_restore to a database. The resulting receipt explicitly marks `restore_tested=false` and `storage_files_included=false`.

This is not a full Supabase project backup: Storage file contents, Edge Function code and external project/Auth configuration are not included. Archive verification is not proof of successful restoration. Supabase extensions and managed roles require a compatible isolated recovery target and reviewed restore procedure. Do not restore into live PROD or overwrite TEST to validate the export. Sensitive exports remain in the git-ignored local preview directory; do not commit, upload or paste their contents.

## Remaining release gates

1. Manual export, core recovery and complete database archive recovery are complete. Separate Storage asset protection, external configuration protection and off-site backup protection remain pending.
2. Complete authorized partner browser read/no-write/revocation checks. TEST rollout was observed as `all` after a user change; this is not itself proof of those checks.
3. Reconcile current release changes with latest main; old draft PR10 is not release-ready.
4. Resolve import dependency/concurrency review and TEST migration history before deployment.
5. Install in PROD initially HQ-only, reconcile imported directory and then stage partner activation with DB-enforced Settings/User Management rules.

References: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Verified manual export and isolated core recovery

User completed the native CMD export. Backup folder `prod-15616-25688` contains the custom archive (3,587,010 bytes), role definitions without passwords, index, SHA256 files and receipt. Independently verified complete index (2,244 lines), complete archive decompression to NUL with exit code 0, hashes matching the export, and an ACL limited to current Windows user and SYSTEM. No restore was run against PROD or TEST.

Core recovery used native PostgreSQL 17.11 in a fresh ignored directory, SCRAM authentication with a random local password, loopback-only listener and no Windows service. Restored seven tables in one transaction with primary/unique constraints and applicable internal foreign keys. Excluded foreign key `clients_source_proposal_id_fkey` because proposals were outside this core-only test. Did not replay extensions, application functions, event triggers, RLS policies, ACLs, notifications or scheduled jobs. This is data recovery verification, not production permissions or application recovery certification.

After normalization to UTC, all six application-table fingerprints and counts matched a read-only PROD comparison:

| Table | Rows |
| --- | ---: |
| public.clients | 129 |
| public.partners | 19 |
| public.profiles | 20 |
| public.user_roles | 20 |
| public.user_module_permissions | 4 |
| public.role_permission_templates | 126 |
| auth.users | 21 |

Auth users were count-checked only; no account credential contents were printed. Final isolated recovery directory `recovery-78f765a608df4afcaf2b3a6d4ed32811` contains the private restore list, logs, fingerprints and recovery receipt. Graceful server shutdown confirmed, no PostgreSQL processes remained, temporary plaintext local password file removed. Private recovery data retained under restricted ACL for audit, not committed or exposed through the local app.

An earlier sandboxed run blocked while waiting for the server process tree; stopped only the verified temporary processes. The runner now starts pg_ctl hidden and waits for pg_ctl alone. No production process was stopped.

No Docker/Podman command is installed on this host. The archive references Supabase extensions absent from the native distribution (pg_net, pg_cron, pgmq, supabase_vault); the seven-table result must not be labeled a full recovery. Current official Supabase guidance requires a compatible Supabase environment with matching extensions, and warns that raw pg_dump includes managed internals requiring a reviewed restore procedure.

The password disclosed by the user in chat must be treated as exposed. Do not repeat or persist it. Credential rotation requires a dependency inventory, coordinated user handoff and verification, not an unattended reset.

## Complete database archive recovery and Explorer rehearsal

After the user's Windows restart and personal acceptance of Docker terms, verified Docker Engine 29.8.2 on Linux/WSL2. Official `supabase/postgres:17.11.0.004` image digest: `sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`. Created a fresh PostgreSQL cluster inside a named local container with `--network none`, no host mounts or published ports, and `cron.launch_active_jobs=off`. No production credentials were used. Private diagnostics have Windows ACL restricted to the user and SYSTEM. Test containers were stopped and retained for audit.

Restored the original complete custom archive with `--exit-on-error --single-transaction`, including owners and ACLs, after restoring roles without passwords. One platform-specific adjustment was necessary in a separate generated copy of roles.sql: remove `GRANTED BY supabase_admin` from membership grants because the managed platform grantor's implicit privileges do not exist in a fresh local cluster. Memberships/options are preserved; the local grantor attribution differs. Original backup files remain unchanged.

Verified 97 public tables, all 97 with RLS enabled, 308 policies, 150 public functions and nine extensions including pg_cron, pg_net, pgmq and supabase_vault. All six core application table counts/fingerprints exactly matched the previously verified backup baseline; auth.users count was 21. Complete archive restoration passed without SQL errors. This is not proof of decrypting all Vault secrets, equivalent external Auth/Edge configuration, restoring Storage file contents or complete browser operation.

Against a fresh recovered copy, rehearsed all five current Explorer migrations and the management, isolation and media assertion suites. Each suite ran inside BEGIN/ROLLBACK and confirmed the Explorer table was absent afterwards. All passed. Media tests received a fictitious HQ fixture inside the local transaction because the original TEST fixture is absent from PROD data. Tests include HQ writes/audit, validation stamps, partner read/no-write and revocation, explicit User Management denial, fail-closed synchronization, emergency Settings recovery, private logo bucket and case-study URL/schema restrictions.

Final successful diagnostics: `.customer-explorer-preview/supabase-recovery-c0b2e1ce9ece4494850fc32b09e3ae25`. The ignored runner is `Test-Supabase-Recovery.ps1`. Separate earlier attempts are retained with failure receipts; the first role grantor mismatch and missing local media fixture were corrected only in the isolated test procedure. Browser pilot, import concurrency/security, current-main integration, types/migration-history reconciliation and coordinated credential rotation remain release gates.
