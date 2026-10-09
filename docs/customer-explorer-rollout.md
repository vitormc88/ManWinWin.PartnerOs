# Customer Explorer rollout

The map remains the main view. The target audience is every active authenticated PartnerOS partner, but a fresh installation is **HQ-only**. Partner reads are denied by database RLS until the rollout gate explicitly enables a pilot or all partners. Only active HQ administrators manage it. The confirmed Customer Care address is customercare@manwinwin.com.

## Verified TEST access — 8 October 2026

The Supabase connector still exposes PROD only and refuses direct TEST access. However, the authenticated Lovable PartnerOS project at https://lovable.dev/projects/09e44188-ec64-4ec3-8add-b3b54882408c has a supported Cloud SQL editor. A read-only query verified `private.notification_settings.functions_base_url` points to `https://avxxzmoayxzrykwqzoqn.supabase.co/functions/v1`. TEST contains 56 clients and 18 partners, with two active HQ admins and eight active partner users suitable for role checks. No Lovable generation, draft acceptance, merge or publication was used.

The fresh-install SQL and management assertions were executed through that editor in one explicitly TEST-guarded BEGIN/ROLLBACK transaction. The user approved the editor's DELETE warning for this rollback-only test. All assertions passed. A separate query then confirmed the HQ table, directory, rollout table and capability function are absent, and counts remain 56 clients / 18 partners. This is successful database validation, **not** a persistent installation or authenticated frontend end-to-end test.

The official Supabase CLI 2.120.0 was downloaded into the ignored private preview tools folder and verified against the vendor's SHA256 checksum. It generated `supabase/migrations/20261008132417_customer_explorer_management.sql`; that file contains the reviewed fresh-install source. No migration has been pushed to either remote database. The host has no detected Docker-compatible runtime, so no full local Supabase stack was claimed or started. TEST is currently the supported validation route.

## Database rollout modes

`private.customer_explorer_rollout` is inaccessible to browser roles. Missing settings fail closed. Modes:

- `hq` (default): active HQ members read; HQ administrators manage; partners cannot read even by direct API request.
- `pilot`: adds only the active partner users named in `pilot_user_ids`; they remain read-only.
- `all`: all active partner members read; management remains HQ-only.
- `off`: denies Explorer reads and management, including HQ. Existing client, renewal and proposal permissions are not changed.

`public.customer_explorer_access()` is a security-invoker boolean capability endpoint for authenticated users only. Navigation and direct-route protection consult it, fail closed on unavailable capabilities, and refresh every 30 seconds. The database enforces access on each new request independently of the menu or cached frontend state. Previously delivered data cannot be retrospectively removed from a user's possession.

## Emergency disable and reversal preparation

First disable access, preserving every source record:

```sql
update private.customer_explorer_rollout set mode='off',changed_at=now() where singleton;
```

If a projection/synchronization defect affects writes in existing modules, disable **only** the four new Explorer triggers, not other application triggers:

```sql
alter table public.clients disable trigger customer_explorer_clients_sync;
alter table public.partners disable trigger customer_explorer_partners_sync;
alter table public.customer_explorer_hq disable trigger customer_explorer_hq_sync;
alter table public.customer_explorer_overrides disable trigger customer_explorer_overrides_sync;
```

Restore the prior frontend deployment if required. Do not drop populated HQ, override or audit tables as an emergency rollback. Preserve their data and review a versioned repair/reversal. Trigger failure isolation and induced-failure tests must be completed before production release; the current successful-path tests do not prove that source writes survive every projection error.

Before any permanent PROD installation, record a recent successful backup/PITR recovery point, actual restore availability, retention and the responsible operator. Verify separate Storage-object protection for uploaded logos; a database backup is not a logo-file backup. No PROD backup has yet been verified in this work.

## Database and access

Use `customer-explorer-management.sql` as the **fresh-install source**, not the older `customer-explorer-directory.sql`. Neither has been permanently installed in PROD. HQ existence-only records live in a separate RLS-protected table; partner customers continue to come from `clients`. Source customer contacts/contracts/prices are never projected. Notes and audit records are HQ-only. Partner sector/visibility overrides persist through source refreshes; source name/country/lifecycle/contact updates remain automatic.

Only digit-only customer IDs enter this directory. Leading zeros are displayed; canonical identity ignores them. Known test/internal IDs 0000 and 9998 are excluded. Existing numeric partner IDs take precedence over an HQ record if subsequently introduced in the source client list; the retained HQ source record needs reconciliation by HQ. There is no anonymous directory access or partner write access. Hide rather than delete records; DELETE is not granted to browser users.

## Deployment gates

1. Use the verified Lovable TEST SQL editor while direct connector access remains unavailable. Do not bypass the application's TEST/PROD environment guard or accept a Lovable draft to obtain database changes.
2. The base timestamped migration has been generated with `supabase migration new customer_explorer_management`. Keep it aligned with the reviewed source and rerun changed database assertions. No manually invented migration filename.
3. Apply in TEST. Run the management SQL test script within BEGIN/ROLLBACK and test authenticated frontend journeys with actual HQ/partner TEST accounts. Regenerate Supabase types before merging; current hooks use explicit transitional relation casts, not a service-role browser client.
4. Import the initial reviewed HQ-only list and the initial partner classification overrides from the private local reconciliation data. Do not commit or bundle that customer data into the public GitHub repository. The Excel importer skips partner rows by design; those initial sectors require a separately reviewed override seed. Preserve source evidence labels and unknown lifecycle statuses.
5. Verify source changes synchronize, HQ edits persist, partner writes fail, hidden records are inaccessible, audit stamps cannot be forged, and HQ notes are not exposed to partners. Verify import duplicates and the response pagination beyond 1,000 records.
6. Review backup and rollback, apply the database migration before the frontend, and validate HQ-only operation. Enable a controlled partner pilot only after those tests; enable all partners only after import reconciliation and pilot acceptance. Main can auto-deploy to PROD: isolated branch/preview verification must precede merging. No merge or deployment is performed by the local preview.

## Current validation

Database creation, HQ writes/audit, validation stamps, duplicate rejection, persistent overrides, partner read/no-write, hidden-record protection, anonymous/unknown-user protection were exercised against the actual schema in one transaction, fully rolled back. The final query confirmed PROD unchanged. This is database validation, not a completed TEST deployment or end-to-end authenticated production test.

The local preview has an explicitly labeled HQ demo. Its edits are in-memory and disappear on reload. The production page uses the actual RLS-protected sources and atomic HQ batch upsert after import review. No emails are sent; requests open a draft in the user's email app. Existing renewal/proposal/notification paths are unchanged.

## Remaining hardening before release

Persistently install in TEST, regenerate types, verify authenticated frontend journeys and perform reviewed private data seed only in the appropriate environment. Add persistent HQ-managed logos and curated case-study metadata: the base migration does not yet transfer those prototype-only features. Complete source-trigger failure isolation, concurrency/conflict handling, source refresh reconciliation and import security review. Taxonomy currently comes from existing directory sectors; management of new sector vocabulary should be a separate authorized settings change. Large imports (up to 5,000 rows / 5 MB) parse locally with the existing SheetJS dependency; evaluate its current security/version policy before enabling imports broadly. Do not deploy this base migration as if the complete prototype were production-ready.
