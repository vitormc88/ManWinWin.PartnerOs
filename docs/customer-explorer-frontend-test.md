# Authenticated frontend TEST check — 8 October 2026

Scope: local frontend at `http://127.0.0.1:8770/customer-explorer`, linked by the
existing environment guard to TEST (`avxxzmoayxzrykwqzoqn`). User signed in with
their existing HQ account. No session tokens or passwords were extracted/copied.
No frontend was published, no branch merged and PROD was untouched.

## Verified through the actual interface

- HQ navigation and map loaded the six eligible numeric references from TEST.
- Created HQ fixture `987654320`, `ZZ Explorer HQ TEST — fictitious`, country PT,
  Manufacturing, lifecycle unconfirmed, validated sector and private test note.
- Full browser reload read the fixture from the database (not in-memory demo state).
- Search/map correctly located Portugal; reference dialog routed to
  `customercare@manwinwin.com`. No email was sent or email application opened.
- Edited the fixture to Energy. Changing sector reset its validation to unconfirmed;
  explicitly revalidated it as HQ and hid it from the Explorer.
- Saved record appeared as Energy/validated/Hidden in HQ management and disappeared
  from the public-style map/list. Fixture intentionally remains hidden in TEST as
  reproducible evidence; it is not a real customer or a PROD import.

## Compatibility issue found and fixed

The API save initially failed with `DELETE requires a WHERE clause`. The refresh
trigger rebuilt its derived projection using DELETE without a predicate; API
safe-update protection applies even inside this privileged trigger, unlike the
earlier SQL-editor test session.

Applied the narrow additive fix
`supabase/migrations/20261008140922_customer_explorer_safe_refresh.sql` through the
TEST SQL editor with an explicit TEST guard. It changes only the projection DELETE
to `WHERE id IS NOT NULL` (its non-null primary key); keeps API safe-update protection,
RLS, privileges and existing source records unchanged. Retried browser save successfully.
This was direct SQL, so migration history still needs reconciliation before automated
TEST deployment. Base migration file is unchanged; fresh-install source in docs now
includes the correction.

## Security and persistence checks

Separate SQL transaction used an existing active partner profile as JWT/role context:
directory read denied, management capability denied, INSERT rejected. Rolled back
that check. This is database-role testing, **not a partner browser-login test**.

Independent post-check confirmed clients 56 / partners 18 unchanged, rollout `hq`,
fixture sector Energy / visibility false, two audit events, and private note absent
from the directory projection.

Frontend management now follows the database `manage` capability rather than simply
the general app-admin flag. Querying is disabled when read capability is unavailable;
refresh errors fail closed instead of retaining a previous positive permission.

37 targeted unit/component tests passed across five files. These complement, but do
not replace, the authenticated browser and database checks above.

## Remaining before wider rollout

Controlled partner-browser test; source-trigger failure isolation; durable logo and
curated case-study metadata administration; import dependency/security and concurrency
hardening; migration-history reconciliation; PROD backup and recovery verification.
The local prototype's complete private customer master list, logos and case summaries
have not been imported into TEST. No PROD-readiness claim is made.

Proof images in workspace outputs: `customer-explorer-test-hq-edit.png` and
`customer-explorer-test-connected.png`.
