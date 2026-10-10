# Partner Growth Sprint 4A — TEST regression (10 October 2026)

Scope: isolated hardening branch / PR #22. No change to PROD or main.

## Results
- **PASS:** Lovable TEST PostgreSQL connection verified separately from Supabase PROD: TEST has Partner Growth tables, PROD does not.
- **PASS:** migration `20261010230000_partner_growth_s4a_hardening.sql` rehearsal in `BEGIN/ROLLBACK`.
- **PASS:** installed additive migration only in TEST. Both signed-model and approved-owner guard triggers enabled and independently checked.
- **PASS:** authenticated *SQL role/JWT simulations* with an active HQ Admin: unsigned cannot handoff, signed-model mutation rejected, legal review required, approved-owner mutation rejected, legal and handoff approver attribution persisted in transaction.
- **PASS:** authenticated *SQL role/JWT simulation* for HQ Standard: edits to planning permitted; legal review and handoff approvals both denied. This account/permission variation was rolled back.
- **PASS:** external account denied prospect access.
- **PASS:** transaction-only test records and simulated permissions fully rolled back. Confirmed prospect count of 2 and existing activation plan count of 1.
- **PASS:** 11 direct Node 22 assertions against `partner-activation-task.ts`: required valid date, duplicate open-task prevention, completed/cancelled tasks permitted, canonical `status=Done` overrides stale `task_status=Open`.
- **PASS:** Vercel preview status Ready after latest fixes, according to GitHub deployment comment.

## Not yet verified
- No real authenticated browser session with HQ Admin/HQ Standard was available to this chat. SQL role/JWT simulation is not UI E2E.
- Full repository Vitest suite, TypeScript compilation and Vite build not directly executed locally; the remote Preview build succeeded.
- Desktop/mobile visual QA and browser-exported documents still require review.
- Duplicate prevention is application-level (not a database-wide uniqueness guarantee during concurrent browser sessions).
- Database migration was installed via Lovable's TEST SQL interface. The `supabase_migrations.schema_migrations` table did not include 4A migration versions before installation; the versioned SQL in this PR remains the canonical deployment artifact. Reconcile TEST migration history before any future PROD release.

## Explicit release gate
Do not merge PR #22 into Sprint 4A or promote any Partner Growth branch to main/PROD without separate user approval and the remaining authenticated UI acceptance.
