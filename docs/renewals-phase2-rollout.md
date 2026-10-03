# Renewals Phase 2 — rollout, activation and rollback (TEST done; PROD by Codex)

## Exact deployment order (PROD, executed by Codex against qownzparzsaeoyccgwuj only)

0. Pre-checks (read-only): confirm Phase 1a/1b migrations `20261002233245` and `20261003113639`
   are present; confirm `public.close_renewal` is the Phase 1b version (it becomes the core);
   confirm none of the files below are already recorded in schema_migrations.
1. Apply these migrations byte-for-byte, in order (files in `supabase/migrations`):
   1. `20261003115534_d9b3910e-…sql` — Phase 2 core: private settings (enforce=false) + guard log,
      proposal columns, proposal_status_events, validate_proposal / mark_proposal_sent /
      record_proposal_acceptance, renewal_close_readiness, status guards,
      close_renewal → close_renewal_core rename + new close_renewal wrapper.
   2. `20261003115601_2ce4fb43-…sql` — revoke EXECUTE on guard trigger functions and
      proposal_contract_recurring.
   3. `20261003120041_d7bd5bbd-…sql` — validate_proposal: variant check only for renewals.
   4. `20261003120324_0ddfb0c7-…sql` — validate_proposal: message collection fix.
   5. `20261003120919_f3a07729-…sql` — proposals_status_guard: changing totals on a
      Ready/Sent/Accepted proposal requires revalidation; trigger also fires on total changes.
   6. `20261003121004_5ee1073b-…sql` — close_renewal / renewal_close_readiness: authentication
      check, specific NOT_AUTHORIZED_CLOSE messages, unauthorised close always refused.
   After step 1 the guards are in WARN mode; the current PROD app keeps working.
2. Verify grants: the six callable actions are EXECUTE for authenticated + service_role only
   (no anon/PUBLIC); guard trigger functions have no authenticated/anon EXECUTE.
3. Publish the app build containing: Validate / Mark Sent / Record acceptance, official close
   from Partner > Renewals, downloads no longer change status, revalidation prompt in the
   proposal assistant, wizard keeps its step after Save/Validate.
4. Watch for 1–3 days:
   `select guard, count(*) from private.workflow_guard_events where not enforced group by 1;`
   Expect ~0 once all users run the new app.
5. Enforce: `update private.renewal_workflow_settings set enforce = true, updated_at = now();`
6. Smoke test in PROD with a disposable record, then remove it.

TEST state: all six applied; enforcement ON since 2026-10-03 12:10 UTC.

## Rollback (reverse order)
- Step 5/6 problem: `update private.renewal_workflow_settings set enforce = false, updated_at = now();`
  Instant, no data loss; violations are logged instead of blocked.
- Step 3 problem: republish the previous app build (DB stays in WARN; old app works).
- Step 1 problem (full DB rollback, only if needed): drop triggers trg_a_proposals_status_guard
  and trg_a_renewals_terminal_guard; drop the new close_renewal; rename close_renewal_core back to
  close_renewal and re-grant EXECUTE to authenticated. New columns/events stay (additive).

## Existing records
No proposal is downgraded or auto-validated. Existing Ready renewal proposals must record
acceptance before closing as Renewed once enforced. EVEREL Group / SELECT FRUITS (PROD) are
left for Codex reconciliation.
