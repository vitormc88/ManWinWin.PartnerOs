-- Notification System v1 — Phase 1 (core). Additive; rollback bodies documented at end.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_message_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_priority_chk') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_priority_chk
      CHECK (priority IS NULL OR priority IN ('action_required','important','informational'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_email_status_chk') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_email_status_chk
      CHECK (email_status IS NULL OR email_status IN ('none','disabled','queued','suppressed','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_target_unread_idx
  ON public.notifications (target_user_id, is_read, created_at DESC);

-- Private kill switch (email OFF)
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  email_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.notification_settings (id, email_enabled) VALUES (true, false)
  ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON private.notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.notification_settings TO service_role;

-- Central entry point
CREATE OR REPLACE FUNCTION public.notify(
  _event text, _recipient uuid, _title text, _message text, _priority text,
  _entity_type text, _entity_id uuid, _link text, _dedupe_key text,
  _email boolean DEFAULT false, _type text DEFAULT 'info', _category text DEFAULT NULL,
  _partner_id text DEFAULT NULL, _client_id uuid DEFAULT NULL, _renewal_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _email_on boolean;
BEGIN
  IF _recipient IS NULL THEN RETURN false; END IF;
  IF _recipient = auth.uid() THEN RETURN false; END IF;              -- no self-notification
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _recipient AND p.is_active = false) THEN
    RETURN false;                                                     -- inactive user
  END IF;

  SELECT email_enabled INTO _email_on FROM private.notification_settings WHERE id;

  INSERT INTO public.notifications (title, message, type, category, target_user_id, partner_id,
         client_id, renewal_id, action_url, dedupe_key, priority, event_type, entity_type,
         entity_id, email_status)
  VALUES (_title, _message, coalesce(_type,'info'), coalesce(_category, _event), _recipient::text,
          _partner_id, _client_id, _renewal_id, _link, _dedupe_key, _priority, _event,
          _entity_type, _entity_id,
          CASE WHEN NOT coalesce(_email,false) THEN 'none'
               WHEN NOT coalesce(_email_on,false) THEN 'disabled'
               ELSE 'disabled' END)       -- Phase 4 replaces the last branch with dispatch
  ON CONFLICT DO NOTHING
  RETURNING id INTO _id;

  RETURN _id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_hq_admins(
  _event text, _title text, _message text, _link text, _dedupe_base text,
  _email boolean DEFAULT true, _priority text DEFAULT 'action_required'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c int := 0; a record;
BEGIN
  FOR a IN SELECT DISTINCT p.id FROM public.profiles p
             JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'hq_admin'
            WHERE coalesce(p.is_active,true)
  LOOP
    IF public.notify(_event, a.id, _title, _message, _priority, 'system', NULL, _link,
                     _dedupe_base || ':' || a.id::text, _email, 'danger', 'system') THEN
      _c := _c + 1;
    END IF;
  END LOOP;
  RETURN _c;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify(text,uuid,text,text,text,text,uuid,text,text,boolean,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_hq_admins(text,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify(text,uuid,text,text,text,text,uuid,text,text,boolean,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_hq_admins(text,text,text,text,text,boolean,text) TO service_role;

-- Lead assignment consolidated (BEFORE trigger unchanged; assigned_at behaviour unchanged)
CREATE OR REPLACE FUNCTION public.notify_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company text; _country text; _stamp text;
BEGIN
  IF tg_op = 'UPDATE' AND new.assigned_user_id IS NOT DISTINCT FROM old.assigned_user_id THEN
    RETURN new;
  END IF;

  _company := coalesce(new.company_name, 'Unnamed lead');
  _country := coalesce(' (' || new.country || ')', '');
  _stamp := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text;

  -- previous owner: informational, in-app only
  IF tg_op = 'UPDATE' AND old.assigned_user_id IS NOT NULL THEN
    PERFORM public.notify('lead.unassigned', old.assigned_user_id::uuid,
      'Lead reassigned', 'You are no longer the owner of lead: ' || _company || _country,
      'informational', 'lead', new.id, '/incoming-leads/' || new.id::text,
      'lead.unassigned:' || new.id::text || ':' || old.assigned_user_id::text || ':' || _stamp,
      false, 'info', 'lead_unassigned');
  END IF;

  IF new.assigned_user_id IS NULL THEN RETURN new; END IF;

  new.assigned_at := now();

  PERFORM public.notify('lead.assigned', new.assigned_user_id::uuid,
    'New incoming lead assigned', 'You have a new lead to qualify: ' || _company || _country,
    'action_required', 'lead', new.id, '/incoming-leads/' || new.id::text,
    'lead.assigned:' || new.id::text || ':' || new.assigned_user_id::text || ':' || _stamp,
    true, 'lead', 'lead_assigned');

  RETURN new;
END;
$$;

-- Renewal helper consolidated: same signature, return, link, dedupe key
CREATE OR REPLACE FUNCTION public.renewal_notify(
  _renewal_id uuid, _client_id uuid, _partner_id text, _event text,
  _recipient uuid, _title text, _message text, _type text DEFAULT 'info'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _action boolean;
BEGIN
  IF _recipient IS NULL THEN RETURN false; END IF;
  _action := _event ~* '(overdue|critical|reassign|owner)';
  RETURN public.notify(
    'renewal.' || _event, _recipient, _title, _message,
    CASE WHEN _action THEN 'action_required' ELSE 'important' END,
    'renewal', _renewal_id, '/renewals?renewal=' || _renewal_id::text,
    'renewal:' || _renewal_id::text || ':' || _event || ':' || _recipient::text,
    _action, _type, 'renewal', _partner_id, _client_id, _renewal_id);
END;
$$;

/* ROLLBACK (Phase 1):
   - Restore notify_lead_assignment() body from migration 20260521093239 (direct insert).
   - Restore renewal_notify() body from migration 20260811131250 (direct insert, same key).
   - DROP FUNCTION public.notify_hq_admins(...), public.notify(...); DROP TABLE private.notification_settings.
   - New notifications columns are nullable and may remain. */