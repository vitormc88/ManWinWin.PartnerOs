# Commercial Memory — RFC 0 (DESIGN ONLY)
**PartnerOS / 11 October 2026 / Owner review required**

> Status: **exploratory architectural proposal, not an implementation mandate**. No schema, application, auth or PROD changes are authorized by this RFC. Linked to R1 master #29, Commercial Memory #30.

## 1. Why now — observed, not imagined
R1 TEST created a fictitious Thai Union journey and proved that target → lead → deal lineage survives, but the *seller's context* fractures:
- Target research/evidence source links and secondary people did not surface fully in Lead/Deal. Selected stakeholder was re-entered.
- Target reply existed in target activities; Lead still displayed "No outreach yet".
- A Lead task did not show in Deal Tasks after conversion; deal notes/scale had to be typed again.
- Discovery and next steps **did** preserve links across Lead→Deal. Do not replace this correct machinery.
- Multiple qualification taxonomies generate redundant work; 100% field completeness is **not** validated customer need.
- Commercial records continue after award through proposal/contract/license/renewal; historical truth must not be rewritten.

These are evidence-backed UX/lineage problems, **not proof of database deletion**. The source rows remained.

## 2. Job to be done
*A seller opening any stage should immediately know who the customer is, what is evidenced vs assumed, what was agreed, who owns the next action, and what changed since the last decision — without re-entering prior facts.*

This is **not** another CRM form, a new standalone Notes module, a chatbot with unlimited read permission or a bulk copy of upstream columns.

## 3. Observed source graph (read-only introspection, TEST)
```
target_accounts.id
  ├─ target_account_evidence/signals/people/activities.target_account_id
  └─ target_accounts.converted_lead_id ↔ incoming_leads.source_target_account_id
         ├─ lead_tasks.lead_id
         ├─ discovery_records.lead_id
         ├─ agreed_next_steps.lead_id
         └─ incoming_leads.converted_to_deal_id → deals.id
                ├─ discovery_records.deal_id (also retains lead_id)
                ├─ agreed_next_steps.deal_id (also retains lead_id)
                ├─ deal_tasks/deal_activities.deal_id
                └─ proposals.deal_id
                       ├─ proposal_items.proposal_id
                       ├─ clients.source_deal_id / source_proposal_id
                       ├─ contracts.source_proposal_id, contract_lines.source_item_id
                       └─ licenses / renewals / lifecycle_events linked through client + proposal
```
Important: the graph above is **not** a statement that all joins are automatically authorized. RLS and ownership must be tested at every expansion. The legacy `deals.partner_id` text vs canonical `clients.partner_uuid` is an explicit resolution risk.

Additional source tables seen in TEST: `discovery_stakeholders`, `renewal_activities`, `lifecycle_events`, `lead_tasks`. Exact FK/role semantics and role isolation are **not certified** by this inventory alone.

## 4. Separate two concepts before designing
### Account Memory — who the organization is
Corporate identity, plants/regions, contacts and public evidence, potentially shared across distinct buying journeys. Needs safe deduplication and legal-entity boundaries.

### Opportunity Memory — the *specific* commercial decision
Problem, impact, alternatives, qualifications, demo needs, price versions, approvals, decision-makers and next actions. Multiple opportunities for the same company must **not** become one merged negotiation.

**Open design question:** is there an authoritative account/organization identity before a client exists? If not, first build a read-model and only later consider stable `account_id` links. Do not pretend that company name is a unique key.

## 5. Candidate architectures (with trade-offs)
| Option | Approach | Pros | Risks | Recommendation |
|---|---|---|---|---|
| A. Federated Commercial 360 read-model | Query existing canonical tables through lineage, show unified timeline/cards | Minimal migration; reversible; avoids copies; fast value | Multiple queries, access complexity, stage/owner-specific stitching | **Best first slice** |
| B. Commercial Case + append-only events | Introduce stable case per journey and durable evidence/decision events | Strong audit/provenance and AI-ready retrieval | Higher migration/permission cost; duplicate-event risk; design work | **Evaluate after A** |
| C. Copy contacts/notes/tasks at every conversion | Hydrate destination tables by INSERT | Quick UI gains initially | Drift, duplicate tasks, ambiguous truth and cross-owner exposures | **Reject as default** |

A future B can coexist with A. A is **not** an excuse to omit provenance/security.

## 6. Truth model (suggestion, not fixed schema)
Represent each displayed memory fact with:
- `canonical_source` = table + immutable row ID; `source_event_id` if available.
- `kind` = public_evidence | internal_hypothesis | customer_confirmed | contractual_decision | observed_activity | system_event.
- `statement`/value + `as_of` (when true), `recorded_at`, `actor` and `visibility_scope`.
- `source_uri` and validation date when externally sourced; `confidence` for hypotheses (not customer facts); `supersedes` when corrected.
- `stage_context` and `owning_entity` (account-level vs opportunity-level).
- Optional summarization; it is always derivative, **never authoritative evidence**.

Do not mark a business assumption *confirmed* just because the user filled a required field, or because an AI produced it.

## 7. Source-of-truth matrix
| Information | Canonical source now | Commercial Memory behavior |
|---|---|---|
| Company/target research | target_accounts + evidence/signals | Joined view with citations and freshness; do not copy to Deal notes |
| Contacts | target_account_people and existing lead/customer contacts | Identity reconciliation and buying-committee **role overlay**; retain origin and permission |
| Discovery | discovery_records + stakeholders | One consolidated problem/impact/success view, with lead/deal links |
| Fit/qualification | lead + discovery | Evidence-qualified conclusions separate from completeness % |
| Outreach and meeting history | target_account_activities + deal_activities (+ future message connectors) | One chronology keyed by source event, not a duplicate activity table |
| Tasks and next steps | lead_tasks, deal_tasks, agreed_next_steps | Unified read query; same task ID, ownership, status, due date |
| Stage changes | pipeline stage + stage event ledger (incomplete in R1) | Render only actual committed transitions with provenance |
| Proposals and approval | proposals + proposal_items + fingerprint and document references | Display approved **snapshot** and historical versions, no current-catalogue repricing |
| Contract/license/renewal | contracts/lines/licenses/renewals/lifecycle_events | Show contract facts from finance; **never recalculate revenue in memory** |

## 8. UX discovery wireframe (functional, not implementation)
Header: Company identity • partner/HQ ownership • stage • next verified action • confidence.
Tabs (not independent memories): **Overview / People / Evidence / Timeline / Opportunity / Documents**.
Top of Deal: "What we know" (verified); "What we suspect" (hypotheses); "What customer confirmed"; "What's blocking decision"; "Next committed action".
Every inherited item links to its canonical source; a correction proposes an editable action at the source and logs when/why, rather than silently editing a copied value.
Person entry: one person identity + overlays for Sponsor / Champion / Economic buyer / Technical gatekeeper, scoped to the **deal**, not globally.
Timeline groups chronology, but activity type, writer, timezone and source remain inspectable; tasks remain action rows rather than duplicated messages.
Progressive disclosure: summary by default, original evidence and change history on demand. Never bury source references.

## 9. Ten scenarios that must pass before architecture approval
1. Target research→Lead→Deal retains URL, evidence date, confidence and company scale without retyping.
2. Reply on Target is visible from Lead; no phantom "No outreach yet".
3. Secondary target contact remains accessible; Deal-specific stakeholder role is assignable without creating a duplicate person.
4. Lead task stays owned/dated/status-preserving and appears in Deal open work (no duplicate tasks).
5. Seller changes partner/owner: unauthorized previous users lose visibility; historical events remain auditable for authorized HQ.
6. Two concurrent deals for same company do not leak decision-makers, opportunity-specific objections or budget into each other.
7. Same named company in two legal entities is never merged automatically.
8. Evidence corrected after proposal approval: current summary updates, approved offer and acceptance evidence remain immutable.
9. Partner user cannot infer HQ-only competitor, margin or other-partner information through timeline counts/search/errors.
10. Account/Deal deletion or merge respects evidence retention, contract/legal hold and lifecycle links.

## 10. Access control / threat model
- Query through caller-scoped RLS or a carefully audited `SECURITY INVOKER` RPC. Do **not** deploy an unconstrained definer-based mega-view.
- Compare roles HQ Admin, HQ Standard, partner admin/seller, probationary/connector and unauthenticated; include reassignment/revocation.
- Test side channels: counts, autocomplete, search, filters, event ID lookups, attachment URLs, AI retrieval and notifications.
- Sensitive commercial details (HQ notes, margins, partner contract conditions) require explicit visibility scope.
- No unapproved sync of private personal data or external contact messages.

## 11. Decision points for product owner (leave open)
- What *must* every partner see versus what is internal-only for HQ?
- When a seller corrects a hypothesis after a proposal is Sent, what remains frozen in that proposal's commercial evidence?
- Should a Contact be an account-level person or a person with multiple account relationships? (Companies can reorganize.)
- Are lead/deal task links display-only or should the task be reparented on conversion?
- Can partners reassign accounts/deals across territories, or must HQ approve every transfer?
- What are the acceptable minimum performance and mobile UX targets?

## 12. Delivery gates (all gated; not implementation now)
**CM-D0** Inventory proven UI and data sources; end-to-end ownership matrix + role review.
**CM-D1** Prototype read-model over existing tables with RLS tests (on paper / no writes initially).
**CM-D2** Product-owner review with 2 real anonymized case journeys, one multi-deal and one partner handoff.
**CM-D3** Decide stable Account/Case identities and immutable events only after showing why read-model is insufficient.
**CM-D4** Build TEST-only incremental rollout behind flag; negative RLS/performance/replay tests.
**CM-D5** Measured seller experience, correct 100% source links/actions; approve eventual PROD separately.

## 13. Out of scope
AI-generated account guesses presented as fact; automatic email capture without privacy design; changing finance calculations; retrospective backfilling without role audit; rebuilding existing qualification modules just to make a new UI.

### Status on 11 Oct 2026
This document is an evidence-based **RFC 0** for discussion. **No Commercial Memory code implemented**. The next meeting should first challenge the account vs case distinction, the permissions model and the source-of-truth matrix.
