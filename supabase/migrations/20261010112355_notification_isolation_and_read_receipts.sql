-- No historical notifications are dispatched by this migration. Sending remains OFF.
ALTER TABLE private.notification_settings ADD COLUMN IF NOT EXISTS email_event_allowlist text[] NOT NULL
  DEFAULT ARRAY['lead.assigned','task.assigned','task.reassigned','announcement.published'];
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_request_id bigint;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_queued_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_error text;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_email_status_chk;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_email_status_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_email_status_check CHECK
  (email_status IS NULL OR email_status IN ('none','disabled','dispatching','queued','sent','delivered','suppressed','failed','bounced'));
CREATE UNIQUE INDEX IF NOT EXISTS notifications_email_message_unique ON public.notifications(email_message_id) WHERE email_message_id IS NOT NULL;

-- A personal recipient takes precedence over partner/role context.
DROP POLICY IF EXISTS "Users can view permitted notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can view permitted notifications" ON public.notifications FOR SELECT TO authenticated USING (
  public.can_view_module(auth.uid(), 'notifications')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND coalesce(p.is_active,true))
  AND CASE WHEN target_user_id IS NOT NULL THEN target_user_id=auth.uid()::text ELSE
    (partner_id IS NULL OR (NOT public.is_hq_user(auth.uid()) AND partner_id=public.get_user_partner_id(auth.uid())::text))
    AND (target_role IS NULL OR public.has_role(auth.uid(),target_role::public.app_role))
    AND (partner_id IS NOT NULL OR target_role IS NOT NULL OR public.is_hq_user(auth.uid())) END
);
CREATE POLICY "Users can mark own notifications read" ON public.notifications FOR UPDATE TO authenticated USING (
  public.can_view_module(auth.uid(), 'notifications')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND coalesce(p.is_active,true))
  AND target_user_id=auth.uid()::text
) WITH CHECK (target_user_id=auth.uid()::text);
REVOKE ALL ON public.notifications FROM anon;
REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.notifications FROM authenticated;
GRANT UPDATE(is_read,read_at) ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_notification_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE changed integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.notifications SET is_read=true,read_at=clock_timestamp()
    WHERE NOT is_read AND target_user_id=auth.uid()::text AND (_notification_id IS NULL OR id=_notification_id);
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.notification_read_timestamp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.is_read AND NOT OLD.is_read THEN NEW.read_at=clock_timestamp();
  ELSIF NOT NEW.is_read THEN NEW.read_at=NULL; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notification_read_timestamp() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notification_read_timestamp ON public.notifications;
CREATE TRIGGER notification_read_timestamp BEFORE UPDATE OF is_read ON public.notifications FOR EACH ROW EXECUTE FUNCTION private.notification_read_timestamp();

