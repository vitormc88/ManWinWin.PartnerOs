# Customer Explorer

Global customer discovery for authenticated PartnerOS users. The page belongs
to Resources and uses the existing Knowledge Base module permission. A user
with no Knowledge Base access cannot see the navigation or query the directory.

## Behavior

- Sector, commercial region, country and company/partner search are combined.
- Active customers are shown by default; historical customers are opt-in and
  labeled. Archived customers are excluded.
- Country aliases are normalized (RO/ROMANIA; SA/KSA/Saudi Arabia, etc.).
- The map aggregates at country level, never customer installation addresses.
  The adjacent country list also works by keyboard and on small screens.
- Selecting a customer prepares an email to the partner's primary contact.
  No emails are sent by the application. Missing contacts and HQ Direct use
  Customer Care at the existing support@manwinwin.com address.
- Customer visibility does not claim willingness to act as a reference.
- New/changed source clients and partner contacts synchronize transactionally
  through database triggers. The React Query directory refreshes every minute
  while the page is open and on window focus. Refresh is also available manually.

## Data boundary

`public.customer_explorer_directory` contains id, name, country, sector, active,
partner, contact_name, contact_email and synced_at. Contacts come from partners,
never customer email/contact tables. No contract, license, credentials, notes,
pricing, customer address or customer contact is copied into the directory.

Only SELECT is granted to authenticated users. RLS checks an active profile,
an HQ identity or active partner membership, and HQ admin / Knowledge Base
permission. Anonymous users receive no grant. The synchronization function is
private, has a fixed empty search_path, and cannot be called by browser roles.
Existing clients and partners policies are unchanged.

## Preview

The local preview shares the production React component but uses an ignored,
minimized snapshot. It is not built by the normal `index.html` production build.
Real directory fixtures and the preview entry must never be committed or hosted
publicly. Start on loopback only. The committed app still requires authentication.

URL: http://127.0.0.1:8770/customer-explorer-preview.html

## Deployment after visual review

1. Generate a migration using `supabase migration new customer_explorer`.
2. Copy `docs/customer-explorer-directory.sql` into the generated migration.
3. Apply and test in TEST first, separately from PROD. The current connector only
   exposes PROD, so no TEST deployment has been claimed.
4. Regenerate Supabase types and replace the temporary unknown-relation cast.
5. Verify with a partner session that directory results span partners and that
   detailed clients still respect the original scope. Test denied/inactive users.
6. Apply the reviewed migration to PROD before merging/publishing the frontend.
7. To disable directory access, revoke SELECT from authenticated and remove the
   navigation. This does not affect existing customer records.

## Validation performed

- TypeScript application check passed.
- Six unit tests cover country normalization, healthcare matching, historical
  inclusion, regions, unknown sectors and correctly encoded email drafts.
- The application builds with the local esbuild configuration. Original SWC
  native bindings are unavailable on this host; production config is unchanged.
- Browser verified Healthcare -> Romania -> INFOMED -> George / email draft,
  historical toggle, country map/list selection, empty state and mobile layout.
- SQL was exercised in a transaction on PROD and rolled back: 129 projection
  rows; sync restores a removed projection entry with a zero-row source UPDATE;
  a real partner can read the full minimized directory but not all source clients;
  an unknown profile sees zero rows; anonymous SELECT and authenticated writes /
  private function EXECUTE are denied. Final check confirms no directory table
  remains in production. No source customer values were changed by this test.

Map boundaries and country label positions: Natural Earth 1:110m countries,
downloaded from the nvkelso/natural-earth-vector official repository, 7 Oct 2026.
Public domain: https://www.naturalearthdata.com/about/terms-of-use/
Regions are commercial groupings; they are not assertions about political borders.
