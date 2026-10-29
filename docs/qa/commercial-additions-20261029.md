# Mid-cycle license additions

## Problem and scope

Existing-customer Add Users / Modules / Plugins previously entered the generic implementation wizard. It could propose the wrong product family, reprice the installed base, and leave selected components as notes instead of priced additions.

Dedicated delta editor now handles BackOffice, WEB/Mobility, Requests, Stock, Purchase, Import, Workflow, Advanced Reports, SLA and API. The source license identity, contract and renewal date remain fixed. Unsupported Professional changes require a supported license upgrade. Components already owned are unavailable. Other commercial actions retain the existing wizard.

## Commercial rules

- Explicit effective date and partial-month policy; no implicit convention or twelve-month cap.
- KeepIT: perpetual delta charged once, marginal S&AT prorated; existing base fees excluded.
- UseIT: annual delta prorated with S&AT included; no additional 17% surcharge.
- SaaS additional BackOffice hosting, WEB and API carry separate annual increments.
- Active EUR catalogue units validated. Historical contracts require an explicit pricing reference; direct SKU versus KeepIT × UseIT factor remains an explicit choice, never silently rounded into one price.
- Partner revenue shares require HQ and explicit values. No rates inferred from notes. Unreconciled annual baseline cannot be represented as a confirmed renewal total without acknowledgement of the same offer basis.
- Implementation is reviewed explicitly and either excluded or quoted separately.

## Persistence and boundaries

`save_commercial_addition_draft` is SECURITY INVOKER with fixed search_path. It uses the existing proposal-source authorization and table RLS, accepts only authenticated callers, checks current source timestamps/components/counts/date, and saves Draft + incremental lines atomically. Saved prices are frozen in the addition snapshot. Optimistic updated_at guards concurrent edits. Non-Draft records are read-only. No licensing, contracts, renewals, pipeline awards, notifications, validations or acceptance operations are executed by this flow.

Each mirror line stores its amount payable now; annual deltas are separately preserved in the proposal header and complete JSON snapshot. PDF/Word use this snapshot and clearly distinguish payable now from future annual increase. These drafts do not automatically activate entitlements or apply their increment to a renewal. That remains a separate commercial approval/operation.

## Verification

- Pure engine: all supported components, quantities, hosting, direct/derived prices, KeepIT S&AT, UseIT inclusion, duplicates, source identity, Professional restrictions and Roman plans, EUR and unit checks, month-end/leap-year and 24-month terms.
- Editor: reopens saved catalogue, exact atomic RPC payload, invalid quantities, immutable validated proposals, edit permissions, HQ-only shares, already-owned API/plugins and malformed snapshot.
- Print escaping and real Word XML: incremental totals, payment terms, special conditions and unconfirmed baseline wording.
- Existing Business proposal mode, source identity and terms workflow regressions included in CI.
- Synthetic local PostgreSQL fixture tests atomic save/edit, stale sources/components, amount integrity, concurrency, Ready freeze, HQ shares, partner isolation, anonymous denial and unchanged license/renewal. Fixture has synthetic helper functions/RLS; actual PROD grants, policies and triggers are separately inspected. It is not a full restore or a partner-session test.

The local Supabase CLI available on this machine does not support migration creation. Reviewed SQL was applied through Supabase's migration tool; its journal assigned version `20261029191940`, now retained in `supabase/migrations/20261029191940_commercial_addition_atomic_drafts.sql`. Never execute the local fixture in TEST/PROD.

PROD verification: authenticated HQ atomic save/edit passed against the actual schema, RLS and triggers inside one transaction ending in ROLLBACK. Zero test proposals remained. No commercial choices or customer changes were persisted.

## Barcino

No real priced proposal was saved as part of verification. The 2023 price reference, 352 versus 351.50 annual BO price, partner billing basis and partial-month convention still require an explicit commercial decision. Imported contract annual totals also require reconciliation. These are not silently resolved by code.

## Rollback

Revert the frontend commit to restore the prior UI if necessary. The additive RPC may remain unused; it changes no existing table schema, policies or customer data. Never delete saved proposals to roll back the release. Disable its execute grant only if retiring the new flow; retain stored snapshots for inspection.
