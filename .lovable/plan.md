# PartnerOS Notification System v1: Final Execution Plan

Status: waiting for final approval. Nothing is implemented yet. Everything is built and validated on TEST (avxxzmoayxzrykwqzoqn) first. For PROD (qownzparzsaeoyccgwuj) there will be a separate reviewed SQL file and a publish, never inferred from TEST.

Out of scope for v1: preferences UI, digests, push, Academy, Knowledge Base, comments/@mentions, deal stage changes, Won/Lost.

Priority levels:
- **ACTION** (`action_required`): in-app and email
- **IMPORTANT** (`important`): in-app only, except the one overdue-task email
- **INFO** (`informational`): in-app only

---

## 1. Database migration scope

There are 4 small, additive, idempotent migrations, one per phase. Nothing is dropped, and no existing rows are rewritten.

**M1: core (phase 1)**
- New `notifications` columns, all nullable:
  - `priority`, `event_type`, `entity_type`, `entity_id uuid`
  - `read_at timestamptz`
  - `email_status text` (`none` / `queued` / `skipped_no_email` / `failed`), `email_message_id uuid`
- Index on `(target_user_id, is_read, created_at desc)`.
- The existing `notifications_dedupe_key_uq` index is reused.
- New `private.notification_settings`, a single row with `email_enabled boolean default false`. This is the kill switch, and it stays off until phase 4.
- New functions `public.notify()` and `public.notify_hq_admins()`. EXECUTE is revoked from PUBLIC, anon and authenticated; only triggers and definer functions call them.

**M2: triggers (phase 2)**
- Task triggers on `lead_tasks`, `deal_tasks` and `manual_tasks`.
- Announcement trigger.
- Lead trigger consolidation.

**M3: scheduler (phase 3)**
- `public.notifications_daily_run()`, `private.notify_overdue_tasks()`, `private.notify_license_expiry()`.
- The cron schedule is set up with a separate SQL call, not in a migration, because it contains project-specific data.

**M4: email (phase 4)**
- `private.notification_email_dispatch` hook inside `notify()`.
- The email kill switch is turned on in TEST only after validation.

## 2. Existing functions and triggers to be modified

| Object | Change |
|---|---|
| `notify_lead_assignment()` + `trg_notify_lead_assignment` | The body calls `notify()` instead of a direct insert. Adds a previous-owner INFO notification. Keeps `assigned_at := now()` and BEFORE INSERT/UPDATE behaviour unchanged. |
| `renewal_notify(...)` | Same signature and return value. Internally calls `notify()` with the same dedupe key format (`renewal:<id>:<event>:<recipient>`) and the same link, so existing rows and callers behave identically. |
| `renewal_notify_hq(...)` | Unchanged (it loops over `renewal_notify`). |
| `reassign_renewal_owner` / `renewal_automation_run` / `renewals_closure_cleanup` | Unchanged. They pass an event key, and priority and email are derived from that key inside `renewal_notify` (see §8). |
| `ingest-lead` Edge Function | The failure branch only: on a fatal/500 error, call `notify_hq_admins('integration.failed', ...)`. Business logic is untouched. |
| `ingest-sharpspring-opportunity` | Same failure-only hook (TEST only). |
| `process-email-queue`, `auth-email-hook` | Unchanged. |

## 3. New functions and triggers

- `notify(_event, _recipient uuid, _title, _message, _priority, _entity_type, _entity_id, _link, _dedupe_key, _email boolean, _partner_id text default null, _client_id uuid default null, _renewal_id uuid default null) returns boolean`
  - Returns false when the recipient is null, the recipient is inactive, or the recipient equals `auth.uid()` (self-action).
  - Inserts with `ON CONFLICT (dedupe_key) DO NOTHING`, and returns false if nothing was inserted.
  - If a row was inserted, `_email` is true, and the kill switch is on, it calls the email dispatch (§5) and sets `email_status`.
  - Email failures never roll back the business change: they are caught and recorded as `email_status='failed'`.
- `notify_hq_admins(_event, _title, _message, _link, _dedupe_base, _email)` loops over active users with the `hq_admin` role and uses `dedupe_base || ':' || user_id`.
- `trg_task_notify_*`: AFTER INSERT OR UPDATE OF the assignee column, one shared function `task_notify()` with `TG_TABLE_NAME` mapping:
  - `lead_tasks.assigned_user_id`, link `/incoming-leads/<lead_id>`
  - `deal_tasks.assigned_user_id`, link `/deals/<deal_id>`
  - `manual_tasks.owner_user_id`, link `related_route`, falling back to `/tasks`
  - Skips completed/done tasks.
  - **Explicit change detection** (both the trigger `WHEN` clause and a guard in the function body):
    - INSERT: fires only when the new assignee is not null.
    - UPDATE: the trigger is declared `WHEN (OLD.<assignee> IS DISTINCT FROM NEW.<assignee>)`, and the function re-checks it and returns early otherwise.
    - A save that leaves the assignee unchanged, or edits only other fields, gives 0 notifications and 0 emails.
    - Unassigning (new assignee null) gives only the INFO notification to the previous owner.
  - The same rule is applied to `notify_lead_assignment` for `incoming_leads.assigned_user_id`, whose existing `IS NOT DISTINCT FROM` early return is kept.
- `trg_announcement_notify`: AFTER INSERT OR UPDATE on `announcements`. It fires only when the announcement becomes published (`status='published'`, `is_active` true, `archived_at` null) and was not published before.
- `notifications_daily_run()`, `notify_overdue_tasks()`, `notify_license_expiry()` (§6).

## 4. Frontend files that will change

- `src/components/leads/AddLeadTaskDialog.tsx`, `src/components/deals/AddDealTaskDialog.tsx`: remove the manual `notifications.insert`. This removes any chance of the screen and the database creating the same notification twice.
- `src/components/layout/NotificationBell.tsx`, `src/pages/Notifications.tsx`: "Mark read" also sets `read_at`, and ACTION items get a small red accent using existing tokens. No redesign.
- `src/pages/Tasks.tsx`: read `?task=<source>:<id>` to highlight or open that task. This is needed only for manual tasks with no parent route.
- `src/pages/Renewals.tsx`: verify `?renewal=` opens the renewal, and add it if missing.
- `src/pages/Announcements.tsx`: support `?id=` to scroll to or highlight the announcement.

## 5. Email queue and template changes

**Queue support (checked against the current code):** `supabase/functions/process-email-queue/index.ts` already handles `transactional_emails`, so it needs **no modification**:
- line 139: `for (const queue of ['auth_emails', 'transactional_emails'])` reads auth emails first, then app emails.
- lines 132–133: separate TTLs per queue (`transactional_email_ttl_minutes`).
- lines 241 and 283: the same delete / dead-letter handling per queue.
- line 264: passes `unsubscribe_token` through when present.

What does **not** exist yet is the `transactional_emails` pgmq queue itself and its wake trigger. These are created by the standard email setup step (not by hand-written SQL), which the auth emails already use, so it's safe to run again.

**Required operational emails vs unsubscribe: a platform limitation and the proposed alternative**
- The standard app-email sender enforces a footer on every app email. It also checks the per-address suppression list before sending, and one unsubscribe suppresses **all** app emails to that address. It can't be exempted per template.
- If v1 used it as-is, a user clicking "unsubscribe" would silently stop receiving required Action emails. That breaks your requirement.
- Sign-in and password emails use a separate path with no footer and no suppression, so they're never affected either way.

Proposed approach for v1 (**decision K1**):
- **Option A (recommended): keep the standard sender, but make suppression visible and never silent.**
  - The in-app notification is always created. It's the system of record, and required Action events can never be lost.
  - Before sending, `notify()` checks the suppression list. If the recipient is suppressed, it sets `email_status='suppressed'` and creates one deduplicated HQ-admin notice ("<user> is not receiving operational emails").
  - The footer wording frames it as stopping PartnerOS email notifications. There's no preference center.
  - No part of our code offers a marketing-style opt-out.
- **Option B: a dedicated operational sender for PartnerOS**, bypassing the unsubscribe mechanism. Not supported by the current platform email path without a third-party provider (for example a separate subdomain with Resend). That adds a new secret, a provider and DNS work, which is out of proportion for v1.
- **Option C: in-app only for v1**, with email deferred. Simplest, but it drops the approved Action emails.

Unchanged from before:
- One template, `partneros-notification`: title, one-line explanation, entity name, "Open in PartnerOS" button, deep link, no marketing content.
- Dispatch: `notify()` makes a pg_net call to `send-transactional-email`, one recipient per call, idempotency key = notification `dedupe_key`.
- Sender: `notify.partneros.manwinwin.com`.
- A small unsubscribe page is required by the platform, with the operational wording from Option A.

## 6. Scheduler

- **One job**, `notifications-daily`, runs daily at 07:00 UTC and calls `notifications_daily_run()`. That function:
  1. takes an advisory lock, so runs never overlap;
  2. runs three steps, each in its own error-trapping block:
     - `renewal_automation_run()` (existing, unchanged)
     - `notify_overdue_tasks()`
     - `notify_license_expiry()`
  3. writes one summary row to `audit_logs` (counts and errors per step);
  4. if a step fails, calls `notify_hq_admins('job.failed', ...)` with key `job.failed:<step>:<date>`, so there is one alert per step per day.
- **Idempotent:** every item has a deterministic dedupe key, so a manual rerun on the same day produces nothing new.
- **Missed run:** the next day's run catches up. Thresholds use "less than or equal to X days, and not yet sent", so a missed day is never skipped.
- **Email queue:** no permanent job; the existing wake-on-enqueue handles it.

## 7. Deduplication keys

| Event | Key |
|---|---|
| Lead assigned / reassigned (new owner) | `lead.assigned:<lead_id>:<user>:<assigned_at epoch>` |
| Lead ownership removed (previous owner) | `lead.unassigned:<lead_id>:<prev_user>:<assigned_at epoch>` |
| Task assigned (insert) | `task.assigned:<table>:<task_id>:<user>` |
| Task reassigned | `task.reassigned:<table>:<task_id>:<user>:<xact timestamp>` |
| Task ownership removed | `task.unassigned:<table>:<task_id>:<prev_user>:<xact timestamp>` |
| Task overdue | `task.overdue:<table>:<task_id>:<due_date>` |
| Renewal events (existing) | `renewal:<id>:<event>:<recipient>` (unchanged) |
| License / S&TA expiry | `expiry:<license_id>:<license|sta>:<end_date>:<60|30|7>:<recipient>` |
| Announcement | `announcement:<id>:<user>` |
| Integration failure | `integration.failed:<source>:<hash of error class>:<UTC hour>:<user>` |
| Job failure | `job.failed:<step>:<date>:<user>` |

The reassignment key includes a timestamp, so assigning A to B and back to A later still notifies. A retry of the same transaction reuses the same key.

## 8. Recipient resolution

| Event | Priority | Recipient | Email |
|---|---|---|---|
| Lead assigned | ACTION | `new.assigned_user_id` | Yes |
| Lead reassigned | ACTION / INFO | New owner (ACTION); previous owner (INFO, "ownership removed") | New owner only |
| Task assigned | ACTION | The assignee, unless it is the actor | Yes |
| Task reassigned | ACTION / INFO | New assignee (ACTION); previous assignee (INFO) | New assignee only |
| Task overdue | IMPORTANT | Current assignee, for tasks not done and with `due_date < today` | Once, on the first overdue run (key per due date) |
| Renewal owner reassigned | ACTION | New owner (existing `reassign_renewal_owner`) | Yes |
| Renewal milestone approaching | IMPORTANT | Existing logic: owner, or HQ admins if unowned | No |
| Renewal critical / overdue | ACTION | Existing overdue/critical events in `renewal_automation_run` | Yes |
| License / S&TA expiry | ACTION | Renewal owner of the client's active renewal cycle; if none can be resolved, all active HQ admins | Yes |
| Announcement published | INFO | Active users who pass the existing audience rule (below) | No |
| Integration / job failure | ACTION | All active HQ admins; never partner users | Yes |

Renewal event keys are mapped to a priority inside `renewal_notify`: the overdue/critical keys are ACTION with email, and all other milestones are IMPORTANT with no email. Phase 3 first lists the exact event keys and confirms them against the function before mapping.

**Announcement audience rule**, mirroring the current behaviour exactly:
- `target_audience='all'` (with `audience_scope`): all active users in that scope.
- `'partner'`: users whose `profiles.partner_id = announcements.partner_id`.
- `'country'`: users whose partner's normalized country equals `target_country`.
- `'partnership_level'`: users whose partner level equals `target_partnership_level`.

This rule lives in one SQL helper, `announcement_recipients(announcement_id)`, which is checked against the page's existing RLS read policy in testing: every recipient must be able to read the announcement. There is no cap: the insert runs set-based in one statement.

Partner users receive emails only as the actual assignee or owner; they never get HQ or failure alerts.

## 9. Renewal vs license / SaaS / S&TA duplicate handling

Where the dates live: `licenses.license_end_date` (licence and SaaS term, with SaaS identified by `deployment_type` / `license_model`) and `licenses.sat_end_date` (S&TA, when `sat_active`). Licenses that are drafts (`is_draft`), replaced (`replaced_by_license_id` set) or on inactive clients are excluded.

**Validation against the current data model (TEST inspection).**
- `license_model` values are inconsistent: KEEP-IT / KeepIT, USE-IT / UseIT, PROFESSIONAL, Business, SaaS.
- `periodicity` is almost always `Annual`; one row is `Perpetual`.
- Nearly every row has `license_end_date`, including KeepIT and On-Premise.
- **So a date being present does not prove the licence expires.** Expiry notifications must be driven by the commercial type, never by whether a date is filled in.

| Commercial case | Relevant expiry field | Should notify? | Why / status |
|---|---|---|---|
| SaaS (any family, `deployment_type='SaaS'`) | `license_end_date` | Yes | The subscription term ends; the service stops. |
| Business UseIT, On-Premise (rental) | `license_end_date` | Yes, **pending confirmation (K2)** | UseIT is understood to be a term-based right to use. Please confirm. |
| Professional UseIT | — | Not found in data | No rows exist; treat like Business UseIT if confirmed (K2). |
| Business KeepIT, On-Premise | `license_end_date` ignored; `sat_end_date` only | Licence: No. S&TA: Yes if `sat_active` | KeepIT is a perpetual licence; the licence date must not trigger alerts. |
| Business KeepIT, SaaS (11 rows) | `license_end_date` | **Ambiguous (K3)** | The SaaS hosting term would expire, but KeepIT implies perpetual ownership. Which one wins? |
| Professional (1/2/3), SaaS | `license_end_date` | Yes | SaaS term. |
| Professional, no deployment set / `Perpetual` periodicity | none | No | Perpetual; only S&TA if active. |
| Legacy "ManWinWin Business/Professional" with SQL Server/PostgreSQL | `sat_end_date` only | Licence: **ambiguous (K4)**; S&TA: Yes if active | The older model doesn't distinguish KeepIT from UseIT reliably. |
| Active S&TA (`sat_active=true` and `sat_end_date` present) | `sat_end_date` | Yes | Support contract ends. |
| Active S&TA but `sat_end_date` null | — | No; reported in the run summary as a data gap | No date to act on. |
| Expired / inactive S&TA (`sat_active=false`) | — | No | Nothing active to renew. |
| Replaced licence (`replaced_by_license_id` set) or draft | — | No | Superseded or not operational. |
| Active renewal already covering the expiry | — | No | "Covered" rule below; counted as `covered_by_renewal`. |

**Classification:** one SQL helper, `license_expiry_kind(license)`, returns `term`, `perpetual` or `unknown`. It uses normalized `license_model`/`product`/`edition` plus `deployment_type` and `periodicity`. `unknown` never notifies and is listed in the run summary. Expiry notifications stay **disabled** until K2–K4 are confirmed and the helper is checked against all TEST rows.

An expiry is **covered** (no expiry notification is created) when an open renewal exists for the same client where:
- `closed_at is null`, and its status is not one of Won, Lost, Renewed, Completed or Cancelled; **and**
- one of these holds:
  - (a) `renewals.contract_id = licenses.contract_id`, or
  - (b) `abs(renewals.renewal_date - (end_date + 1)) <= 45 days`, the same ±45-day window `renewal_automation_run` already uses to match cycles.

When covered, the renewal milestone stream is the single source of alerts. The skip is counted as `covered_by_renewal` in the run summary for traceability.

When not covered, the license owner is resolved as: the owner of any open renewal for that client (the most recent one), otherwise HQ admins. Thresholds: 60, 30 and 7 days before `end_date`. Each threshold fires once.

## 10. TEST validation checklist

- [ ] Lead assign: 1 row for the new owner. Reassign: 1 ACTION row for the new owner and 1 INFO row for the previous owner. Self-assign: 0 rows.
- [ ] A task created or reassigned from any screen (lead, deal, `/tasks`, manual) gives exactly 1 notification; self-assignment gives 0; the dialogs no longer insert anything.
- [ ] **Unchanged assignee:** updating title, status, due date or priority, or re-saving the same assignee, on a lead and on each of the 3 task tables gives **0 notifications and 0 emails** (notification count and `email_send_log` count checked before and after).
- [ ] Unassigning (assignee set to null) gives only the INFO notification for the previous owner and no email.
- [ ] Suppressed recipient: the in-app row is created, `email_status='suppressed'`, and one HQ notice (Option A).
- [ ] `license_expiry_kind` is checked against every TEST licence row. KeepIT On-Premise, perpetual and replaced licences never produce licence-expiry rows.
- [ ] Rerunning `notifications_daily_run()` twice gives the same count (idempotent).
- [ ] An overdue task gives 1 in-app row and 1 email, and nothing new the next day. Changing the due date re-arms it.
- [ ] Expiry scenarios, all with synthetic rows that are deleted afterwards:
  - licence at 60/30/7 days with no renewal: owner fallback is HQ
  - licence covered by a renewal: 0 rows
  - S&TA only: an S&TA-specific row
- [ ] Renewal reassignment: in-app and email to the new owner, with the same dedupe format as before.
- [ ] Announcement to a partner, a country and all users: the recipient set equals the users able to read it under RLS; no email.
- [ ] A forced `ingest-lead` failure gives one alert per HQ admin; a retry within the hour gives no new alert.
- [ ] Email: `email_send_log` shows one message per ACTION notification; the kill switch off gives 0 emails; a partner user receives only their own assignment emails.
- [ ] Row counts of business tables are unchanged apart from the synthetic data; focused tests, typecheck and build pass.

## 11. Rollback per phase

- **P1:** columns are nullable and harmless. The migration stores the previous bodies of `notify_lead_assignment` and `renewal_notify`; a rollback migration restores them.
- **P2:** drop the 3 task triggers and the announcement trigger. The frontend inserts can be restored from git if needed.
- **P3:** `cron.unschedule('notifications-daily')`. The functions stay in place but inert.
- **P4:** set `email_enabled=false` for an instant stop without a deploy. The unused email functions can stay deployed.
- **P5:** UI-only changes, reverted from git.

## 12. Order of implementation

1. **P1 Core:** M1, `notify()`, lead and renewal consolidation. Email kill switch off.
2. **P2 Event triggers:** tasks and announcements, remove the dialog inserts, failure hooks in the ingest functions.
3. **P3 Scheduler:** daily run with overdue and expiry; first run manually on TEST, then schedule at 07:00 UTC.
4. **P4 Email:** app-email setup, template, dispatch from `notify()`; enable the kill switch on TEST after checks.
5. **P5 UI and deep links:** bell/page accents, `?task=`, `?renewal=`, `?id=`.
6. **PROD package:** reviewed SQL for qownzparzsaeoyccgwuj, run and validated separately; publish frontend only after the database is confirmed.
