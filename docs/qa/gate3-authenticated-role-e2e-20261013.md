# PartnerOS R1 — Gate 3 actual Auth E2E (13 October 2026)

STATUS: TEST-only QA pack staged, real JWT logins not yet executed. No TEST or PROD business-data writes, no invitations, no password resets, no Lovable AI credits, no production merge.

## Read-only inventory confirmed

- Lovable TEST project 09e44188-ec64-4ec3-8add-b3b54882408c, Supabase TEST avxxzmoayxzrykwqzoqn. PROD qownzparzsaeoyccgwuj is strictly excluded.
- TEST has 15 Auth records, 13 profiles and 13 assigned roles: 3 HQ Admin (2 active), 6 active Partner Admin, 2 active Partner Sales. Confirmed email/password authentication is configured. No password, password hashes, JWTs or users' emails were retrieved.
- Two existing Partner Admin accounts have QA/test email indicators, but no HQ Admin or Sales identities are marked as QA. Do not use operational staff logins or reset passwords for testing.
- One partner group has active Sales and Admin profiles with canonical financial assets. There are two partner groups with canonical-only finance fixtures for cross-partner denial.
- SQL catalog permission metadata indicates Partner Sales clients:edit=false and renewals:edit=false; Partner Admin clients:edit=true and renewals:edit=false; HQ Admin has clients:edit. These are NOT yet real JWT acceptance results.

## Executable suite

- qa/gate3/contract.mjs and contract.test.mjs: fail-closed TEST URL, configuration and JWT metadata unit checks. Metadata checks are NOT cryptographic signature verification.
- qa/gate3/authenticated-readonly.mjs: Supabase Auth password login with three dedicated QA accounts and remote Auth getUser() verification of genuine Supabase issued JWT. Verifies active profiles, user_roles, has_module_access RPC, own canonical Client/License/Contract/Renewal visibility, cross-partner denial and HQ multi-partner access. Logs labels only, never emails/tokens/customer IDs.
- qa/gate3/browser-login.spec.mjs: Playwright Chromium logins using a disposable local TEST-configured Vite frontend, visits protected Clients route, checks all Supabase requests go to TEST. No stored screenshots, traces, videos or session storage exports.
- .github/workflows/gate3-authenticated-rls.yml: on pull_request, offline contract checks only with no secrets. Actual credentials consumed ONLY on manually dispatched workflow on reviewed main with explicit TEST_ONLY input. No scheduled tests or automatic PROD dependencies.

## Private prerequisites before signed QA can execute

Exactly three dedicated and authorized TEST QA accounts: Partner Sales and Partner Admin of the SAME partner with canonical fixtures, plus HQ Admin. Existing QA-named Partner Admin account may qualify. Sales and HQ dedicated accounts need confirmation/provisioning via official TEST Supabase Auth administration. Do not create identities, reset staff passwords or issue invites without explicit user approval.

After identity setup, securely store in GitHub Actions encrypted repo secrets, never in chat or source:
- GATE3_QA_SALES_EMAIL and GATE3_QA_SALES_PASSWORD
- GATE3_QA_ADMIN_EMAIL and GATE3_QA_ADMIN_PASSWORD
- GATE3_QA_HQ_EMAIL and GATE3_QA_HQ_PASSWORD
- Optional GATE3_TEST_SUPABASE_ANON_KEY. A public TEST-only publishable key is already present in the committed TEST .env fallback. Never use a service_role key or project signing secret.

A separate approved merge is needed to place the manual workflow on main; this can cause a Vercel PROD frontend redeploy and must not be done without consent, especially during concurrent logo/UI development.

## Gate exit criteria

- [x] TEST roles, active status, existing canonical finance fixtures and helper grants preflighted read-only.
- [x] Real JWT + browser TEST QA code staged without production code changes.
- [ ] Offline branch CI contract tests confirmed green.
- [ ] Dedicated TEST Sales/Admin/HQ QA accounts and passwords prepared securely (no staff credential sharing).
- [ ] Manual GitHub job with real signed TEST JWTs PASS (Auth remote verification, RLS reads, permission RPC, browser logins).
- [ ] Controlled rollback-safe negative INSERT/PATCH tests against signed JWTs and official close_renewal flow; script intentionally does NO writes to customer data.
- [ ] Full UI commercial/finance E2E, lifecycle/notifications and document checks remain to pass.

A successful offline CI unit test is never sufficient to declare Gate 3 Auth E2E PASS. The previous PostgreSQL role-simulation tests are valuable but are not signed Auth logins. R1 overall stays NO-GO for production financial DB migrations.
