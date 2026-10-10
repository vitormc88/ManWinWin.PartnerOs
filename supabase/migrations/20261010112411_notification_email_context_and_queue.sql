-- Only the trusted receiver resolves recipients/content. Requests cannot choose an email address.
CREATE OR REPLACE FUNCTION public.notification_email_context(_notification_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.notifications; _email text; _name text; _due date; _summary text; _company text; _subject text;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE id=_notification_id;
  IF NOT FOUND OR n.email_status NOT IN ('dispatching','queued','failed') OR NOT private.notification_recipient_eligible(n.target_user_id::uuid) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.notification_settings WHERE id AND email_enabled AND n.event_type=ANY(email_event_allowlist)) THEN RETURN NULL; END IF;
  SELECT lower(u.email),p.full_name INTO _email,_name FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=n.target_user_id::uuid;
  IF n.entity_type='lead' THEN
    SELECT company_name INTO _company FROM incoming_leads WHERE id=n.entity_id AND assigned_user_id=n.target_user_id::uuid;
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSIF n.entity_type='lead_tasks' THEN
    SELECT due_date,title INTO _due,_subject FROM lead_tasks WHERE id=n.entity_id AND assigned_user_id=n.target_user_id::uuid AND lower(coalesce(status,'')) NOT IN ('done','completed','cancelled');
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSIF n.entity_type='deal_tasks' THEN
    SELECT due_date,title INTO _due,_subject FROM deal_tasks WHERE id=n.entity_id AND assigned_user_id=n.target_user_id::uuid AND NOT coalesce(is_completed,false) AND lower(coalesce(status,'')) NOT IN ('done','completed','cancelled');
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSIF n.entity_type='manual_tasks' THEN
    SELECT due_date::date,title INTO _due,_subject FROM manual_tasks WHERE id=n.entity_id AND owner_user_id=n.target_user_id::uuid AND lower(coalesce(status,'')) NOT IN ('done','completed','cancelled') AND lower(coalesce(task_status,'')) NOT IN ('done','completed','cancelled');
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSIF n.entity_type='announcement' THEN
    SELECT summary INTO _summary FROM announcements WHERE id=n.entity_id AND status='published' AND is_active AND archived_at IS NULL
      AND EXISTS (SELECT 1 FROM public.announcement_recipients(n.entity_id) r WHERE r.user_id=n.target_user_id::uuid);
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  RETURN jsonb_build_object('notificationId',n.id,'recipientEmail',_email,'recipientName',_name,'eventType',n.event_type,
    'title',coalesce(_company,_subject,n.title),'message',n.message,'link',n.action_url,'priority',n.priority,'dueDate',_due,'company',_company,'summary',_summary);
END $$;
REVOKE ALL ON FUNCTION public.notification_email_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notification_email_context(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_notification_email(_notification_id uuid,_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.notifications; _email text;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE id=_notification_id FOR UPDATE;
  IF NOT FOUND OR n.email_queued_at IS NOT NULL THEN RETURN false; END IF;
  IF public.notification_email_context(n.id) IS NULL THEN RETURN false; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id=n.target_user_id::uuid;
  IF lower(_payload->>'to') IS DISTINCT FROM _email OR _payload->>'message_id' IS DISTINCT FROM n.id::text THEN RAISE EXCEPTION 'Invalid notification payload'; END IF;
  PERFORM public.enqueue_email('transactional_emails',_payload||jsonb_build_object('notification_id',n.id,'message_id',n.id,'idempotency_key','notification:'||n.id));
  UPDATE public.notifications SET email_status='queued',email_message_id=id,email_queued_at=now(),email_error=NULL WHERE id=n.id;
  INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status) VALUES(n.id,_payload->>'label',_email,'pending');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_notification_email(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_email(uuid,jsonb) TO service_role;

