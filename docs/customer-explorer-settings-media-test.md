# Settings, permissions, fault isolation and media — TEST, 8 October 2026

Installed only in TEST through the guarded Lovable SQL editor:

- `20261008153434_customer_explorer_permissions_and_isolation.sql`
- `20261008154034_customer_explorer_media.sql`
- `20261008155329_customer_explorer_logo_policy_scope.sql`

These are direct SQL installations; no CLI migration-history records were created.
Reconcile history before automated deployment. No merge, publication or PROD change.

## Settings and User Management

`customer_explorer` is now a dedicated shared module key/label, not an alias of
Knowledge Base. Existing role templates receive a new default: HQ Admin admin,
others view. Existing overrides remain intact. Templates confer only eligibility:
the separate rollout gate still defaults to HQ and blocks every partner.

Database access also requires active profile, accepted invitation, active partner
membership where applicable, effective module permission and a healthy enabled
Explorer. Explicit `no_access` wins even for HQ Admin. Directory writes additionally
require HQ Admin and effective edit/admin permission. Partners cannot manage the
directory regardless of a manually elevated module level; the UI limits partner
options to No Access/View and explains this rule.

Explorer Settings requires active HQ Admin with admin permissions for both Settings
and Explorer. These controls remain usable while Explorer is off, for recovery.
Mode changes are audited. No user-editable JWT metadata drives authorization.

Verified in browser: module appears under role defaults and Francisco's individual
permissions; no unrelated user/role settings saved. Saving Disabled denied direct HQ
Explorer navigation, while Settings remained reachable. Saving HQ-only rebuilt and
restored it. Role/user changes invalidate the local capability cache; other active
sessions poll capabilities, while database enforcement changes immediately. Previously
downloaded data cannot be retroactively erased from a recipient's device.

User signed in as Francisco Santos and direct Explorer URL was denied in HQ mode.
This is now a real partner-browser denial test. Authorized partner pilot read/edit
tests are still pending explicit approval; no pilot or all-partner mode is enabled.

## Fault isolation

Before installation, ran the migration and isolation assertions inside BEGIN/ROLLBACK.
Forced a projection CHECK failure and made a no-change update of one existing TEST
client. The core update completed, while Explorer switched off, stored only SQLSTATE
and denied reads. Removed the forced failure within the same transaction and verified
HQ recovery rebuilt the projection. Rolled everything back, then installed the reviewed
function. No persistent core client update was made.

Core clients/partners sync errors are isolated; HQ directory writes still fail
atomically on projection error to avoid false save success. Busy advisory locks are
handled without waiting for a rebuild. This does not guarantee immunity to general
database outages or a failure to write the emergency gate itself; database infrastructure
failure remains a shared risk. No notifications/proposal/renewal workflow changed.

## Persistent media

New minimized media metadata keyed by canonical numeric Client ID; no foreign key
to the rebuildable directory projection. HQ-only edits with database stamps/audit;
read access follows directory visibility, rollout and module permission. Case metadata
requires the nine reviewed fields, official HTTPS `www.manwinwin.com` URL, valid non-future
review date. Extra JSON keys are discarded instead of exposed.

Logo bucket is PRIVATE, max 256 KB, PNG/JPEG/WebP only. Authenticated downloads obey
RLS; the frontend uses local blob URLs, not shareable signed URLs. Uploads use fresh
object names without overwrite/delete grants. Unlinking an old logo preserves the file
privately; no permanent file deletion performed. Existing Storage policies were checked:
they are bucket-scoped and do not expose this new bucket.

SQL rollback tests passed for metadata stamping/audit, private bucket, anonymous/partner
denial, rejected nonofficial URL and dropped extra JSON keys. Browser tests caught an
outer/inner `name` column ambiguity in upload RLS; corrected it through the third migration
without broadening the gate or making the bucket public.

Authenticated browser fixture `987654320` remained hidden. Verified valid PNG upload,
authenticated image download, complete case metadata save, full reload and re-reading
the saved logo/case/date. The logo was a pre-existing public image used ONLY as a test
payload, not an assertion that this fictitious client is that company. Afterwards unlinked
it from the fixture; private test asset remains retained. A mislabeled WebP-as-PNG upload
was correctly rejected by content signature validation. Case fixture explicitly says TEST,
does not claim real customer results and stays hidden.

Independent final check: clients 56, partners 18 unchanged; mode HQ; bucket not public;
fixture visibility false; logo unlinked; review date persisted as 2026-10-08.

46 targeted unit/component tests passed across eight files. Final typecheck, targeted
lint of the new components/hooks/tests, and the complete local production build passed.
Build retains pre-existing warnings about CSS import order, library directives and large
chunks. The build used the alternate local Vite config, not remote deployment. Remote-branch
integration and release certification remain pending.

The pilot approval request was presented with only Francisco selected, but Save was NOT
clicked. Reloaded Settings to restore its saved HQ-only state with no pending selection.

## Outstanding release gates

Controlled authorized partner pilot + write denial + removal/revocation; harden spreadsheet
import dependency and concurrent directory writes; reconcile migrations; integrate current
remote main in the isolated draft; import/reconcile the reviewed private master list;
verify a recoverable PROD backup and asset backup procedure; confirm installation window.
Initial PROD release must remain HQ-only before wider activation.
