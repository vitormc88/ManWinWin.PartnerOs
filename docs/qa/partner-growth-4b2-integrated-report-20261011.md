# PartnerOS — Sprint 4B.2 integrated acceptance report
**Date:** 2026-10-11  
**Environment:** Lovable Supabase TEST (project 09e44188-ec64-4ec3-8add-b3b54882408c) and isolated Partner Growth GitHub branch. PROD not modified.

## Scope requested
Fictional prospect eligible → partner conversion → named-contact invite → first login → Academy → first qualified referral → HQ receipt.

## Actual results

| Step | Result | Evidence |
|---|---|---|
| HQ creates, qualifies, signs and approves a **fictional CMSC** prospect | PASS (transaction) | Authenticated HQ role/JWT SQL test |
| Conversion creates one Onboarding / Strategic Connector with proper receipt | PASS (transaction) | Protected conversion RPC, ready_for_handoff / signed guards |
| Reservation for the named partner contact, with restricted connector role | PASS (transaction) | `pg_reserve_partner_invitation`, audited **reserved** record |
| Actual invitation delivery by Supabase Auth/email | **NOT TESTED** | Edge Function not confirmed deployed to TEST; delivery intentionally disabled |
| Account creation and first genuine sign-in via GoTrue/browser | **NOT TESTED** | No controlled test inbox or authenticated browser session; no test account or email created |
| Simulated first-session restricted role, invitation acceptance profile state | PASS (transaction only) | Temporary change to an existing non-HQ TEST profile, rolled back; this is **not** a browser login |
| Published Academy module visible to restricted CMSC | PASS | RLS / `can_access_academy()` |
| CMSC cannot see client, deal, proposal or renewal records | PASS | RLS queries returned no records |
| Submit a qualifying referral through restricted RPC | PASS | `pg_submit_partner_referral` |
| Submitted referral visible to originating partner, read-only | PASS | Partner-level lead RLS and zero-row unauthorized UPDATE |
| HQ sees the same referral, attributed to original partner and routed to HQ | PASS | Authenticated HQ simulation queries |
| No automatic Academy completions or certifications | PASS | No auto-awarded module progress |
| All fictional entities cleaned | PASS | Explicit ROLLBACK and independent read-only verification: 18 partners, 2 original prospects, 0 actual invitations/conversions/fictitious referrals |
| PROD unchanged | PASS | Independent PROD read-only query confirms no 4B.2 invitation table or referral RPC |

Executed QA file: `docs/qa/partner-growth-4b2-safe-flow-rollback-20261011.sql`.

### Prior regression
4B.2 GitHub Actions https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38096543127 — 32/32 Vitest tests, TypeScript and Vite build passed. This validates code interactions with mocks, **not** actual login or email.

## Release blocker: genuine E2E not yet complete
A full E2E requires:
1. A dedicated, user-controlled TEST mailbox (not a real business partner, not a `@example.invalid` address), clearly approved as the test invite recipient.
2. Confirmed TEST deployment of `supabase/functions/partner-growth-invite/index.ts`, with TEST-only secret `PARTNER_GROWTH_INVITES_ENABLED=true` and correctly allowlisted HTTPS `PARTNER_GROWTH_INVITE_REDIRECT_URL`. Keep flag disabled elsewhere.
3. Authenticated HQ Admin test browser + inbox: execute controlled fictional conversion, select test contact, click send exactly once and verify invitation arrives.
4. Complete password setup on the TEST-only partner account, sign in as CMSC, verify Academy published modules, verify forbidden CRM routes/queries and submit a fictional referral.
5. Return to HQ and verify that the referral is visible, has correct ownership and remains unmodified.
6. Remove/revoke TEST fixtures and invitations, disable delivery flag, prove no residue or unexpected real messages.
7. Do not merge 4B.2 to main or PROD before all above pass.

**Important:** A database role/JWT simulation is not a real authentication session. Mark this test as **integrated SQL acceptance PASS / live invite+login E2E pending**, never as fully completed E2E.

## Note on safety
An earlier attempt to synthesize an auth-schema fixture directly via SQL was not completed. It was blocked and no records persisted. That script was removed. The retained test operates on public TEST tables only, runs entirely in a rollback transaction and causes no emails or permanent account changes.
