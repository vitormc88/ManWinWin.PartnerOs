# PartnerOS R1 — FIN-01 / FIN-02 Gate 4D: atomic Business Draft persistence
**12 Oct 2026 | LAB PROTOTYPE PASS | NOT A LIVE TEST RELEASE / NOT DEPLOYABLE**

## Why this work was prioritized
The original Pricing → saved Business proposal → award → Client/License/Contract → renewals → documents → Thai Union E2E roadmap was reaffirmed by the owner. Customer Explorer stays in independent OPS-01 issues #40 and #42; it is NOT a functional step of adjudication.

In read-only source review, CreateProposalDialog.tsx currently performs Deal/Client Draft writes across separate Supabase requests: insert/update proposals header; DELETE old proposal_items on Draft edit; INSERT proposal_items; followed by a best-effort Deal expected_value update. A frontend catch handler cannot roll back already committed earlier HTTP/database requests.

Actual Lovable Cloud TEST catalog read-only confirmed:
- public.proposals and public.proposal_items have deferred proposal-terms triggers; private.proposal_terms_check(uuid) explicitly returns for Draft or absent fingerprint (it protects Ready/Sent/Accepted/Won, not atomic Draft replacement).
- Public proposal/save named functions found include save_renewal_proposal (which already saves the renewal proposal in one RPC); no equivalent Deal/Client save routine was found in the scoped function search.
- Real TEST RLS includes source ownership policies for proposals and proposal_items via can_manage_proposal_source, plus probationary restrictions. These have not been installed in the standalone candidate's fixture; the lab models narrower comparable ownership for two fictional users.

This is a **credible transactional design weakness based on current source**, not a confirmed customer-data loss incident.

## Prototype scope: draft-only, security invoker, single SQL call
[Candidate SQL](../../tests/sql/fin02/gate4d_business_draft_atomic_candidate.sql) is in tests/ and **not supabase/migrations**. It is NOT connected to the frontend and does not change deployed behavior.

The lab implements public.save_business_draft_atomic_candidate(proposal_id, expected_updated_at, payload, items):
- Requires a caller identity, authorized source Deal or existing Client and canonical matching partner, through SECURITY INVOKER and a source-management helper; never grants execution to anon/service_role.
- Payload is restricted to a small set of Business Draft fields (deliberately not all TEST proposal columns). Only single-option KeepIT or UseIT mode is accepted. Comparison-mode Draft is NOT supported in this prototype; original product support cannot be removed in deployment.
- Checks each gross, discount and net arithmetic line, unique sort order and reconciliation of entire Year1/Year2 recurring/discount totals; Year1-only Web discount uses gross Web price in next-cycle total.
- Inserts/updates header and inserts/replaces all proposal_items within the SAME database function transaction. Any late item constraint/trigger error undoes the header update and previous-line deletion.
- Acquires row lock SELECT FOR UPDATE on existing proposal and uses expected_updated_at to reject stale edits; successful mutation sets updated_at using clock_timestamp.
- Caller supplies a stable UUID for create; a duplicated **create retry currently FAILS CLOSED with DRAFT_VERSION_CONFLICT** without duplicate rows. True transparent idempotent retry (lost-response recovery) is NOT yet implemented or approved.
- Refuses mutation of non-Draft statuses/source-family and does not change Won/financial history. Renewal-source proposals use their existing separate atomic save RPC.

The lab includes a source-required synthetic PostgreSQL 17 schema, two fictional owners, source-based RLS and a TEST-ONLY trigger that raises error after header UPDATE/old lines DELETE to verify full rollback. The function is deliberately **not production-ready** until complete actual TEST columns/RLS/trigger/Fingerprint validation and all historic UI payload fields have been assessed.

## Executed proof: GitHub Actions
- [Gate4D independent PostgreSQL Actions #38249689057](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38249689057): **SUCCESS**. Synthetic PostgreSQL 17.11, no real TEST/PROD endpoint, data or creds.
- [Candidate](../../tests/sql/fin02/gate4d_business_draft_atomic_candidate.sql), [source/role fixture](../../tests/sql/fin02/gate4d_business_draft_synthetic_test_schema.sql), [negative assertions](../../tests/sql/fin02/gate4d_business_draft_atomic_assertions.sql), [two independent session race](../../tests/sql/fin02/gate4d_business_draft_two_writer_race.sh).
- Valid create persists four line items (€1,608 initial; €570 next-cycle recurring when 3% Web discount expires), and later update persists continuing 3% Web discount (€558 next cycle) with exact item flags.
- A test-only BEFORE INSERT failure on the second line, after UPDATE header and DELETE prior items, yields exception and preserves byte-equivalent JSON of prior proposal header and all items.
- Bad recurring header; net/gross arithmetic drift; forged Won status; unresolved compare option rejected without creating rows. Existing Ready proposal protected.
- Two fictional users, different Deal ownership: unrelated partner cannot create another user's Draft; matching Client source succeeds; anon/service_role denied execute.
- Duplicate stable-ID create retry rejects cleanly (not yet transparent success); stale updated_at rejects. A separate real TWO-SESSION PostgreSQL race has one successful editor and the other DRAFT_VERSION_CONFLICT, preserving exactly four coherent final lines.
- Parent R1 financial regression, source RLS, FIN02 Gate3 / SEC35–38, Explorer OPS and other checks remain green: [12/12 Actions at SHA 8ea18090b7db693de056f0a8da9033dd4ea22279](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs?query=branch%3Afix%2Ffin02-server-renewal-contract-policy-20261011).

## Real TEST installation blockers / decisions — NO GO today
1. **Full DB fit and source validation:** reproduce original TEST public.proposals / proposal_items schema, RLS including probationary partner protections, all source-control triggers, check constraints, status/Ready fingerprints, audit, source identities, grants and correct auth.uid() from real signed sessions on private TEST-compatible database. This lab uses a synthetic required-column schema and a synthetic can_manage_proposal_source helper; it is not an authenticated API E2E or a TEST DB restoration (#39).
2. **Full UI payload surface:** CreateProposalDialog carries considerably more fields than this narrow prototype (version, language, payment and implementation terms, plan changes, historical quote states). Must whitelist and validate them without silent data loss; support comparison proposal Draft without authorizing unsnapshotted comparison adjudication. Preserve Professional and renewal-source flows.
3. **Discount authorization:** Check Business discount limits and approval roles **server side**, not just client validation. Current lab validates financial arithmetic and source ownership, but does NOT enforce all real commercial maximum discounts, pricing-rule eligibility or gross-base KeepIT S&TA rule.
4. **Lost-response idempotency:** Define a request UUID / replay ledger and same-request/same-payload contract, including distinct source-ID/version conflicts, client-side offline/retry handling and consistent status return. Current stable create ID only prevents duplicates and raises conflict.
5. **Concurrent CREATE and revisions:** Extend beyond two-UPDATE race to truly simultaneous create same ID, cross-source collision, malicious role, version overwrite and full UI row fingerprint; make optimistic lock token robust to timestamp triggers.
6. **Atomic Deal expected_value:** Current UI performs this separately and ignores errors. Decide whether tied to same save transaction or derives from saved priced proposal with repair/reconciliation. Avoid accidentally treating draft as Won/revenue.
7. **Unbroken immutability:** No deletes of Ready/Accepted/Won historical items; official document snapshot references remain stable. Source line IDs are newly generated on Draft replacement; prove no document/contract references affected. A new official FIN03 document version must never be overwritten.
8. **Approval & migration boundaries:** no SQL migration or frontend RPC switch until a reviewed TEST-specific compatibility preflight, negative rollbacks, independent backup/recovery (#39), release gate, explicit owner authorization. No direct anonymous RPC, dynamic SECURITY DEFINER bypass or uncontrolled direct table writes.
9. **Original R1 workstreams remain:** FIN02 expiration, KeepIT/UseIT frozen award option, FIN03 immutable DOCX/PDF, Commercial Memory MEM01, UX01, OPS01 #40/#42, QA01 Thai Union through 2028 without manual SQL corrections.

## Verdict
**Gate4D candidate and synthetic negative/concurrency testing: PASS.**
**Actual TEST full source/API compatibility, UI integration and functional completeness: OPEN/NO GO.**
Draft PR #34 unmerged. No TEST/PROD modifications, no document or historic Thai Union rewrites, no Lovable/Work credit consumption.
