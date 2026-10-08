# Customer Explorer rollout

The map remains the main view. Every active authenticated PartnerOS partner can read the minimized directory. Only active HQ administrators manage it. The confirmed Customer Care address is customercare@manwinwin.com.

## Database and access

Use `customer-explorer-management.sql` as the **fresh-install source**, not the older `customer-explorer-directory.sql`. Neither has been permanently installed in PROD. HQ existence-only records live in a separate RLS-protected table; partner customers continue to come from `clients`. Source customer contacts/contracts/prices are never projected. Notes and audit records are HQ-only. Partner sector/visibility overrides persist through source refreshes; source name/country/lifecycle/contact updates remain automatic.

Only digit-only customer IDs enter this directory. Leading zeros are displayed; canonical identity ignores them. Known test/internal IDs 0000 and 9998 are excluded. Existing numeric partner IDs take precedence over an HQ record if subsequently introduced in the source client list; the retained HQ source record needs reconciliation by HQ. There is no anonymous directory access or partner write access. Hide rather than delete records; DELETE is not granted to browser users.

## Deployment gates

1. Obtain access to the existing TEST project (currently the connector lists only PROD). Do not bypass the application's TEST/PROD environment guard.
2. Create a timestamped migration with `supabase migration new customer_explorer_management`; copy the reviewed fresh-install SQL into it. No manually invented migration filename.
3. Apply in TEST. Run the management SQL test script within BEGIN/ROLLBACK and test authenticated frontend journeys with actual HQ/partner TEST accounts. Regenerate Supabase types before merging; current hooks use explicit transitional relation casts, not a service-role browser client.
4. Import the initial reviewed HQ-only list and the initial partner classification overrides from the private local reconciliation data. Do not commit or bundle that customer data into the public GitHub repository. The Excel importer skips partner rows by design; those initial sectors require a separately reviewed override seed. Preserve source evidence labels and unknown lifecycle statuses.
5. Verify source changes synchronize, HQ edits persist, partner writes fail, hidden records are inaccessible, audit stamps cannot be forged, and HQ notes are not exposed to partners. Verify import duplicates and the response pagination beyond 1,000 records.
6. Review rollout and rollback, apply database migration before deploying frontend, then open to all active partner members. No merge or deployment is performed by the local preview.

## Current validation

Database creation, HQ writes/audit, validation stamps, duplicate rejection, persistent overrides, partner read/no-write, hidden-record protection, anonymous/unknown-user protection were exercised against the actual schema in one transaction, fully rolled back. The final query confirmed PROD unchanged. This is database validation, not a completed TEST deployment or end-to-end authenticated production test.

The local preview has an explicitly labeled HQ demo. Its edits are in-memory and disappear on reload. The production page uses the actual RLS-protected sources and atomic HQ batch upsert after import review. No emails are sent; requests open a draft in the user's email app. Existing renewal/proposal/notification paths are unchanged.

## Remaining hardening before release

Test in TEST, create migration, regenerate types and perform reviewed private data seed. The current editor does not yet provide optimistic concurrency conflict handling; do not assume it prevents simultaneous HQ edits. Taxonomy currently comes from existing directory sectors; management of new sector vocabulary should be a separate authorized settings change. Large imports (up to 5,000 rows / 5 MB) parse locally with the existing SheetJS dependency; evaluate its current security/version policy before enabling imports broadly.
