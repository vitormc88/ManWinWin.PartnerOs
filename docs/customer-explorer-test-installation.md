# TEST installation receipt — 8 October 2026

User explicitly approved permanent installation of the Explorer base in TEST,
initially HQ-only, without publishing or changing PROD.

Installed through the existing Lovable Cloud SQL editor for project
`09e44188-ec64-4ec3-8add-b3b54882408c`. The transaction checked
`private.notification_settings.functions_base_url` against TEST ref
`avxxzmoayxzrykwqzoqn` and required the Explorer directory to be absent.

Applied `docs/customer-explorer-management.sql` in a transaction, ran
`docs/customer-explorer-management-tests.sql` inside a savepoint, reverted the
savepoint (including fixtures and temporary pilot/all/off settings), then committed
only the base installation. All SQL assertions passed.

Independent query after commit confirmed:

- Rollout mode: `hq`; partners remain blocked by database authorization.
- Existing `clients`: 56; existing `partners`: 18, unchanged.
- Directory projection: 6 eligible numeric client references from existing TEST data.
- HQ rows, overrides and audit fixture rows: all zero.
- RLS enabled on all four new public tables; anonymous SELECT blocked.

No real master-list import, logo upload, case-study metadata installation, frontend
deployment, GitHub merge, Lovable publication or PROD mutation was performed.
Fictitious records were used only within the reverted test savepoint.

This was direct SQL execution, not a CLI migration deployment. The generated file
`supabase/migrations/20261008132417_customer_explorer_management.sql` matches the
installed source, but **no migration-history entry was recorded**. Reconcile that
history using the supported workflow before a future automated TEST deployment;
do not blindly rerun this fresh-install migration against TEST.

Still pending: authenticated frontend end-to-end tests, source-trigger failure
isolation, durable logo/case-study administration, import/concurrency hardening,
and PROD backup/reversal verification. This receipt does not certify PROD readiness.

Proof: workspace `outputs/customer-explorer-test-installed.png`.

Subsequent authenticated frontend testing and the additive safe-refresh correction
are recorded in `customer-explorer-frontend-test.md`. A single hidden fictitious HQ
fixture now remains in TEST; the zero-fixture counts above describe installation time.
