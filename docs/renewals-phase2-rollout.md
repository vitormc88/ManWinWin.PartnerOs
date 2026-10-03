# Renewals Phase 2 — rollout, activation and rollback (TEST done; PROD by Codex)

## Exact deployment order (PROD, executed by Codex against qownzparzsaeoyccgwuj only)

0. Pre-checks (read-only, abort if any fails):
   - Phase 1a and Phase 1b are applied in PROD. Confirmed PROD migration records (all three must
     be present):
     - Phase 1a: `20261002222357` — phase1a_scope_partner_client_counts_20261002
     - Phase 1b: `20261002233245` — phase1b_hq_direct_revenue
     - Phase 1b privileges: `20261003113639` — phase1b_trigger_rpc_privileges
     Check:
     `select version from supabase_migrations.schema_migrations where version in ('20261002222357','20261002233245','20261003113639');` → 3 rows.
   - Do not infer the Phase 1a implementation from dates, and do not require TEST's trigger
     implementation to replace PROD's. PROD's Phase 1a is accepted as-is once its migration
     record is present; no functional trigger check is required.
   - Phase 1b: `public.close_renewal` is the 1b version (it becomes `close_renewal_core`), and
     `clients.is_hq_direct` exists.
   - None of the files below is already recorded in schema_migrations.
1. Apply these migrations byte-for-byte, in order (files in `supabase/migrations`):
   1. `20261003115534_d9b3910e-…sql` — Phase 2 core: private settings (enforce=false) + guard log,
      proposal columns, proposal_status_events, validate_proposal / mark_proposal_sent /
      record_proposal_acceptance, renewal_close_readiness, status guards,
      close_renewal → close_renewal_core rename + new close_renewal wrapper.
   2. `20261003115601_2ce4fb43-…sql` — revoke EXECUTE on guard trigger functions and
      proposal_contract_recurring.
   3. `20261003120041_d7bd5bbd-…sql` — validate_proposal: variant check only for renewals.
   4. `20261003120324_0ddfb0c7-…sql` — validate_proposal: message collection fix.
   5. `20261003120919_f3a07729-…sql` — proposals_status_guard: totals change on a validated
      proposal requires revalidation; trigger also fires on total changes.
   6. `20261003121004_5ee1073b-…sql` — close_renewal / renewal_close_readiness: authentication
      check, specific NOT_AUTHORIZED_CLOSE messages, unauthorised close always refused.
   7. `20261003125518_a765790c-…sql` — full commercial-term protection: `commercial_fingerprint`
      (proposal pricing fields + all line items) captured when a proposal leaves Draft; commit-time
      check on proposals and proposal_items (INSERT/UPDATE/DELETE): Ready/Sent → REVALIDATION_REQUIRED
      (follows warn/enforce), Accepted/Won → TERMS_LOCKED (always rejected); same-status totals
      guard now includes Won; ambiguity rule = different contract, service type or end date, no tolerance.
   8. `20261003125531_f2b357ef-…sql` — baseline fingerprint for proposals already Ready/Sent/Accepted/Won
      (data-only; no status or value change).
   After step 1 the Ready/Sent guards are in WARN mode; the current PROD app keeps working.
   Note: TERMS_LOCKED on Accepted/Won is not switchable — the old app does not edit those.
2. Verify grants: the six callable actions are EXECUTE for authenticated + service_role only
   (no anon/PUBLIC); guard/trigger/fingerprint functions have no authenticated/anon EXECUTE.
3. Publish the app build containing: Validate / Mark Sent / Record acceptance, official close
   from Partner > Renewals, downloads no longer change status, full-configuration revalidation
   prompt in the proposal assistant, wizard keeps its step after Save/Validate.
4. Watch for 1–3 days:
   `select guard, count(*) from private.workflow_guard_events where not enforced group by 1;`
   Expect ~0 once all users run the new app.
5. Enforce (single settings row, id = true):
   `update private.renewal_workflow_settings set enforce = true, updated_at = now() where id = true and enforce = false;` → 1 row.
6. Smoke test in PROD with a disposable record, then remove it.

TEST state: all eight applied; enforcement ON since 2026-10-03 12:10 UTC.

## Rollback (reverse order)
- Step 5/6 problem:
  `update private.renewal_workflow_settings set enforce = false, updated_at = now() where id = true and enforce = true;` → 1 row.
  Instant, no data loss; violations are logged instead of blocked.
- Step 3 problem: republish the previous app build (DB stays in WARN; old app works).
- Migration 7/8 problem: drop triggers trg_z_proposals_terms_check, trg_z_proposal_items_terms_check
  and trg_b_proposals_capture_fingerprint (the column may stay; additive).
- Step 1 problem (full DB rollback, only if needed): drop triggers trg_a_proposals_status_guard
  and trg_a_renewals_terminal_guard; drop the new close_renewal; rename close_renewal_core back to
  close_renewal and re-grant EXECUTE to authenticated. New columns/events stay (additive).

## Existing records
No proposal is downgraded or auto-validated. Existing Ready renewal proposals must record
acceptance before closing as Renewed once enforced. EVEREL Group / SELECT FRUITS (PROD) are
left for Codex reconciliation.
