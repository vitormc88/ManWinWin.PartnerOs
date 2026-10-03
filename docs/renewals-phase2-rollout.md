# Renewals Phase 2 — rollout, activation and rollback (TEST done; PROD by Codex)

## Migrations (apply in this order, TEST versions in supabase/migrations)
1. Phase 2 core: settings + guard log (private), proposal columns, proposal_status_events,
   validate_proposal / mark_proposal_sent / record_proposal_acceptance, renewal_close_readiness,
   status guards, close_renewal -> close_renewal_core rename + new close_renewal wrapper.
2. Lock-down: revoke EXECUTE on the guard trigger functions and proposal_contract_recurring.
3. validate_proposal revisions (variant check only for renewals; message collection fix).
Inspect PROD close_renewal first: the wrapper renames whatever close_renewal exists to
close_renewal_core, so PROD's Phase 1b version must already be installed and stays the core.

## Staged release
1. DB (guards in WARN: private.renewal_workflow_settings.enforce = false). Old app keeps working;
   violations are written to private.workflow_guard_events.
2. Publish the app (Validate / Mark Sent / Record acceptance, official close from Partner tab,
   download no longer promotes to Ready).
3. Watch: `select guard, count(*) from private.workflow_guard_events where not enforced group by 1;`
   Expect ~0 after the new app is live for all users.
4. Enforce: `update private.renewal_workflow_settings set enforce = true, updated_at = now();`

## Rollback
- Instant: `update private.renewal_workflow_settings set enforce = false;` (no data loss).
- Full DB rollback (only if needed): drop triggers trg_a_proposals_status_guard and
  trg_a_renewals_terminal_guard; drop new close_renewal; rename close_renewal_core back to
  close_renewal and re-grant EXECUTE to authenticated. New columns/events stay (additive).

## Existing records
No proposal is downgraded or auto-validated. Existing Ready renewal proposals must record
acceptance before closing as Renewed once enforced. EVEREL Group / SELECT FRUITS (PROD) are
left for Codex reconciliation.
