# Customer Explorer cutover — 9 October 2026

This receipt supersedes older rollout status sections, which remain historical.

## Completed preparation

- Release branch integrated origin/main through 809743b, preserving current task and renewal fixes.
- Normal production Vite/SWC build passed in an official isolated Node 22 Linux container after that integration. No environment files, private client JSON, backup files or credentials were copied. Diagnostics: ignored `production-build-908760fc3f4944e18099c646027a014d`.
- Full private master reconciles to 435 unique numeric identities: 125 existing PROD source customers, 310 new HQ customers. No archived/reserved or duplicate identities were introduced. Current PROD source names, lifecycle and ownership remain authoritative; only reviewed Explorer sector overlays are seeded.
- New HQ lifecycle remains unknown. Supplied suggestions stay suggested; no imported record is marked HQ-validated without review.
- TEST contains 309 imported HQ customers, six existing source customers and two hidden fictitious QA records. One PROD HQ ID (0763, OCM) is deliberately omitted in TEST because TEST reuses it for the unrelated fictitious Lovable source record. No source name/ownership was replaced. TEST is now HQ-only for the real master-list rehearsal.
- Seven original CLI-generated migration versions were recorded in TEST's migration history with their source statements after verifying the installed final batch function. They were not rerun against populated TEST.
- Partner browser pilot passed before import: Francisco read/filter/ranking, no management, direct Settings/Users routes redirected; kill switch revoked DB reads and the open browser, then recovered the original access.
- Recovered raw PROD archive and role memberships were validated on matching Supabase PostgreSQL. Exact cutover install and private seed files then passed in a network-none recovery container: 310 HQ + 125 source records, 125 overlays, five case studies, seven history rows, all new public tables RLS-enabled, HQ-only rollout. Existing core fingerprints unchanged after excluding only the intentionally added customer_explorer role-template rows. Diagnostics: ignored `supabase-recovery-bda7d2243b2a4fc8b47d821635ae7bd2`.

## PROD identity and safety

PROD notifications functions_base_url is NULL (sending remains disabled), so it is not a valid project identity marker. Installation/seed instead require the independently verified current source counts (129 clients / 19 partners), exact UTC fingerprints, NULL notification URL and an absent Explorer for fresh installation. No notification setting is changed.

Final installer SHA256: `b9eb25ea4bf29d300311a59463ab20caa5fef489403fe0012c2b73e243045d05`.
Final seed SHA256: `6957c4ac6cc09e94eefb26845c234bb4ae63b2fba1eb59d5e11da5b3a9a4e3b3`.

Original backup is retained under restricted local ACL and is not an off-device backup. Its client/partner fingerprints match current PROD. Schema-only task changes since that archive remain protected by Git migrations and the Explorer rollback does not restore the entire old archive.

User explicitly deferred rotation of the credential previously disclosed in chat. Do not repeat, save, or commit it; this deferral does not make disclosure risk disappear.

## Installation status

PROD database installation and private seed COMPLETED. User confirmed the production editor warning and later renewed approval after automatic review blocked the malformed editor copy. Full-editor select/copy comparison proved the normalized editor text matched the tested file; a read-only BEGIN/SET LOCAL TIME ZONE/ROLLBACK query also confirmed valid syntax. No safety rejection was bypassed.

The full partner-row fingerprint then changed during release preparation (a legitimate live table update occurred). Final guard uses the exact unchanged 129-client fingerprint and the verified stable set of 19 partner IDs (`c2af46300cf43107b785ca642bbbaa2e`), not volatile partner metadata. It still requires NULL notifications_url and the fresh-install absence check. The exact revised installer and seed passed another isolated recovery rehearsal: ignored `supabase-recovery-6748aedc43624cb4a3cb4d8b7d420303`.

The official PROD editor installed all seven migrations and their matching CLI-generated history versions atomically, reporting mode `hq`. Imported the reviewed seed in a separate transaction. Independent connector query confirmed 435 unique customers, 310 HQ, 125 source records, 125 classification overlays, five curated case studies, 129 unchanged core-client count and NULL notifications URL. All five new public tables have RLS. A BEGIN/ROLLBACK role-level query verified active HQ read/manage and all 435 rows, and partner read/write denial during HQ rollout. No fictitious verification row persisted.

Generated Supabase types from the actual PROD schema and refreshed the generated local type file. Typecheck passed. These SQL role checks do not replace the final authenticated production-browser verification.

Frontend publication COMPLETED: release commit `957ad915e19188cf7722c1b62529722e2981faff`, PR11 https://github.com/vitormc88/ManWinWin.PartnerOs/pull/11 (attached), merged as `ffce1c31e89f91245f162ac75d00035f041e7816`. Vercel reported success for both preview and the production merge commit. Production URL https://partneros.manwinwin.com/customer-explorer changed from the old 404 to the new protected login flow after publication; it redirects to /auth without a session. Awaiting the user's authenticated HQ PROD login for final map/administration verification and initial logo transfers. Do not claim authenticated page verification or logo migration complete yet. Old draft PR10 remains unmerged and is not the release artifact.

Final frontend gate: 50 tests in nine canonical source suites passed, with TypeScript check passed. An earlier local run also picked up 27 duplicate suites copied into ignored build contexts; Vite denied those private paths, so that run failed despite all 50 genuine tests passing. Restricted the ignored fallback test config's include to canonical src tests (matching the tracked production Vitest config), then reran successfully. No production code workaround.

Security advisors returned one Explorer-specific informational notice: private.customer_explorer_rollout has RLS but no policies. This is intentional default denial; authenticated/anonymous grants are revoked and only guarded HQ functions manage it. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy. Other existing application notices were not changed by this release.

The obsolete generated binary bun.lockb was removed in favour of the validated modern bun.lock; it remains recoverable through Git. Private seed, backup and credential were excluded from the 119-file release commit. Screenshot of final PROD database reconciliation: ignored `.customer-explorer-preview/prod-database-installed.png`.

## Authenticated PROD verification and media transfer

The user signed in as the existing active HQ Admin. The production browser verified all 435 customers in the management directory and map with historical customers included; the default map shows 406, excluding 29 historical records. The live map reports 53 represented countries. Country/sector rankings and the five curated case-study cards work. All five case-study logos loaded successfully from private Storage.

Settings displays HQ only. User Management exposes Customer Explorer with inherited Admin access for the HQ Admin and explicitly states that availability follows Explorer Settings and editing is restricted to HQ Admin. Neither settings nor user permissions were changed during this check.

Transferred the prototype's 50 raster logos via the authenticated HQ media editor, with canonical numeric IDs and fresh row checks. Most upstream files named .png are actually WebP: copied their unchanged bytes into ignored upload-ready files with the correct extension; did not weaken MIME/signature validation. Aveleda's SVG remains pending a supported raster asset; SVG was not enabled in private Storage.

Detected one pre-existing prototype mapping defect during transfer: CARMONTI's logo was mapped to 0662 (JDEUS) instead of 0661 (CARMONTI). The correct 0661 logo is now saved. Automatic browser review blocked unlinking the newly created incorrect 0662 association, and explicit user approval was requested. Until approved and verified, there are 51 linked logos (50 correct plus this one incorrect association); no customer or underlying file has been deleted. Do not declare this correction complete or open partner access while it remains pending.

Screenshots retained privately: `.customer-explorer-preview/prod-case-studies-verified.png` and `.customer-explorer-preview/prod-explorer-live.png`. Frontend and database deployment are complete; only the specifically requested incorrect-logo unlink and optional unsupported SVG asset remain pending.

## Partner release and correction completed

The user explicitly confirmed at action time both opening read access to all eligible PROD partners and unlinking the incorrect CARMONTI logo from 0662 (JDEUS). Both changes were made through the authenticated HQ production interface. JDEUS now displays the no-logo fallback; CARMONTI 0661 keeps its correct logo. No client or stored file was deleted.

Independent database verification: rollout `all`, 435 customers, 50 linked logos, five case studies, 51 retained private logo files. A BEGIN/ROLLBACK verification of all active partner profile identities confirmed 14 accounts with read access, zero unexpectedly restricted accounts and zero partner accounts with management access. Existing per-user permission, active-partner and account-status gates remain in force. No role or individual permission was overridden.

Production Settings visibly reports All eligible partners and the successful saved-state message. Screenshot: `.customer-explorer-preview/prod-partners-enabled.png`. This section supersedes the earlier pending-logo and HQ-only rollout statements. Aveleda's optional SVG-to-supported-raster asset remains pending. Mixed raw country labels in the HQ manager were diagnosed (legacy partner sources); no source-country records or presentation code were changed as part of this activation.
