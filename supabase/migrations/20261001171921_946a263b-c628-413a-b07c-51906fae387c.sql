ALTER TABLE private.notification_settings ADD COLUMN IF NOT EXISTS functions_base_url text;

CREATE OR REPLACE FUNCTION private.notification_email_dispatch(_notification_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n record; _email text; _name text; _base text; _key text;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE id = _notification_id;
  IF NOT FOUND THEN RETURN 'failed'; END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = n.target_user_id::uuid;
  IF _email IS NULL THEN RETURN 'failed'; END IF;

  IF EXISTS (SELECT 1 FROM public.suppressed_emails s WHERE lower(s.email) = _email) THEN
    SELECT coalesce(nullif(p.full_name,''), _email) INTO _name FROM public.profiles p WHERE p.id = n.target_user_id::uuid;
    PERFORM public.notify_hq_admins('email.suppressed',
      coalesce(_name,_email) || ' is not receiving operational emails',
      'Email notifications to this user are suppressed (unsubscribe, bounce or complaint). In-app notifications still work.',
      '/user-management', 'email.suppressed:' || n.target_user_id, false, 'important');
    RETURN 'suppressed';
  END IF;

  SELECT functions_base_url INTO _base FROM private.notification_settings WHERE id;
  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';
  IF _base IS NULL OR _key IS NULL THEN RETURN 'failed'; END IF;

  PERFORM net.http_post(
    url := _base || '/send-transactional-email',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || _key),
    body := jsonb_build_object(
      'templateName','partneros-notification',
      'recipientEmail', _email,
      'idempotencyKey', coalesce(n.dedupe_key, n.id::text),
      'templateData', jsonb_build_object('title', n.title, 'message', n.message,
                                         'link', n.action_url, 'priority', n.priority)));
  RETURN 'queued';
EXCEPTION WHEN OTHERS THEN
  RETURN 'failed';
END;
$$;
REVOKE ALL ON FUNCTION private.notification_email_dispatch(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify(_event text, _recipient uuid, _title text, _message text, _priority text, _entity_type text, _entity_id uuid, _link text, _dedupe_key text, _email boolean DEFAULT false, _type text DEFAULT 'info'::text, _category text DEFAULT NULL::text, _partner_id text DEFAULT NULL::text, _client_id uuid DEFAULT NULL::uuid, _renewal_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _email_on boolean; _status text;
BEGIN
  IF _recipient IS NULL THEN RETURN false; END IF;
  IF _recipient = auth.uid() THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _recipient AND p.is_active = false) THEN
    RETURN false;
  END IF;

  SELECT email_enabled INTO _email_on FROM private.notification_settings WHERE id;

  INSERT INTO public.notifications (title, message, type, category, target_user_id, partner_id,
         client_id, renewal_id, action_url, dedupe_key, priority, event_type, entity_type,
         entity_id, email_status)
  VALUES (_title, _message, coalesce(_type,'info'), coalesce(_category, _event), _recipient::text,
          _partner_id, _client_id, _renewal_id, _link, _dedupe_key, _priority, _event,
          _entity_type, _entity_id,
          CASE WHEN NOT coalesce(_email,false) THEN 'none' ELSE 'disabled' END)
  ON CONFLICT DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL AND coalesce(_email,false) AND coalesce(_email_on,false) THEN
    BEGIN
      _status := private.notification_email_dispatch(_id);
    EXCEPTION WHEN OTHERS THEN _status := 'failed';
    END;
    UPDATE public.notifications SET email_status = _status WHERE id = _id;
  END IF;

  RETURN _id IS NOT NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify(text,uuid,text,text,text,text,uuid,text,text,boolean,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;