# Partner Growth 4B.2 — GitHub Actions deployment feasibility

**Date:** 2026-10-11  
**Target project:** Lovable-managed Supabase TEST `avxxzmoayxzrykwqzoqn`  
**Excluded:** PROD `qownzparzsaeoyccgwuj`, GitHub main, real email invitations

## Probe performed
GitHub Actions workflow `.github/workflows/partner-growth-s4b2-test-deploy-preflight.yml` runs on a disposable feature branch and **checks only whether credential names exist in repository secrets**. It never downloads or uses a secret, never contacts Supabase, and never deploys anything.

**Observed GitHub run:** https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38135083963

Results:
- `SUPABASE_TEST_ACCESS_TOKEN`: MISSING
- `SUPABASE_ACCESS_TOKEN`: MISSING
- `SUPABASE_TEST_TOKEN`: MISSING
- GitHub Action: SUCCESS (presence check only)

No secret contents were emitted.

## Architectural blocker

The TEST Supabase project is hosted and managed by **Lovable Cloud**, not by the user's connected Supabase organization. A personal Supabase access token scoped to a different organization (e.g., where PartnerOS PROD lives) cannot safely be assumed to grant access to this project.

Official Supabase documentation:
- https://supabase.com/docs/guides/troubleshooting/cant-access-supabase-project-lovable-cloud
- https://supabase.com/docs/guides/troubleshooting/identify-lovable-cloud-or-supabase-backend

The GitHub Actions method `supabase functions deploy partner-growth-invite --project-ref avxxzmoayxzrykwqzoqn` is valid for an **account-authorized** Supabase project, but is **not yet usable here**.
- https://supabase.com/docs/guides/functions/deploy

## Next controlled actions

1. Do **not** generate or paste a PROD token in GitHub to make this workflow work.
2. Keep the `partner-growth-invite` function in isolated branch/PR #25 and emails disabled.
3. Safest near-term path is a targeted Lovable Cloud function deployment once the source is available to the Lovable workspace. Confirm branch/draft isolation (and Vercel/main impact) before touching the default branch. This may require one Lovable AI build action/credits; no guarantee of an AI-credit-free function deployment through available connectors.
4. Verify TEST auth redirect allowlist and account email settings before enabling `PARTNER_GROWTH_INVITES_ENABLED`.
5. Obtain explicit signoff for the single email to `vitormc88+partneros-test@gmail.com`, then run genuine browser/inbox E2E.
6. Longer-term optional infrastructure strategy: move TEST into an independently user-managed Supabase project if direct CLI/CI/CD control is essential, but that is a separate significant migration.

**No function was deployed, no migration was applied, no email was sent, no PROD/main changes were made.**
