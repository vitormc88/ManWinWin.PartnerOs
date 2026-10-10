CREATE OR REPLACE FUNCTION private.notification_email_log_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.notifications SET
    email_status=CASE WHEN NEW.status='sent' THEN CASE WHEN email_status IN ('delivered','suppressed','bounced') THEN email_status ELSE 'sent' END
      WHEN NEW.status='delivered' THEN 'delivered'
      WHEN NEW.status='bounced' THEN 'bounced'
      WHEN NEW.status IN ('suppressed','complained') THEN 'suppressed'
      WHEN NEW.status='dlq' THEN 'failed' ELSE email_status END,
    email_error=CASE WHEN NEW.status IN ('sent','delivered') THEN NULL ELSE left(NEW.error_message,500) END
    WHERE email_message_id::text=NEW.message_id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.notification_email_log_sync() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notification_email_log_sync ON public.email_send_log;
CREATE TRIGGER notification_email_log_sync AFTER INSERT ON public.email_send_log FOR EACH ROW EXECUTE FUNCTION private.notification_email_log_sync();

CREATE OR REPLACE FUNCTION public.notification_email_health() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_hq_user(auth.uid()) OR NOT coalesce(public.can_view_module(auth.uid(),'notifications'),false) THEN RAISE EXCEPTION 'HQ access required'; END IF;
  RETURN (SELECT jsonb_build_object('enabled',(SELECT email_enabled FROM private.notification_settings WHERE id),
    'queued',count(*) FILTER(WHERE email_status IN ('dispatching','queued')),'sent',count(*) FILTER(WHERE email_status IN ('sent','delivered')),
    'failed',count(*) FILTER(WHERE email_status IN ('failed','bounced')),'suppressed',count(*) FILTER(WHERE email_status='suppressed')) FROM public.notifications);
END $$;
REVOKE ALL ON FUNCTION public.notification_email_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notification_email_health() TO authenticated;

CREATE OR REPLACE FUNCTION private.notification_email_queue_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _base text; _token text;
BEGIN
  UPDATE public.notifications n SET email_status='failed',email_error=CASE WHEN r.timed_out THEN 'Email dispatcher timed out' ELSE 'Email dispatcher failed (HTTP '||coalesce(r.status_code::text,'unavailable')||')' END
    FROM net._http_response r WHERE n.email_request_id=r.id AND n.email_status='dispatching' AND (coalesce(r.status_code,0)>=400 OR r.timed_out OR r.error_msg IS NOT NULL);
  UPDATE public.notifications SET email_status='failed',email_error='Email dispatcher did not confirm queueing within 5 minutes'
    WHERE email_status='dispatching' AND created_at<now()-interval '5 minutes';
  SELECT functions_base_url INTO _base FROM private.notification_settings WHERE id AND email_enabled;
  IF _base IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO _token FROM vault.decrypted_secrets WHERE name='notification_dispatch_token';
  IF _token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=_base||'/send-transactional-email',headers:=jsonb_build_object('Content-Type','application/json','X-PartnerOS-Dispatch-Token',_token),
    body:=jsonb_build_object('action','process_queue'),timeout_milliseconds:=10000);
END $$;
REVOKE ALL ON FUNCTION private.notification_email_queue_tick() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('notification-email-queue','* * * * *','select private.notification_email_queue_tick()');
