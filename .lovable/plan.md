# PartnerOS Notification System v1: Implementation Plan

This plan only. It makes no changes to the database or code. All work targets TEST first; PROD (qownzparzsaeoyccgwuj) gets reviewed SQL afterwards, as with the earlier releases.

## A. Proposed architecture

The proposed flow fits the current stack. It reuses pieces that already work: the `notifications.dedupe_key` unique index, the `renewal_notify` helpers, and the pgmq queue with `process-email-queue`.

```text
Row change (lead/task/renewal/announcement)       Scheduler (1 daily job)
        |                                                  |
   AFTER trigger ---------------------------+---- notifications_daily_run()
                                            v
                  public.notify(event, recipient, entity, priority, dedupe_key, link, email?)
                    - drops null recipient / self-notification (actor = auth.uid())
                    - INSERT ... ON CONFLICT (dedupe_key) DO NOTHING
                    - if inserted AND channel=email -> enqueue_email('transactional_emails', ...)
                                            v
               notifications row (in-app bell)   +   pgmq -> process-email-queue -> email_send_log
```

- There is one SQL entry point, `public.notify(...)`, which is SECURITY DEFINER and not executable by clients. Every trigger and job calls it, so recipient rules, self-notification checks, dedupe and the email decision live in one place.
- The notification row and the email enqueue happen in the same transaction as the business change. A rollback cancels both, so there are no orphan emails.
- The frontend no longer creates notifications at all. The inserts in `AddLeadTaskDialog` and `AddDealTaskDialog` are removed.

## B. Events in v1

| Event | Priority | Recipient | In-app | Email | Trigger | Scheduled |
|---|---|---|---|---|---|---|
| Lead assigned | Action | New assignee | Y | Y | `incoming_leads` trigger (existing, consolidated) | N |
| Lead reassigned | Action / Info | New owner (Action); previous owner (Info, "ownership removed") | Y | New: Y; previous: N | same | N |
| Task assigned | Action | Assignee (not self) | Y | Y | AFTER INSERT on `lead_tasks`, `deal_tasks`, `manual_tasks` | N |
| Task reassigned | Action | New assignee; previous assignee in-app only | Y | New: Y | AFTER UPDATE of assignee on those 3 tables | N |
| Task overdue | Important | Assignee | Y | One email only, the first day overdue | Daily job | Y |
| Renewal owner reassigned | Action | New owner | Y | Y (decision J3) | existing `reassign_renewal_owner` | N |
| Renewal milestone approaching | Important | Owner, or HQ admins if unowned | Y | N | `renewal_automation_run()` (existing) | Y |
| Renewal critical / overdue | Action | Owner and HQ admins | Y | Y | same | Y |
| License / S&TA expiry approaching | Action | See J4 | Y | Y | Daily job | Y |
| Announcement published | Info | The announcement's audience | Y | N | Trigger when status becomes published | N |
| Critical job / import / integration failure | Action | HQ admins | Y | Y | Job exception handlers and the ingest functions | N |

## C. Database changes (one additive migration)

The existing `notifications` table is almost enough: it already has a type, category, target user, link, read flag, dedupe key and entity ids for client and renewal. The minimum additions are:
- `priority text` (`action_required` / `important` / `informational`)
- `event_type text`, for a stable machine key such as `task.assigned`. The current `category` stays for display.
- `entity_type text` and `entity_id uuid`, for generic linking of tasks, leads and licenses.
- `read_at timestamptz` (keep `is_read`, which the bell uses)
- `email_status text` (`none` / `queued` / `skipped` / `failed`) plus `email_message_id uuid`, to link the row to `email_send_log`.
- An index on `(target_user_id, is_read, created_at desc)`.

New objects:
- `notify()` plus a small `notify_hq_admins()` wrapper, replacing the direct inserts in `notify_lead_assignment`. `renewal_notify` gets a thin wrapper that calls `notify()`, so the existing logic is reused.
- Task triggers on the three task tables.
- An announcement trigger.
- `notifications_daily_run()`, which records each run's outcome in `audit_logs`.

Not needed yet: a preferences table and `deep_link` (keep using `action_url`).

## D. Backend / Edge Functions
- `ingest-lead` and `ingest-sharpspring-opportunity`: on a fatal error, call `notify_hq_admins('integration.failed', ...)`. This means touching `ingest-lead` (decision J8).
- `process-email-queue` is already generic and needs no logic change.
- `auth-email-hook` is untouched.
- Add `send-transactional-email` (the standard scaffold) only if the render-in-Edge path is chosen; see F.

## E. Frontend
- Remove the two manual notification inserts in the task dialogs.
- Bell and Notifications page: show a priority accent, and "Mark read" also sets `read_at`. There is no redesign.
- Deep link gaps:
  - Tasks: `/tasks` doesn't read `?task=`. Add support to highlight or open a task, or link to the parent lead or deal instead.
  - Renewals: `/renewals?renewal=` is used; confirm the page reads it.
  - Licenses: there's no license route. Link to `/clients/:id?tab=licenses`.
  - Announcements: `/announcements?id=`.

## F. Email

Recommendation: keep the single pgmq dispatcher and add a second queue, `transactional_emails`. The platform's standard infrastructure already supports it, and `process-email-queue` drains auth emails first and then transactional emails. A separate system isn't needed, and merging everything into one queue would let business email volume delay password resets.
- Rendering: one React Email template, "PartnerOS notification" (title, one-line explanation, entity name, button, link, footer), sent through the standard `send-transactional-email` function. A database trigger can't render React, so `notify()` enqueues a small request. A pg_net call to the send function on insert is the preferred wake-up; the fallback is a queue the function drains.
- The sender stays `notify.partneros.manwinwin.com`, which already exists. Existing suppression and unsubscribe handling is reused.

## G. Scheduler

- **One job**, `notifications-daily`, running once a day at 07:00 UTC. It calls `notifications_daily_run()`, which runs three isolated steps in sequence, each in its own error-trapping block:
  1. `renewal_automation_run()`
  2. overdue tasks
  3. license / S&TA expiry
- If one step fails, it gets logged, HQ is notified (deduplicated per day), and the other steps still run.
- Idempotent: every notification uses a dedupe key, so a rerun on the same day adds nothing.
- The email queue needs no permanent job: the existing wake-on-enqueue schedules processing and it unschedules itself when empty.
- Running once a day means a maximum delay of about 24 hours for date-based alerts. That's acceptable for day-granularity dates and keeps costs minimal.

## H. Deduplication and anti-spam
- The dedupe key is deterministic: `event:entity_id:recipient[:bucket]`, for example:
  - `task.assigned:<task>:<user>:<assignment-version>`
  - `task.overdue:<task>:<due_date>` (one per due date; changing the due date re-arms it)
  - `license.expiry:<license>:<field>:<end_date>:<60|30|7>`
- `ON CONFLICT DO NOTHING`, and email only when a row was actually inserted. Retries and reruns can't create duplicates.
- No self-notifications: skip when the recipient is the actor (`auth.uid()`).
- No frontend inserts, so notifications can't be created twice by screen and database.
- Overdue: one in-app notification and one email per task per due date. Later reminders go into a future digest, not repeat emails.

## I. Phases

1. **Core** (low risk): columns, `notify()`, and moving lead notifications and `renewal_notify` onto it; no email yet. Test: lead assign/reassign gives the same rows as today, plus a notification to the previous owner. Rollback: the columns are additive and the old function body is preserved in the migration.
2. **Task and announcement triggers, plus frontend cleanup** (medium risk). Test that creating or reassigning from any screen, including `/tasks`, produces exactly one notification, and self-assignment produces none. Rollback: drop the triggers and restore the dialog inserts.
3. **Scheduler**: the daily run with overdue, renewal and expiry steps (medium risk; first run on TEST with a dry-run count). Rollback: `cron.unschedule`.
4. **Email**: transactional queue, template, and enqueue from `notify()` for Action-level events (medium risk). Test with TEST users; check `email_send_log`. Rollback: a flag in `notify()` disables email.
5. **UI consistency and deep links** (low risk).
6. **PROD**: reviewed SQL plus publish, run separately.

## J. Decisions requiring Vítor's approval
1. **Overdue email**: one email on the first overdue day only, or none (in-app only)?
2. **Previous owner on reassignment** (leads and tasks): in-app only, or email too?
3. **Renewal owner reassigned**: email the new owner (Action), or in-app only?
4. **License / S&TA expiry**: the dates are `licenses.license_end_date` and `sat_end_date`, with `license_model` / `deployment_type` for SaaS. Recipient options: (a) the renewal owner via `renewal_canonical_partner` / owner resolution, (b) the client account manager, (c) the partner manager. If there's no owner, HQ admins? Lead times of 60, 30 and 7 days? Should expiries already covered by an active renewal milestone be skipped, to avoid double alerts?
5. **Critical renewal** definition: the existing overdue milestone from `renewal_automation_run`, or a fixed window such as 14 days?
6. **Announcement audience**: map `audience_scope` / `target_audience` / `target_country` / `target_partnership_level` / `partner_id` exactly as the Announcements page filters. Is there any cap for very large audiences?
7. **Failure recipients**: all active HQ admins, or a designated ops user?
8. **Touching `ingest-lead`**: allowed, for failure notifications only?
9. **Daily time**: 07:00 UTC (08:00 Lisbon), OK?
10. **Partner users as email recipients**: are partner_sales and partner_admin users allowed to receive these emails?
