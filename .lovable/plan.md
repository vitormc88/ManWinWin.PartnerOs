
# Production Stabilization — Auth, Permissions, Sidebar, Lifecycle

This plan addresses the 9 issues raised, grouped into 4 work blocks. Backend logic + frontend rendering must use the **same** effective-permissions resolver everywhere.

---

## Block 1 — Invitation & Manual-Creation Lifecycle (Issues #1, #2, #8)

**Problem**: Invited users land directly on dashboard without setting a password; manually-created users stay `Pending` after first login; no resend / accepted timestamp tracking.

### Changes

1. **Edge function `admin-create-user`**
   - On `mode = "invite"`: keep `inviteUserByEmail`, but also write `invitation_status='pending'`, `invitation_sent_at=now()`, `invitation_accepted_at=null`.
   - On `mode = "manual"`: set `invitation_status='active'`, `invitation_accepted_at=now()`. Already correct, but verify.
   - On `action = "resend_invite"`: update `invitation_sent_at=now()`.
   - Remove the dead duplicated `return` line at the bottom.

2. **DB migration**
   - Add columns `invitation_sent_at timestamptz`, `invitation_accepted_at timestamptz` to `profiles`.
   - Backfill: existing `active` users get `invitation_accepted_at = created_at`.

3. **`/reset-password` page (invite handling)**
   - Detect `type=invite | signup | recovery` from hash.
   - On invite: **sign the user out immediately** after Supabase auto-establishes the recovery session, keep only the recovery token in memory, then force them through the password form before `navigate("/dashboard")`.
   - On invalid/expired token: show "Invalid or expired link" with Resend hint.
   - On success: call `supabase.auth.updateUser({ password })`, then update profile (`invitation_status='active'`, `invitation_accepted_at=now()`), then navigate.
   - Mobile: ensure form is responsive (already is — verify `min-h-screen` + padding).

4. **Auth context safety net**
   - Add a "first login" check: if `profile.invitation_status === 'pending'` after sign-in, mark it `active` and stamp `invitation_accepted_at` (covers manual-created users on first successful login and any edge cases where the password-set step succeeded but profile update failed).

5. **User Management UI**
   - Show `invitation_sent_at` / `invitation_accepted_at` in user row.
   - Add **Resend Invitation** action for `pending` users (calls existing edge function action).

---

## Block 2 — Permission Inheritance & Override Hygiene (Issues #4, #5)

**Problem**: New users are created with explicit override rows that mirror role template — making `is_override=true` everywhere; "Custom permissions override active" banner shows incorrectly; role preview doesn't match real permissions.

### Changes

1. **Edge function `admin-create-user`**
   - **Remove** the `MODULE_DEFAULTS` constant and the bulk insert into `user_module_permissions`. Role assignment alone is enough — `get_effective_permissions` already resolves from `role_permission_templates`.
   - This eliminates the bogus override rows that cause Onboarding/Certifications/Training to appear for `partner_admin`.

2. **`useMyPermissions` / `useUserPermissions`**
   - Switch `useUserPermissions(userId)` (used in the edit dialog override editor) to call `get_effective_permissions(_user_id)` for display, but only persist rows where the level differs from the template (true overrides). Existing `useMyPermissions` already uses `get_my_effective_permissions` — leave it.

3. **`useSavePermissions`**
   - Before insert, fetch role template for the user's role and only insert rows where `access_level !== template_level`. If equal, skip — keeps `user_module_permissions` clean.

4. **"Custom override active" banner**
   - Drive from `effective_permissions` rows where `is_override = true`. Already correct shape — will work after #1 above removes spurious overrides.

5. **Role Preview component (`UserCreateDialog`)**
   - Currently reads `role_permission_templates` directly — keep as-is; it now matches reality because we no longer write extra overrides.

---

## Block 3 — Sidebar / Route / Mobile Consistency (Issues #3, #7)

**Problem**: Sidebar shows modules a user can't access; mobile sidebar stays open after navigation and is too wide.

### Changes

1. **`AppSidebar`**
   - Already filters via `canSee → hasModuleAccess`. Bug is upstream (Block 2) — once spurious overrides are gone, hidden modules will disappear. Verify after Block 2.
   - Add `useEffect` on `location.pathname` to call `setOpenMobile(false)` so the sheet closes after navigation on mobile.
   - Tighten mobile width: use `Sidebar` mobile sheet default; ensure it doesn't render the full desktop padding.

2. **`ProtectedRoute`** — already enforces module access via `hasModuleAccess`. Keep.

3. **Module list cleanup**
   - Confirm that any module not in the `role_permission_templates` table for `partner_admin` (Onboarding/Certifications/Training) defaults to `no_access` — `get_effective_permissions` already does this via `COALESCE(..., 'no_access')`.

---

## Block 4 — Email Validation UX (Issue #6) + General Audit (Issue #9)

1. **`UserCreateDialog` email field**
   - Add inline validation with regex supporting international TLDs: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u`.
   - Show red border + small error text under the field; disable submit while invalid.

2. **General audit pass**
   - Verify role preview, sidebar, and `/users` permission editor all read from the same RPC (`get_effective_permissions`) post-changes.
   - Verify `ProtectedRoute` redirects unauthorized direct-URL access (already does).
   - Smoke-check `partner_admin` user post-creation: should see only Dashboard, Clients, Pipeline, Renewals, Knowledge Base (per template).

---

## Files to Edit / Create

- `supabase/functions/admin-create-user/index.ts` — remove `MODULE_DEFAULTS`, add `invitation_sent_at`, fix dup return, resend timestamp.
- `supabase/migrations/<new>.sql` — add columns + backfill.
- `src/pages/ResetPassword.tsx` — robust invite handling, force password before login, update accepted timestamp.
- `src/contexts/AuthContext.tsx` — first-login safety net for `pending → active`.
- `src/hooks/useUsers.ts` — `useSavePermissions` skips rows equal to template; expose timestamps.
- `src/components/users/UserCreateDialog.tsx` — email validation UX.
- `src/components/users/UserEditDialog.tsx` — show timestamps + Resend action.
- `src/components/layout/AppSidebar.tsx` — auto-close mobile on navigate.
- `src/pages/UserManagement.tsx` — surface invitation timestamps + Resend.

## Out of Scope
- Reworking the `role_permission_templates` data itself (only its consumption).
- Visual redesign of sidebar or auth pages.
- New modules or new RBAC roles.
