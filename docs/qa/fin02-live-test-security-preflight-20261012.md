# PartnerOS R1 FIN-02 — live TEST security preflight (12 Oct 2026)

## Scope, permission and actual database status
- This report covers **real live Supabase TEST** through the existing Lovable-linked SQL interface, not a GitHub disposable schema, while explicitly distinguishing real RLS database sessions from a signed-JWT/browser login.
- **No SEC35, SEC36, SEC38 migration was installed** and no business data from the test was committed. All policy alterations/role probes were enclosed in `BEGIN ... ROLLBACK`.
- Already installed in TEST before this report: FIN02 source-item award/next renewal policy (`20261011213000`) and SEC37 initial-sale ledger (`20261012000300`). TEST's prior 130 contract lines and 5 revenue ledger rows were preserved. No historic backfill.
- No PROD changes, no GitHub merge, no application/frontend deploy. Authenticated tests use `SET LOCAL ROLE authenticated` and transaction-local `request.jwt.claim.sub` referencing existing TEST role accounts; **not** genuine signed JWT session, invitation, real partner browser or API test.

## Exact baselines — RLS policies
- Compared **all 11** existing TEST policy hashes against exact forward migration source guards. All match unchanged TEST.
- SEC35 `clients_insert/update`: expected predicates identical.
- SEC36 `licenses_select/contracts_select/renewals_select`: expected predicates identical.
- SEC38 six `licenses/contracts/renewals INSERT/UPDATE`: expected predicates identical.
- No target SEC35/36/38 version present in `supabase_migrations.schema_migrations`.

## Full forward/reverse drill
- Ran exact source files SEC35, SEC36, SEC38, followed by all three **fingerprint-guarded rollback files** (reverse order) in one transaction. **3/3 forward, 3/3 rollback PASS**. Five representative baseline policy hashes restored within transaction. Outer ROLLBACK performed; deployment remains absent.
- SEC37 had independently passed full guarded rollback rehearsal *before* its separately authorized TEST installation. This security preflight did not roll back installed SEC37.

## Source-backed live TEST role checks
### SEC36 — Partner Admin, canonical-only client
- Actual TEST Partner Admin had one owned Client with `partner_uuid` but NULL legacy `partner_id`, plus one License, Contract and Renewal.
- Before changes, with `ROLE authenticated`, owner could see the client but License/Contract/Renewal queries each returned **0**.
- With temporary SEC35+SEC36+SEC38 policies, the same queries each returned **1**.
- Root cause / remedy for #36 therefore directly reproduced in real TEST. Other partner/cross-tenant, malformed legacy IDs and probationary behavior remain covered in existing isolated CI but not freshly signed-JWT tested in this live session.

### SEC35 + SEC38 — Partner Sales with effective view-only permission
- Actual TEST Partner Sales account: effective `clients:view=true`, `clients:edit=false`, `renewals:view=false`, `renewals:edit=false`.
- As `ROLE authenticated` with transaction-local claimed account, ran **single-row no-op UPDATE** on one existing, same-partner, legacy-linked Client, License, Contract and Upcoming Renewal. All SQL effects reversed by outer ROLLBACK.
- Baseline: each no-op UPDATE affected **1** row — unauthorized edit path under original policies.
- Temporary three-policy-candidate pack: each identical UPDATE affected **0** rows. **4/4 authorization deny regression PASS**.
- Cross-tenant, negative grants, role revocation, insert, and genuine token-backed paths remain release acceptance tests. No claim of complete security certification.

## Prior financial E2E evidence retained
- Installed SEC37 trigger/function TEST hash `a8bd1059505b4458bf3a107bde3ae010` and exact rollback fingerprint.
- FIN02 + SEC37 real TEST isolated SQL transaction: **9/9 financial tests PASS** on original award/renewal RPCs, including one first sale €1,608, 2027 renewal €570, 2028 renewal €570, ledger sum €2,748, correct source pricing and idempotent retry. All fictional rows were rolled back. Not an actual signed JWT or online acceptance-document workflow.

## Staged review-only changes in this branch
- Exactly **four individual forward migration files** (SEC35/36/37/38) with the exact 12 Oct source content, plus **four standalone rollback SQL files**, all copied by blob hash from Draft PR #34.
- **SEC37 is already installed in TEST** with the same source, and is included only for source-control traceability. SEC35/36/38 remain unapplied.
- This branch builds on focused FIN02 PR #46, in turn on PR #31 and FIN01 PR #28. No huge PR #34's unrelated changes are carried forward.

## Decision / boundaries
- **GO for explicit TEST authorization request** of individual SEC35, SEC36 and SEC38 installs, after confirming operational actors/role signoff, rollback sequencing and signed-session QA. **NO-GO for PROD or blanket release.**
- A correct direct-write policy cannot replace official `award_deal_proposal`/`close_renewal` permission checks.
- Keep unresolved R1 issues open: FIN03 immutable official documents, MEM01 Commercial Memory, OPS01 routing/autosave/timezone/stage history, UX01, QA01 real browser/JWT Target→Renewal journey, compare KeepIT/UseIT chosen-option provenance, historical R1 Thai Union mismatch. No historical modifications authorized.
