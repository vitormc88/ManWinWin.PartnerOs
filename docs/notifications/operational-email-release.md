# Operational notifications release

PROD: qownzparzsaeoyccgwuj.

Personal recipients take precedence over partner context. Only read fields can be updated by authenticated clients. Global counts and paginated inbox poll every 30 seconds. The server marks all personal unread rows, independent of page limits.

New lead assignments, task assignments/reassignments and announcements use one database dispatcher. Audience all means active eligible platform users; scoped announcements preserve their audience. Historical rows are not replayed. Three email templates include plain text, one contextual link and unsubscribe. Queue workers revalidate assignment, audience, active user, suppression and kill switch before sending. Provider acceptance is sent, not confirmed delivery.

## Activation blocker
The authenticated health request returned ready=false: LOVABLE_API_KEY is missing in PROD. Keep email_enabled=false and functions_base_url=NULL until a valid provider credential and registered sender domain are confirmed. No historical send should be performed.

After configuration, call the internal health endpoint through pg_net without exposing the dispatch token. When ready=true, set functions_base_url to https://qownzparzsaeoyccgwuj.supabase.co/functions/v1 and email_enabled=true. Validate one new assignment and one announcement to a controlled audience; verify queue, provider acceptance and receipt. Never send a test announcement to All.

Rollback: set email_enabled=false; queued notifications are rechecked before delivery.
