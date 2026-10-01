# Notification System v1 — PROD rollout plan (NOT EXECUTED)

Target: qownzparzsaeoyccgwuj only. Execute only after explicit approval.

## 0. Pre-flight (read-only, on PROD)
- Confirm resolved project ref = qownzparzsaeoyccgwuj.
- Confirm none of the v1 objects exist yet: public.notify, notify_hq_admins, task_notify,
  announcement_notify, report_integration_failure, license_expiry_kind, license_expiry_recipient,
  notify_overdue_tasks, notify_license_expiry, notifications_daily_run, private.notification_settings,
  private.notification_email_dispatch; cron job `notifications-daily` absent.
- Record baselines: count(notifications), count(email_send_log), suppressed_emails, active HQ admins.
- Confirm the notify.partneros.manwinwin.com sender domain is verified for PROD.

## 1. Database (Phases 1–4 + blocker fixes), email OFF
- Apply the TEST migrations in order (Phase 1 → Phase 4, then the deep-link fix).
- Seed private.notification_settings with email_enabled = false, functions_base_url = NULL.
- Verify: functions exist, EXECUTE revoked from PUBLIC/anon/authenticated, triggers attached.

## 2. Edge functions + frontend
- Deploy email functions (process-email-queue, send-transactional-email, preview-transactional-email,
  handle-email-unsubscribe, handle-email-suppression) and ingest-lead / ingest-sharpspring-opportunity hooks.
- Publish frontend (removed manual task-notification inserts, /unsubscribe, renewal + task deep links).

## 3. In-app soak (email still OFF)
- Run notifications_daily_run(true) (dry run) and review counts.
- Create the cron: `0 7 * * *` → `select public.notifications_daily_run(false)`.
- Observe 1–2 scheduled runs: no errors, no duplicates, all email-flagged rows `disabled`.

## 4. Enable email
- Set functions_base_url to the PROD functions URL, then email_enabled = true.
- Verify one real action notification → exactly one email; suppressed path → `suppressed` + one HQ notice.

## Rollback (any step)
- Instant: `email_enabled = false` (stops all notification email, no release).
- Scheduler: `cron.unschedule('notifications-daily')`.
- Full: drop v1 triggers, then v1 functions (per-phase rollback notes); frontend revert to previous publish.
