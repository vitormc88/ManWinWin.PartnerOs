# PartnerOS R1 — OPS-01 / FIN-02 Gate 4C: resilient asynchronous Explorer RFC
**12 Oct 2026 | SOURCE-ANCHORED LAB PASS, 11/11 CI GREEN | NOT DEPLOYABLE YET**

## Keep the ORIGINAL R1 roadmap visible
This task belongs to OPS-01 Reliability and supports FIN-02 Gate 4B + QA-01 E2E; it does not supersede the original project. The user-supplied roadmap has one F0 diagnosis plus seven delivery workstreams:

| Front | Previously completed | Still outstanding |
|---|---|---|
| F0 — Diagnóstico | Discrepancies localized, original Thai Union records inspected | Retain exact source/historical reconciliation |
| FIN-01 — Pricing Business | Per-line discount persistence corrected in code, PR #28 | Review, integration, TEST deployment and actual tests |
| FIN-02 — Contrato e renovação | Per-line protection, wizard prices guarded, original PR #31; later #34 financial migrations / rollback candidates | Real backend checks, temporary discounts, KeepIT/UseIT comparison, release approval and E2E on actual TEST |
| FIN-03 — Documentos | Persisted data compared with DOCX/PDF, PR #32 | Immutable snapshots, official versioning, archive |
| MEM-01 — Commercial Memory | Source map and RFC 0 | Critique, access/UX decisions, architecture approval, implementation |
| OPS-01 — Fiabilidade | Original audit and now async Explorer candidate under isolated CI | Scheduling, monitoring, alerting, recovery, load/lock tests, safe TEST rollout |
| UX-01 — Simplificação | Friction points identified | Experience redesign and validation |
| QA-01 — E2E | Thai Union journey through 2028 with manual interventions | Unassisted complete replay with negatives and real authenticated integrations |

## Technical source and scope
The user provided the actual Lovable Cloud TEST PostgreSQL 17.6 custom archive, and permitted source inspection. We reviewed and extracted the COMPLETE original private.refresh_customer_explorer() function and original sync trigger function into CI fixtures using fictional schema rows. The archive itself (2,446 entries, includes Auth and table data) has NOT been put into GitHub. The complete actual TEST archive has NOT been restored to a PostgreSQL/Supabase clone, so this is a **source-anchored functional lab**, not the full Gate4B release gate.

Real TEST behavior: client/partner after-statement trigger may silently disable Explorer on advisory lock contention (SQLSTATE 55P03), while an awarded Client commits. Original source full refresh does a transactional delete/rebuild; duplicate normalized numeric client codes 44 vs 00044 raise 23505. Those failure modes were reproduced against actual original functions and fictional rows. No present outage was observed in live TEST.

## Candidate architectural contract — hybrid transactional generation queue
**SQL:** [candidate](../../tests/sql/fin02/gate4c_explorer_async_candidate.sql) | [assertions](../../tests/sql/fin02/gate4c_explorer_async_assertions.sql) | [race runner](../../tests/sql/fin02/gate4c_explorer_async_lab.sh).

1. Client/Partner AFTER-statement triggers increment ONE singleton dirty-generation row inside their source transaction. The source change and dirty marker commit or roll back together; no business/user payload enters the queue. Many updates coalesce into one full rebuild.
2. HQ and classification override edits retain **synchronous original refresh and fail-atomic semantics**. If projection is invalid, HQ save fails; never claim a saved classification that is not projected.
3. A service-role-only SECURITY DEFINER worker uses its own advisory transaction lock so two workers cannot run the original full refresh simultaneously. It reads requested generation N, invokes complete unchanged source TEST refresh, then acknowledges only N. If N+1 arrives in the meantime, N+1 remains pending. Browser roles anon/authenticated get NO worker EXECUTE or private queue access (queue RLS enabled).
4. Worker refresh errors roll back partial directory rebuild within a nested exception block, record only sanitized SQLSTATE, attempt count and exponential backoff (2, 4, 8, ... capped at 300 seconds). The worker sets existing rollout.sync_failed_at to make the existing Explorer read capability **fail closed**, but retains selected HQ/pilot/all/off mode. Authorized retry clears failure on success.
5. Manual explicit off stays off; successful background recovery never turns on a manually disabled Explorer. Current numeric-only client-code eligibility remains unchanged; FIN02 award-generated alphanumeric codes remain deliberately absent pending separate product decision [#41](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/41).
6. Background processing implies temporary display lag. This is a product contract to approve, not silently accept.

## Actually executed CI
- [Original full source refresh + standalone queue lab #38240496846](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38240496846) **SUCCESS**. Verified source transaction coalescing, rollbacks, source projection accuracy, browser/service privileges, duplicate normalized-code exception, backoff and forced repair, HQ atomic edits, idempotent idle worker, worker mutual exclusion and late-arrival generation not lost.
- Verified a background worker 500-ms lock_timeout does NOT undo successful source Client INSERT. Failclosed rollout marker and retry remain, followed by successful original full refresh on retry. Different from synchronous candidate, where Client could itself be cancelled.
- [Actual FIN02 award/two-renewals + original full TEST Explorer refresh via asynchronous queue #38240496968](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38240496968) **SUCCESS**. The original source-backed award/contract/renewal functions, €1,608 initial sale, annual €570 renewal in 2027 and 2028, concurrent deal award idempotency, late atomic rollback, RLS, synthetic backup/restore and four SEC35–38 reversals all passed while Explorer source refresh was deferred and then drained.
- **11/11 workflows** at tested GitHub SHA ac94767222816a9de7a569b8fc514c9beba476e6 completed successfully. The subsequent documentation-only commit does not change the tested code.

## Release blockers — OPS-01 does NOT close Gate4B
- **No job scheduler has been installed**. Missing or stopped worker would leave pending changes indefinitely. Before TEST: choose a trusted scheduled runner / service context, prove job registration, failure tracking and missed-run detection; no unauthenticated RPC or cron.
- **No proactive HQ incident notification or safe HQ status UX** yet. Define lag threshold, failure count, human owner, escalation, audit, safe manual retry/repair and health checks. Storing sync_failed_at is NOT an alert delivery.
- **Temporary stale-data window** must be accepted or mitigated; show last-synced/pending or gate reads by freshness SLA. Maintain current HQ/pilot/all RLS and confidentiality. A single queue-row marker may serialize busy writers briefly; test source imports, throughput, deadlock and full refresh latency.
- **Real private recovery** #39 remains unfulfilled: full 2,446-object Supabase-compatible TEST clone (roles/Auth/extensions/storage/cron/net etc.), signed API auth/tenant and customer Explorer audit/stamp graph is not reproduced by synthetic CI.
- **Functional visibility decision #41**: whether to include FIN02-awarded alphanumeric clients in Explorer is independent, and existing numeric-only policy remains unchanged.
- Review official HQ settings + override semantics, retry mode off, snapshot read consistency, rollback/hotfix steps, and explicit SEC40 reversible migration before remote installation. Keep source SQL fingerprint fail-closed.
- FIN01, FIN02 temporary discounts and KeepIT/UseIT, FIN03 immutable documents, MEM01 Commercial Memory, UX01 and Thai Union hands-off QA still OPEN per the table above.

## Safety/decision
No changes to TEST or PROD, no deploy/merge or Lovable credits; code in Draft PR [#34](https://github.com/vitormc88/ManWinWin.PartnerOs/pull/34) remains exclusively in tests and workflow files. Issue [#40](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/40) owns the sync fix, [#39](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/39) the real restore, #41 the visibility decision, and [#29](https://github.com/vitormc88/ManWinWin.PartnerOs/issues/29) the R1 master. **Gate4C LAB PASS; Gate4B COMPLETE TEST CLONE/INSTALL NO-GO.**
