## Goal

Move from ad-hoc per-user permissions to a clean **Role Template + User Override** model, with a Settings page for HQ Admins to manage role defaults, and consistent enforcement across sidebar, routes, and actions.

---

## 1. Database changes (single migration)

**New tables**

- `role_permission_templates` — one row per `(role app_role, module_key text)` with `access_level` (`no_access | view | edit | admin`). Editable by HQ Admin only. Seeded with the default matrix from section 7 of the request.
- `user_module_permissions` gets a new column `is_override boolean default true` so we can distinguish overrides from inherited rows. Existing rows are backfilled to `is_override = true` only where they differ from the role template (others deleted, so the user falls back to the template).

**New helper functions (SECURITY DEFINER, search_path=public)**

- `get_effective_access(_user_id uuid, _module_key text) returns text` — returns override if present, else max access across the user's role templates, else `no_access`.
- `can_access_module(_user_id, _module_key)`, `can_view`, `can_edit`, `can_admin` — booleans built on `get_effective_access`.
- `apply_role_template_to_user(_user_id, _role)` — inserts inherited rows for a user (used by trigger on `user_roles` insert).
- `sync_role_template_to_users(_role, _overwrite_overrides bool)` — used by "Apply to existing users".

**Triggers**

- On `user_roles` insert → call `apply_role_template_to_user`.
- Validation trigger on `user_roles` ensuring role matches `profiles.is_hq` (HQ roles ↔ `is_hq=true`, partner roles ↔ `is_hq=false` with `partner_id` set). Block contradictions.

**RLS**

- `role_permission_templates`: select for any authenticated; insert/update/delete only `hq_admin`.
- `user_module_permissions`: keep existing; tighten select so a user can read their own + hq_admin reads all.

**Backfill**

- Seed default matrix per role.
- For every existing user, compute effective rows from their current explicit permissions: keep as overrides only where they differ from the new template; everything else inherits.

---

## 2. Frontend — new Settings → Roles & Permissions page

Route: `/settings/roles` (HQ Admin only).
Matrix UI: rows = roles (HQ Admin, HQ Standard, Partner Admin, Partner Sales, Partner Read Only; Partner Manager flagged "Deprecated"), columns = modules; each cell is a `Select` with the 4 levels.

Actions per role:

- **Save Role Template**
- **Reset role to default** (re-applies hard-coded defaults)
- **Apply to existing users** → confirmation dialog with two options: *future only* / *all existing users with this role* + checkbox "Also overwrite users with custom overrides".

Add `partner_read_only` to the `app_role` enum (replacing the loose use of `partner_restricted`, which we keep as a deprecated alias).

---

## 3. User Management improvements

**Create User dialog**

- Selecting a Role auto-derives Type (HQ vs Partner). Type field becomes read-only / hidden.
- Show a live "Role permissions preview" — small table of module → level pulled from `role_permission_templates`.
- Block invalid combinations (Partner role with no linked partner, etc.).

**Edit User → Permissions tab**

- Show inherited level next to override level for each module.
- Top banner: "Using role template" (green) or "Custom permissions override active" (amber, with override count).
- Buttons: **Reset to role template** (clears all overrides) and **Save custom permissions**.
- Cells differing from template are visually marked.

**List view**

- Add filters: role, partner, status, type.

---

## 4. Permission enforcement (consistent helpers)

New `src/lib/permissions.ts` exporting:

```
canAccessModule(perms, moduleKey)
canView(perms, moduleKey)
canEdit(perms, moduleKey)
canAdmin(perms, moduleKey)
```

Backed by a new `useEffectivePermissions()` hook that returns the merged (template + overrides) view for the current user, fetched via a single RPC `get_my_effective_permissions()`.

**Where they're used**

- `AppSidebar` — filter nav items.
- `ProtectedRoute` — already route-gated; switch to effective perms and add a clean "Access denied" screen for direct URL hits.
- Action buttons (Create / Edit / Delete) across Pipeline, Clients, Renewals, Deal Registrations, Commissions, Onboarding, Certifications, Knowledge Base, User Management — wrapped with `canEdit` / `canAdmin`.

Multi-tenant data visibility is already enforced by RLS via `partner_id` + `can_view_partner`; no data-layer changes required, but we audit the listed modules to confirm partner scoping is on.

---

## 5. Backward compatibility

- `partner_manager` and `partner_restricted` enum values remain. UI labels them "Deprecated" and maps them to `partner_admin` / `partner_read_only` defaults.
- Existing per-user permission rows are preserved (kept as overrides where meaningful).
- Existing auth, invite, and reset-password flows untouched.

---

## 6. Out of scope / risks

- Does **not** rewrite every module's create/edit buttons in this pass — we wire the helpers and update high-traffic ones (Pipeline, Clients, Users, Settings). Remaining modules can be migrated incrementally; `ProtectedRoute` still blocks no-access users.
- RLS on data tables already exists per partner; we are not rewriting those policies.
- "Limited User Management for Partner Admin under same partner" → set to **No Access** by default for safety (called out in request as acceptable fallback).

---

## Deliverables summary

- 1 migration: `role_permission_templates` table + enum addition + triggers + helper SQL functions + backfill.
- New page: `src/pages/RolesPermissions.tsx` (mounted under `/settings/roles`).
- New hook: `src/hooks/useRoleTemplates.ts`, `src/hooks/useEffectivePermissions.ts`.
- New lib: `src/lib/permissions.ts`.
- Updated: `UserCreateDialog`, `UserEditDialog`, `UserManagement` page, `AppSidebar`, `ProtectedRoute`, `Settings` index.

I'll wait for your approval before running the migration and writing the code.  
Additional safety requirements before approval:

1. Do not delete existing user_module_permissions rows during the first migration.

Instead, preserve them safely and mark template-matching rows as non-overrides or inactive if needed.

Only remove redundant rows after manual validation.

2. Before running the migration, create a backup/export of:

- profiles

- user_roles

- user_module_permissions

- partners

- role-related tables

3. Add a migration rollback strategy or at least document how to revert the permission model if something breaks.

4. During this first implementation, prioritize safe preservation of existing permissions over database cleanliness.

5. After implementation, provide a test checklist to validate:

- existing users can still log in

- HQ Admin still has full access

- partner users only see their partner data

- sidebar hides modules with No Access

- direct URL access is blocked

- user-level overrides work

- reset to role template works