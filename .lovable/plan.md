# Diagnosis — Academy certificates missing after publish of e64b8f2

No code, data, migrations or deployments were touched. Findings below come from reading the repository and from a read-only count on the Lovable-connected TEST database only.

## 1. Is the deployment using the expected production database?

Cannot be confirmed from here, and this is the first thing to check.

- The environment guard in `src/lib/supabase-env.ts` maps host to project ref: only `partneros.manwinwin.com` resolves to production `qownzparzsaeoyccgwuj`. Every other host (including the Lovable published URL `partneros-manwinwin.lovable.app` and any Vercel preview URL) is classified as TEST and must resolve to `avxxzmoayxzrykwqzoqn`.
- Committed `.env` holds TEST values only (`avxxzmoayxzrykwqzoqn`). Production values come exclusively from Vercel Production env vars; if those were ever cleared or overwritten, the guard would throw at client creation, so a *loading* app on the production host implies the production ref — but a *non-production host* would silently and legitimately be on TEST.
- Symptom match: on TEST there are currently **0 rows** in `academy_certifications` (verified read-only), so browsing the Lovable published URL or a Vercel preview would show exactly "0 certificates" and "no certificate matches" for `ACAD-6C260C-D9C486D4`.

Action: confirm the exact hostname used when the failure was seen, and confirm the browser network tab shows requests to `qownzparzsaeoyccgwuj.supabase.co`.

## 2. Does `academy_certifications` contain the reference?

- TEST: no. `select ... where upper(btrim(certificate_reference)) = 'ACAD-6C260C-D9C486D4'` returns zero rows, and the whole table is empty.
- Production: unknown and deliberately not queried — the Lovable tooling is bound to TEST and must never be used to infer or touch production state. This must be checked directly against `qownzparzsaeoyccgwuj`.

## 3. Do the current RPCs return it?

The frontend reads certificates exclusively through RPCs, never through table selects:

- `/certifications` -> `academy_my_certificates()` and `academy_managed_certificates(_partner_id)`
- `/verify/:reference` -> `academy_verify_certificate(_reference)`

These are defined in migrations `20260820153112`, `20260820181313` and `20260820181422`. Lovable applies migrations to TEST only, so production has them **only if they were applied there independently**. That is the leading production-side hypothesis.

Failure mode confirmation: `src/pages/Certifications.tsx` renders no error branch — it only checks `myCerts.length === 0`. A failing or missing RPC (404 `function does not exist`, or missing `GRANT EXECUTE`) therefore renders as "0 certificates" rather than an error. `CertificateVerify.tsx` collapses `isError` and `found === false` into the same "No certificate matches this reference." message. Both symptoms are indistinguishable from a wiring/permission failure.

## 4. Is the published commit the cause?

No. `e64b8f2` is frontend-only (certificate document/QR components, CSS, preview route, tests, `package.json`). It contains no migration, no RPC change and no data operation. It did change the verification page to call `academy_verify_certificate` through the same hook, but that hook and RPC name predate the commit.

## Ranked causes

1. The failing session was not on `partneros.manwinwin.com` (Lovable published URL or a Vercel preview), so it hit the empty TEST database.
2. Production `qownzparzsaeoyccgwuj` never received the `20260820*` academy migrations, so `academy_my_certificates` / `academy_verify_certificate` do not exist or lack `EXECUTE` grants there, and the UI degrades silently to "0 / not found".
3. Production has the RPCs but the certificate row's `status`, `module_id` join, or `user_id` no longer resolves — `academy_verify_certificate` inner-joins `academy_modules`, so a certificate pointing at a deleted/renamed module returns `found: false` even though the row exists.

## Verification steps to run against production only

1. Confirm the hostname and the Supabase origin in the network tab of the failing session.
2. Against `qownzparzsaeoyccgwuj` (read-only): `select certificate_reference, status, module_id, user_id from public.academy_certifications where upper(btrim(certificate_reference)) = 'ACAD-6C260C-D9C486D4';` and `select count(*) from public.academy_certifications;`
3. Check RPC existence and grants: `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('academy_my_certificates','academy_managed_certificates','academy_verify_certificate');`
4. If the row exists, check the module join: `select c.certificate_reference, m.id from public.academy_certifications c left join public.academy_modules m on m.id = c.module_id where upper(btrim(c.certificate_reference)) = 'ACAD-6C260C-D9C486D4';`

## Suggested follow-up fix (not applied)

Surface RPC errors in `Certifications.tsx` and `CertificateVerify.tsx` instead of rendering them as "0 certificates" / "not found", so a wiring or permission fault is never mistaken for missing data.
