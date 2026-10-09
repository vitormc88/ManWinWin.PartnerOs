# Customer Explorer PDF release

## Release gate

Do not publish until the authenticated TEST partner check has passed.
TEST is avxxzmoayxzrykwqzoqn; PROD is qownzparzsaeoyccgwuj.
No schema migration, permission expansion or customer backfill is required for this PDF release.

## Behaviour

- Export all filtered results, not just the first twelve cards, or select individual customers.
- Four independent options: map (off), logos (on), websites (on), reviewed case studies (off).
- Recheck the database read capability, refetch the RLS-protected directory, and reject changes in the visible selection before rendering.
- Recheck capability and selected IDs after rendering and before the download.
- Render only public company name, country, sector, confirmed logo, reviewed website and curated public case-study fields.
- Never render customer IDs, owner names/emails, evidence notes or commercial information.
- Logos downloaded from the existing private Storage bucket with the signed-in user's permissions; missing or inaccessible media omitted.
- Mandatory local official branding and ISO footer; fail if branding cannot load.
- Text is searchable, links clickable, filename/date/filter context explicit; long names and study paragraphs wrap and paginate.
- Cases require a complete reviewed schema. Public article claims are labelled as not independently audited results.
- Website coverage is deliberately limited to the reviewed initial catalogue in customer-export.ts. It is not a complete website enrichment and does not infer domains.

## Test checklist

1. Run customer-export, customer-explorer-page and explorer-access tests.
2. Inspect every rendered page of the generated small and large QA PDFs.
3. In the authenticated local TEST interface, verify a real partner can download a small filtered selection and all results; review the resulting PDFs.
4. Confirm HQ management is absent for that partner and export respects the database capability and visible projection.
5. Run build/type checks. Commit the dependency lockfile, fonts, licence and official branding.
6. Publish only this reviewed release; verify the PROD environment guard and export smoke test. Roll back the frontend release if needed; no database rollback is needed.

## Scope exclusions

No Word/Excel export. No automatic case-study writing or website discovery. No changes to customer sources, rollout settings, roles or RLS policies.
