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

No frontend commit/push/merge/publication has occurred yet. Initial logo transfers and authenticated PROD HQ browser verification remain. Do not merge old draft PR10 as the release artifact. The obsolete generated binary bun.lockb was removed locally in favour of the validated modern bun.lock; it remains recoverable through Git.
