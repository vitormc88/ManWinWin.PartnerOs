# Operational notifications release

PROD: qownzparzsaeoyccgwuj.

Personal recipients take precedence over partner context. Only read fields can be updated by authenticated clients. Global counts and paginated inbox poll every 30 seconds. The server marks all personal unread rows, independent of page limits.

New lead assignments, task assignments/reassignments and announcements use one database dispatcher. Audience all means active eligible platform users; scoped announcements preserve their audience. Historical rows are not replayed. Three email templates include plain text, one contextual link and unsubscribe. Queue workers revalidate assignment, audience, active user, suppression and kill switch before sending. Provider acceptance is sent, not confirmed delivery.

## Resend rollout
Operational notification emails now use RESEND_API_KEY in PROD through the existing transactional queue. Authentication emails retain their existing provider. No credential is stored in source control. Resend idempotency keys prevent duplicate sends and email_send_log.metadata records provider and provider_message_id. The worker refuses stale recipient addresses and rechecks current eligibility and suppression.

Three synthetic tests (lead.assigned, task.assigned, announcement.published) were accepted by Resend on 2026-10-10 using onboarding@resend.dev, addressed only to the authorized account owner. They created no actual leads, tasks or announcements. Provider acceptance is recorded as sent; inbox receipt/delivery has not been independently verified.

email_enabled remains false after testing. PROD functions_base_url is configured and email_recipient_allowlist restricts rollout to the single authorized test account. Production notification sending requires NOTIFICATION_FROM_EMAIL with a sender verified in Resend; the default onboarding sender is available only for explicitly marked synthetic email_test notifications. Do not enable general delivery until DNS verification, sender configuration and controlled real-event tests pass.

Next: verify a dedicated sender domain under partneros.manwinwin.com in Resend, configure NOTIFICATION_FROM_EMAIL in PROD, configure signed Resend delivery/bounce webhooks, run controlled real-event validation, then widen the recipient allowlist and enable delivery. The existing Lovable suppression webhook does not authenticate Resend events.

Rollback: set email_enabled=false; queued notifications are rechecked before delivery.
