# Account access recovery — 14 October 2026

An invitation that expires or is partially accepted must be recoverable using the
same account/email. No deletion, replacement identity, role assignment, partner
change, permission override, migration or commercial-data update is part of recovery.

## Changes

- HQ Admin can request an access email for pending AND active enabled accounts.
- Lookup by the original Auth UUID, checking its email; legacy email-only callers
  and creation duplicate checks paginate Auth users and surface lookup errors.
- Unconfirmed email receives an invitation; confirmed email receives password
  recovery. Only an already-confirmed-email race permits recovery fallback.
- Rate limit/provider failures are surfaced. Success means the auth email request
  was accepted, not that delivery or account activation is proven.
- Redirects are derived from the backend project and fail closed for unknown
  projects. PROD is partneros.manwinwin.com; TEST is the published Lovable app.
- Request a new link opens the recovery form, including when a different identity
  is already logged in. An unrelated existing session is not an activation token.
- Opening a link/signing in cannot stamp invitation acceptance. Activation is
  stamped after successful password update. Flow provenance is captured before
  the SDK consumes the hash and cleared on sign-out.
- Only active HQ administrators may invoke recovery; disabled targets require
  explicit reactivation first. No JWT requirement is relaxed.

## Validation and known limitations

- New tests cover handler authorization, pending/confirmed/active lifecycle,
  pagination beyond page one, identity mismatch, redirect isolation, provider
  failure/rate limit/race, recovery UI controls, stale session, expired links and
  password-save failure. They use synthetic dependencies, not real Auth delivery.
- Whole suite: 943 passed, 2 failed in existing commercial-enablement fixtures.
  Both failures reproduced on unchanged main 0a00bd27fe71e86ccf58e11e56b8fc8e62d66c9d
  in a separate clean worktree. No commercial enablement code changed here.
- TypeScript and Vite build pass. Existing CSS/import/chunk-size warnings remain.
- Installed PROD admin-create-user v7 independently read: it already uses the
  correct PROD redirect, unlike repository main. The original report's redirect
  hypothesis is not established as the cause of Yohali's incident.
- TEST connector denies access; no TEST deployment or live Auth/email activation
  has been verified. Vercel project inspection also returned a scope-permission
  error. Production release must await real TEST acceptance, not just mocks.

## Release and rollback

1. Stage this branch's admin-create-user (index.ts, handler.ts, recovery.ts) in
   TEST, preserving its existing JWT verification setting. No schema changes.
2. Verify existing pending-unconfirmed, pending-confirmed and active QA identities:
   exactly one access request, correct recipient and TEST redirect, actionable
   provider error, same Auth UUID/role/partner/overrides before and after.
3. User sets their own passwords via latest email. Verify fresh password login,
   old/expired-link recovery and a browser already logged in as another identity.
4. Only after acceptance, deploy the matching endpoint to PROD and merge ONLY this
   PR (not Gate 3 QA PR #52), then verify the Vercel production commit, host and
   database ref. Do not send recovery mail to operational users without request.
5. Rollback frontend to the previous production commit and redeploy the original
   PROD endpoint v7 from a secured deployment snapshot. Do not rollback by copying
   the old repository TEST redirect into PROD. No data rollback is required.
