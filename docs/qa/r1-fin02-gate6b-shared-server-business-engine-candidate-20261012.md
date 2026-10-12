# PartnerOS R1 — FIN02 Gate6B: Single Business pricing engine in trusted server runtime
**12 Oct 2026 | shared-engine + read-only Edge FUNCTION CANDIDATE | 13/13 CI PASS | No TEST/PROD deployment**

## Our destination
Partner can qualify, demonstrate, prepare a real price quote, negotiate an authorized discount, select KeepIT/UseIT, obtain legitimate approval and customer acceptance, award exactly once, then PartnerOS creates consistent Client, License, Contract, revenue, official archived DOCX/PDF and 2027/2028 renewals **without emergency manual database corrections**. Normal human pricing approval, deal selection and customer signatures remain required. OPS01 Customer Explorer #40/#42 remains a separate operational workstream; MEM01 and UX01 also remain tracked independently.

## Original code reused — not a second Business pricing calculator
- [src/lib/proposal-business-engine.ts](../../src/lib/proposal-business-engine.ts) remains the single Business calculation source for KeepIT and UseIT (derived factor, base SAT/Web, modules, plugins, BackOffice, Web/Mobile, API, SaaS hosting, RCI, Onsite and custom services). Only its type-import path was made relative with a TypeScript extension for Deno's module resolution, along with the necessary readiness/persistence/source coverage type imports. Pricing formulas were NOT rewritten.
- [src/lib/fin02-server-business-quote.ts](../../src/lib/fin02-server-business-quote.ts) is a pure, runtime-independent strict request validator + price orchestrator. It imports the exact Business engine and saved item projection, requires finite percentage caps supplied by the trusted adapter, rejects malformed quantities, unknown commercial fields, negative/NaN/over-100 discounts, missing or duplicated active rules, missing 490/240/37 catalog sources, and reconciles per-line Year1/recurring values for BOTH options.
- Price equality alone remains insufficient authorization: source lines and actual discount permissions will be independently checked and frozen in a later DB transaction. Onsite rate/source history, custom service approval and immutable catalog revision are still surfaced as approval blockers, **never silently treated as approved**.

## New disabled-by-default authenticated Edge candidate
- [supabase/functions/fin02-business-quote/index.ts](../../supabase/functions/fin02-business-quote/index.ts) is **POST preview only**, controlled by `FIN02_SERVER_PREVIEW_ENABLED=true` (unset/off by default). No operation to save/Ready/freeze/award, no emails, no writes to financial or customer tables. No deployment or environment configuration changed.
- Uses client-scoped Supabase JWT, `auth.getUser`, original TEST `public.can_manage_deal(_deal_id uuid)` and row-level source checks; does not use service-role credentials, accept caller-provided role/partner/pricing rules, or accept caller-provided monetary line totals/fingerprint. Queries the server's own active `pricing_rules` filtered to Business, and checks actor's profile/role/partner/discount cap context under user RLS.
- For partner actors, the real `partner_discount_limits` settings table must exist and be readable or the endpoint returns `FIN02_DISCOUNT_AUTHORITY_NOT_INSTALLED` (503). **This table was absent in the read-only actual TEST catalog**, so no partner could silently receive the default cap from a missing schema. Confirmed HQ role is separately checked. Business discount limits are enforced by reusing [src/lib/proposal-discount-policy.ts](../../src/lib/proposal-discount-policy.ts), with extra server strict numeric checks.
- Request accepts only `action=preview`, authorized `deal_id`, and `config`; any client-supplied prices or approval flags are rejected. Response is marked `kind=SERVER_RECALCULATED_PREVIEW`, `officialApproval=false`, `frozen=false`. This is a private server preview proof, **not** a legally/commercially approved quotation.
- CAUTION: GitHub CI bundles the Edge entry via esbuild; **neither real Supabase Deno runtime execution nor authenticated HTTP/JWT/RLS E2E has been performed**. Runtime bundling/deploy compatibility and CORS/rate/abuse controls require a separately approved private TEST rehearsal, not inferred from esbuild.

## Actual TEST source discovery (read-only)
- 38 active Business pricing rows, 38 unique active codes, zero active-code duplicates, including BUS_KEEPIT_MAINTENANCE_MODULE, BUS_BASE_SAT_DAY, BUS_BASE_DEFAULT_WEB, BUS_USEIT_FACTOR, BUS_KEEPIT_SAT and BUS_USEIT_SAT.
- public.can_manage_deal(_deal_id uuid) exists as a SECURITY DEFINER boolean actor permission check, in use in the actual source. Source Deal ownership cannot be trusted from the browser.
- `partner_discount_limits` and versioned authoritative price history remain absent/unproved in actual TEST; approval/freeze must remain NO-GO until controlled migration and full role/audit compatibility.

## Proof
- [Business pricing integrity #38274197971](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38274197971) SUCCESS: new [server-quote tests](../../src/lib/__tests__/fin02-server-business-quote.test.ts) compare the full original Business option engine's EXACT priced source items, gross/net/renewal totals in complex feature-rich variants. They reject unapproved reseller 15% discount, zero cap, malformed/injected values, missing factor/base catalog, duplicate active rules, and flag legitimate custom/Onsite exceptions as not approved. Edge source bundles in CI and has build-time checks for no service-role key, feature gate and can_manage_deal authorization. TypeScript and earlier Business tests PASS.
- [Original financial SQL with Gate5A/5C/5D and two renewals #38274197870](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38274197870) SUCCESS on disposable PostgreSQL 17.
- **13/13 GitHub Actions success** at executable source commit `93b2cc996c59609a1723faac912a53c4500bc83a`, documentation created afterward. No actual authenticated TEST API endpoint was invoked.
- PR #34 remains Draft and unmerged. TEST/PROD unchanged, no migrations, deploy, Lovable Work credits, or actual partner/customer record modifications.

## Remaining mandatory delivery gates
| Stage | Evidence | Release condition |
|---|---|---|
| FIN01 Draft + source Deal | Gate4D synthetic atomic write PASS | Real UI single-call Draft, signed role/RLS, request-idempotency #43 and full TEST private recovery #39 |
| FIN02 Gate6A wizard | Dual option side-by-side preview in Draft PR, CI PASS | Real server-validated preview integration and display/approval states |
| **FIN02 Gate6B server** | **Single full engine shared, strict pure quote + disabled read-only Edge candidate, CI PASS** | Deno runtime + actual signed JWT / RLS in recovered TEST, price-history/role audit and verified discount settings |
| FIN02 Ready + freeze | Gate5C/5D atomic simulated server price-source pair PASS | Immutable effective catalog revision + approved override provenance, concurrent Ready/freeze, chosen-option fingerprints #44 |
| FIN02 selected award | Original award and renewals SQL synthetic PASS | Signed commercial source from single-mode approved comparison revision, real rate/pricing-policy parity |
| FIN03 official docs | Gate5B fake-byte append-only ledger LAB PASS | Real immutable DOCX/PDF + Storage write-once, signed URLs, rollback/retry #45 |
| QA01 Thai Union | Complete 2026→2028 acceptance matrix defined | Real authorized TEST end-to-end with no manual financial repairs |

### Next engineering sequence
1. **Gate6C (not completed):** recover actual TEST schema/auth/role paths, agree trusted price revision and discount override DDL, prove remote Edge signed access in a PRIVATE sanctioned TEST clone (not running in live TEST now). Test wrong partner, HQ, missing table, zero cap, catalog drift, rate and custom-service permissions.
2. **Gate6D (not completed):** bind the approved `Ready` transaction to immutable pair pricing snapshots and single selected proposal, prove two-session freeze concurrency, retries and rollback. The browser NEVER signs/fakes an approved fingerprint.
3. **Gate7 (FIN03):** genuine content-hashed official DOCX+PDF with selected commercial version, immutable Storage & audit and signed download permissions.
4. **Gate8 (QA01):** synthetic Thai Union from Draft through approved prices, award, single initial revenue, 2027/2028 renewals, negative auth tests and no emergency SQL. Then separate PROD go/no-go and release plan.

**Gate6B engineering source/CI PASS does not imply permission to enable the endpoint or move to TEST.**
