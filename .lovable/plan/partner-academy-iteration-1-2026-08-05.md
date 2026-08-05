# Partner Academy — Iteration 1

## 1. Inspection summary

**Routes**
- `/onboarding` → `src/pages/Onboarding.tsx` (only route in the module). `/training` exists but renders `ComingSoon`.
- Sidebar group "Partner Ops" → item `Onboarding` (`src/components/layout/AppSidebar.tsx`).
- Access control: module key `onboarding` in `src/lib/module-access.ts` (label "Onboarding", route map + nav map). HQ Admin bypasses; everyone else resolves through `get_my_effective_permissions` / `role_permission_templates`.

**Frontend**
- `Onboarding.tsx` is a single self-contained page: KPI row, stage pipeline strip, expandable partner cards with a category checklist. It reads **mock data only** (`mockOnboarding`, `onboardingStages` in `src/data/partner-engagement-data.ts`). No hooks, no Supabase queries, no mutations, no admin UI.

**Database**
- `partner_onboarding` (partner lifecycle stage, progress_pct, manager) and `onboarding_checklist` (category, task_name, is_completed) exist but are **not used by the page**.
- Legacy learning tables exist and are unused by any page: `training_courses`, `training_modules`, `training_progress` (user_id, course_id, module_id, progress_pct, is_completed, score).
- No phases/missions/resources concepts, no per-user academy progress, no publication/versioning columns.

**Reusable**: route, module key, permission plumbing, page shell/design language (KPI cards, progress bars, expandable cards, semantic tokens), `useModuleAccess`, React Query patterns from other hooks.

## 2. Implementation plan

**Reuse**
- Keep the `/onboarding` route and `onboarding` module key (no new nav area, no permission migration risk).
- Keep the existing visual system: same card/KPI/progress components and animation classes from the current page.

**Rename (labels only)**
- Sidebar item, `MODULE_LABELS.onboarding`, and page headings → "Partner Academy".

**Extend**
- New Academy pages under the same module: landing (`/onboarding`), module page (`/onboarding/modules/:slug`), mission page (`/onboarding/modules/:slug/missions/:missionSlug`), and an admin panel (`/onboarding/admin`) visible only to Academy admins (HQ admin / `onboarding=admin`).
- New hooks `src/hooks/useAcademy.ts` (content queries) and progress mutations; content comes from the DB, never hardcoded in components.
- Reusable callout components (Partner Insight, Best Practice, Warning Sign, Real Example, PartnerOS Action) rendered from Markdown/structured content.
- Mission completion only via an explicit "Complete Mission" button.
- The existing partner-lifecycle pipeline view is preserved as a secondary tab on the landing page so no current functionality is lost.

**Database migration (one migration, additive only)**
- `academy_phases` (title, description, sort_order, status)
- `academy_modules` (phase_id, title, slug, short/full description, estimated_duration_minutes, sort_order, status, version, certification settings columns reserved)
- `academy_missions` (module_id, mission_number, title, slug, short_description, estimated_duration_minutes, content_markdown, content_json, sort_order, is_required, status, version)
- `academy_resources` (module_id nullable, mission_id nullable, title, resource_type, content/file_ref, is_downloadable, sort_order, status)
- `academy_module_progress` (user_id, module_id, status enum: not_started/in_progress/ready_for_certification/certification_failed/certified, progress_pct)
- `academy_mission_progress` (user_id, mission_id, completed_at)
- GRANTs + RLS on every table: authenticated users read **published** content only; admins (`has_role(auth.uid(),'hq_admin')` or `can_admin_module(auth.uid(),'onboarding')`) full write; progress rows strictly scoped to `auth.uid()`.
- Seed placeholder rows: Phase "Sales Fundamentals", "Module 5 — Qualification" (90 min) plus the 11 ordered items (intro, 6 missions, exercise placeholder, summary, checklist, locked certification placeholder). Placeholder text only.

**Files modified**
- `src/App.tsx` (nested academy routes), `src/components/layout/AppSidebar.tsx`, `src/lib/module-access.ts` (label + child routes), `src/pages/Onboarding.tsx` (becomes Academy landing, lifecycle pipeline kept as a tab).
- New: `src/hooks/useAcademy.ts`, `src/pages/academy/*`, `src/components/academy/*`, `src/lib/academy.ts` (+ tests).

**Protection of existing functionality**
- Additive migration only; no existing table, policy, function or env config touched.
- No changes to auth, RLS on other modules, Supabase client/env, or unrelated pages.
- Existing mock lifecycle view stays intact; tests + typecheck + build run before delivery.

## 3. Out of scope (iteration 1)
Exercise flow, question bank, certification scoring/retakes, gamification, video, AI.
