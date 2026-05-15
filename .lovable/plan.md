# User Assignment Normalization Plan

Move ownership across deals, renewals, tasks, activities, proposals and analytics from free-text names to canonical `assigned_user_id` (UUID → profiles). Display names become derived only.

## Phase 1 — Database foundation (single migration)

1. **Schema additions** (idempotent, additive — no destructive drops):
  - `deals.assigned_user_id uuid` (already exists — keep) + index.
  - `renewals.assigned_user_id uuid` + index. Keep legacy `assigned_owner` text temporarily.
  - `deal_activities.performed_by_user_id uuid` + index. Keep legacy `performed_by` text.
  - `deal_tasks.assigned_user_id` already exists. Add `lead_tasks.assigned_user_id` already exists. Verified.
  - `client_notes.created_by_user_id uuid`, `client_audit_logs.changed_by_user_id uuid` (optional, future-ready).
2. **Helper function** `public.resolve_user_by_name(text) returns uuid` — does:
  - lower + unaccent + trim
  - exact match against `profiles.full_name` (normalized) where `is_active`
  - if exactly 1 match → return id; if 0 or >1 → null.
  - Uses `unaccent` extension (enable if missing).
3. **Backfill (one-time, inside migration, no auth.uid)**:
  - `UPDATE deals SET assigned_user_id = resolve_user_by_name(assigned_salesperson) WHERE assigned_user_id IS NULL AND assigned_salesperson IS NOT NULL;`
  - Same pattern for `renewals.assigned_owner → assigned_user_id`.
  - Same for `deal_activities.performed_by → performed_by_user_id`.
  - Ambiguous / unknown → left NULL ("Needs Review").
4. **Ownership status view** `public.v_deal_ownership_status`:
  - Columns: `deal_id`, `assigned_user_id`, `owner_display_name`, `ownership_status` ∈ {assigned, unassigned, orphaned, needs_review}.
  - `orphaned`: legacy text present but user not found OR `assigned_user_id` references a profile with `is_active = false`.
  - `needs_review`: text present, no resolution, deal still Open.
5. **Extend reconciliation view** `v_analytics_deal_reconciliation` to add `assigned_user_id`, `owner_display_name`, `ownership_status`.
6. **Analytics views aggregate by user ID**:
  - Add `v_analytics_sales_by_user` (open/won counts, pipeline, weighted, won revenue) grouped by `deals.assigned_user_id` joined to `profiles`.
  - Update `v_analytics_sales_performance` to prefer `assigned_user_id` join over text salesperson.
7. **RLS for assignment** (assignment business rule enforced at app layer in update path, but add a `check_deal_assignment()` trigger):
  - HQ users may assign any user.
  - Partner users may only assign user IDs whose `profiles.partner_id` = their partner_id, or themselves.
  - Trigger raises exception on violation.

## Phase 2 — Hooks / data layer

- `src/hooks/useAssignableUsers.ts` (new): returns assignable users for current actor (HQ → all active; partner → users in same partner). Used by every owner picker.
- `useDeals` already returns `assigned_user_id` via `select *`. Add `profiles:assigned_user_id(id, full_name, email)` join.
- `useRealRenewals` add `assigned_user_id` field.
- `useDealActivities` add `performed_by_user_id` join.
- New helper `src/lib/owner-display.ts`:
  - `getOwnerDisplay(deal, profilesMap)` → string
  - `getOwnershipStatus(deal, profilesMap)` → 'assigned' | 'unassigned' | 'orphaned' | 'needs_review'

## Phase 3 — Frontend refactor

Switch from text-based filters and rendering to user-id based:

- **Pipeline.tsx**: salesperson filter loads from `useAssignableUsers`; card shows resolved display from join (fallback to text + "orphaned" pill for HQ only).
- **DealDetail.tsx**: replace text input for salesperson with user picker (Select bound to `assigned_user_id`); updates write `assigned_user_id` (and mirror display into `assigned_salesperson` for backward compat until phase 4).
- **CreateLeadDialog / ConvertToOpportunityDialog**: owner Select uses `useAssignableUsers`; default = current user.
- **Analytics.tsx**: salesperson breakdown reads `v_analytics_sales_by_user`; reconciliation table shows `owner_display_name` + `ownership_status` badge.
- **Renewals.tsx**: owner column uses `assigned_user_id`; HQ-only "Orphaned" badge for unresolved legacy text.
- **Dashboard / PartnerHealthList / Notifications**: use joined display name.
- **Activities tab**: show user from `performed_by_user_id` (fallback to `performed_by` text marked legacy).

## Phase 4 — Diagnostics (HQ only)

- Add HQ-only "Ownership health" panel inside Analytics → Reconciliation: counts of unassigned / needs_review / orphaned across deals + renewals, with drill-down list and a "Reassign" action.

## Backward compatibility

- Keep all legacy text columns (`assigned_salesperson`, `assigned_owner`, `performed_by`) intact during phases 1–4.
- Writes mirror text from the chosen user (`profiles.full_name`) so older code paths keep rendering.
- A later cleanup pass (out of scope) drops the text columns once nothing reads them.

## Out of scope (future)

- Commissions normalization (requires separate commissions audit).
- Bulk admin "merge user" tooling.
- Activity scoring / SLA — depend on this foundation but are not built here.

## Technical notes

- All schema/view/function/trigger changes go in one migration.
- Backfill runs in the same migration after columns + helper exist.
- `unaccent` extension enabled in `extensions` schema if not already.
- Uses `pipeline_stage_probability` and `normalize_country` patterns established in prior sprints — same single-source-of-truth discipline.
- No frontend duplication of ownership logic; `owner-display.ts` + `useAssignableUsers` are the only sources.  
  
This looks very solid overall and I approve the direction.
  A few important adjustments before implementation:
  1. Do not classify inactive users as orphaned.
  - "orphaned" should mean assigned_user_id references no existing profile.
  - inactive users should remain historically attributable.
  Suggested ownership states:
  - assigned
  - inactive
  - unassigned
  - orphaned
  - needs_review
  2. Avoid aggressive partial-name matching.
  Do not auto-map generic names like "João" if multiple possible matches exist.
  Prefer exact normalized full_name matching only.
  Ambiguous matches should become needs_review.
  3. The DB trigger enforcement is mandatory and must remain the ultimate source of truth, not only app-layer enforcement.
  Other than that, proceed with the implementation plan as proposed.