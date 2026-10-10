-- A private, per-environment credential. No service-role key is copied or exposed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='notification_dispatch_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'notification_dispatch_token','Internal PartnerOS notification dispatch only');
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.notification_dispatch_authorized(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT length(coalesce(_token,''))=64 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name='notification_dispatch_token' AND decrypted_secret=_token
  );
$$;
REVOKE ALL ON FUNCTION public.notification_dispatch_authorized(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notification_dispatch_authorized(text) TO service_role;

CREATE OR REPLACE FUNCTION private.notification_recipient_eligible(_recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_recipient AND coalesce(p.is_active,true)
    AND public.can_view_module(p.id,'notifications')
    AND (public.is_hq_user(p.id) OR (NOT coalesce(p.is_hq,false) AND EXISTS (
      SELECT 1 FROM public.partners pa WHERE pa.id=p.partner_id AND lower(coalesce(pa.status,'')) NOT IN ('archived','inactive')))));
$$;
REVOKE ALL ON FUNCTION private.notification_recipient_eligible(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.announcement_recipients(_announcement_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id FROM public.profiles p JOIN public.announcements a ON a.id=_announcement_id
  WHERE private.notification_recipient_eligible(p.id) AND public.can_view_module(p.id,'announcements')
    AND a.status='published' AND coalesce(a.is_active,true) AND a.archived_at IS NULL
    AND (public.is_hq_user(p.id) OR a.target_audience='all'
      OR (a.target_audience='partner' AND a.partner_id=p.partner_id)
      OR (a.target_audience='country' AND EXISTS (SELECT 1 FROM public.partners pa WHERE pa.id=p.partner_id AND pa.country=a.target_country))
      OR (a.target_audience='partnership_level' AND EXISTS (SELECT 1 FROM public.partners pa WHERE pa.id=p.partner_id AND pa.partnership_level=a.target_partnership_level)));
$$;
REVOKE ALL ON FUNCTION public.announcement_recipients(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_recipients(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.announcement_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  IF NEW.status IS DISTINCT FROM 'published' OR NOT coalesce(NEW.is_active,true) OR NEW.archived_at IS NOT NULL THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND OLD.status='published' AND coalesce(OLD.is_active,true) AND OLD.archived_at IS NULL THEN RETURN NULL; END IF;
  FOR r IN SELECT user_id FROM public.announcement_recipients(NEW.id) LOOP
    PERFORM public.notify('announcement.published',r.user_id,NEW.title,
      coalesce(nullif(NEW.summary,''),'A new announcement is available in PartnerOS.'),'informational','announcement',NEW.id,
      '/announcements?id='||NEW.id,'announcement:'||NEW.id||':'||r.user_id,true,'info','announcement');
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.announcement_notify() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.notification_email_dispatch(_notification_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.notifications; _base text; _token text; _request bigint; _email text;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE id=_notification_id;
  IF NOT FOUND OR NOT private.notification_recipient_eligible(n.target_user_id::uuid) THEN RETURN 'failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.notification_settings WHERE id AND email_enabled AND n.event_type=ANY(email_event_allowlist)) THEN RETURN 'disabled'; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id=n.target_user_id::uuid;
  IF _email IS NULL THEN RETURN 'failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.suppressed_emails WHERE lower(email)=_email) THEN
    PERFORM public.notify_hq_admins('email.suppressed','A user is not receiving operational emails',
      'An operational email was blocked by an unsubscribe, bounce or complaint. Check user email delivery settings.',
      '/users','email.suppressed:'||n.target_user_id,false,'important');
    RETURN 'suppressed';
  END IF;
  SELECT functions_base_url INTO _base FROM private.notification_settings WHERE id;
  SELECT decrypted_secret INTO _token FROM vault.decrypted_secrets WHERE name='notification_dispatch_token';
  IF _base IS NULL OR _token IS NULL THEN RETURN 'failed'; END IF;
  _request:=net.http_post(url:=_base||'/send-transactional-email',
    headers:=jsonb_build_object('Content-Type','application/json','X-PartnerOS-Dispatch-Token',_token),
    body:=jsonb_build_object('notificationId',n.id),timeout_milliseconds:=10000);
  UPDATE public.notifications SET email_message_id=id,email_request_id=_request,email_error=NULL WHERE id=n.id;
  RETURN 'dispatching';
EXCEPTION WHEN OTHERS THEN RETURN 'failed';
END $$;
REVOKE ALL ON FUNCTION private.notification_email_dispatch(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify(_event text,_recipient uuid,_title text,_message text,_priority text,_entity_type text,_entity_id uuid,_link text,_dedupe_key text,
  _email boolean DEFAULT false,_type text DEFAULT 'info',_category text DEFAULT NULL,_partner_id text DEFAULT NULL,_client_id uuid DEFAULT NULL,_renewal_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _email_on boolean; _status text;
BEGIN
  IF _recipient IS NULL OR NOT private.notification_recipient_eligible(_recipient) THEN RETURN false; END IF;
  IF _recipient=auth.uid() AND _event NOT IN ('lead.assigned','task.assigned','task.reassigned','announcement.published') THEN RETURN false; END IF;
  SELECT email_enabled AND _event=ANY(email_event_allowlist) INTO _email_on FROM private.notification_settings WHERE id;
  INSERT INTO public.notifications(title,message,type,category,target_user_id,partner_id,client_id,renewal_id,action_url,dedupe_key,priority,event_type,entity_type,entity_id,email_status)
    VALUES(_title,_message,coalesce(_type,'info'),coalesce(_category,_event),_recipient::text,_partner_id,_client_id,_renewal_id,_link,_dedupe_key,_priority,_event,_entity_type,_entity_id,
      CASE WHEN NOT coalesce(_email,false) THEN 'none' ELSE 'disabled' END)
    ON CONFLICT DO NOTHING RETURNING id INTO _id;
  IF _id IS NOT NULL AND coalesce(_email,false) AND coalesce(_email_on,false) THEN
    _status:=private.notification_email_dispatch(_id);
    UPDATE public.notifications SET email_status=_status WHERE id=_id;
  END IF;
  RETURN _id IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify(text,uuid,text,text,text,text,uuid,text,text,boolean,text,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify(text,uuid,text,text,text,text,uuid,text,text,boolean,text,text,text,uuid,uuid) TO service_role;

