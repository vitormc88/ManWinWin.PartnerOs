-- Notification System v1 — Phase 2. Rollback notes at end.

-- ---------- Tasks ----------
CREATE OR REPLACE FUNCTION public.task_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old uuid; _new uuid; _link text; _ctx text; _title text; _done boolean; _stamp text; _src text;
BEGIN
  _src := TG_TABLE_NAME;
  IF _src = 'manual_tasks' THEN
    _new := NEW.owner_user_id;
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_user_id END;
    _link := coalesce(nullif(NEW.related_route, ''), '/tasks');
    _ctx := coalesce(' (' || nullif(NEW.related_company, '') || ')', '');
    _done := lower(coalesce(NEW.status, '')) IN ('done','completed','cancelled')
             OR lower(coalesce(NEW.task_status, '')) IN ('done','completed','cancelled');
  ELSIF _src = 'lead_tasks' THEN
    _new := NEW.assigned_user_id;
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_user_id END;
    _link := '/incoming-leads/' || NEW.lead_id::text;
    _ctx := coalesce(' (' || (SELECT company_name FROM public.incoming_leads WHERE id = NEW.lead_id) || ')', '');
    _done := lower(coalesce(NEW.status, '')) IN ('done','completed','cancelled');
  ELSE -- deal_tasks
    _new := NEW.assigned_user_id;
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_user_id END;
    _link := '/deals/' || NEW.deal_id::text;
    _ctx := coalesce(' (' || (SELECT company_name FROM public.deals WHERE id = NEW.deal_id) || ')', '');
    _done := coalesce(NEW.is_completed, false) OR lower(coalesce(NEW.status, '')) IN ('done','completed','cancelled');
  END IF;

  -- explicit change detection (in addition to the trigger WHEN clause)
  IF TG_OP = 'UPDATE' AND _old IS NOT DISTINCT FROM _new THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' AND _new IS NULL THEN RETURN NULL; END IF;
  IF _done THEN RETURN NULL; END IF;

  _title := coalesce(NEW.title, 'Task');
  _stamp := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text;

  IF TG_OP = 'UPDATE' AND _old IS NOT NULL THEN
    PERFORM public.notify('task.unassigned', _old, 'Task reassigned',
      'You are no longer assigned to: "' || _title || '"' || _ctx,
      'informational', _src, NEW.id, _link,
      'task.unassigned:' || _src || ':' || NEW.id || ':' || _old || ':' || _stamp,
      false, 'task', 'task_unassigned');
  END IF;

  IF _new IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.notify('task.assigned', _new, 'New Task Assigned',
        'You have been assigned a new task: "' || _title || '"' || _ctx,
        'action_required', _src, NEW.id, _link,
        'task.assigned:' || _src || ':' || NEW.id || ':' || _new,
        true, 'task', 'task_assigned');
    ELSE
      PERFORM public.notify('task.reassigned', _new, 'Task Assigned to You',
        'A task has been reassigned to you: "' || _title || '"' || _ctx,
        'action_required', _src, NEW.id, _link,
        'task.reassigned:' || _src || ':' || NEW.id || ':' || _new || ':' || _stamp,
        true, 'task', 'task_assigned');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.task_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_notify_ins ON public.lead_tasks;
DROP TRIGGER IF EXISTS trg_task_notify_upd ON public.lead_tasks;
CREATE TRIGGER trg_task_notify_ins AFTER INSERT ON public.lead_tasks
  FOR EACH ROW WHEN (NEW.assigned_user_id IS NOT NULL) EXECUTE FUNCTION public.task_notify();
CREATE TRIGGER trg_task_notify_upd AFTER UPDATE ON public.lead_tasks
  FOR EACH ROW WHEN (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) EXECUTE FUNCTION public.task_notify();

DROP TRIGGER IF EXISTS trg_task_notify_ins ON public.deal_tasks;
DROP TRIGGER IF EXISTS trg_task_notify_upd ON public.deal_tasks;
CREATE TRIGGER trg_task_notify_ins AFTER INSERT ON public.deal_tasks
  FOR EACH ROW WHEN (NEW.assigned_user_id IS NOT NULL) EXECUTE FUNCTION public.task_notify();
CREATE TRIGGER trg_task_notify_upd AFTER UPDATE ON public.deal_tasks
  FOR EACH ROW WHEN (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) EXECUTE FUNCTION public.task_notify();

DROP TRIGGER IF EXISTS trg_task_notify_ins ON public.manual_tasks;
DROP TRIGGER IF EXISTS trg_task_notify_upd ON public.manual_tasks;
CREATE TRIGGER trg_task_notify_ins AFTER INSERT ON public.manual_tasks
  FOR EACH ROW WHEN (NEW.owner_user_id IS NOT NULL) EXECUTE FUNCTION public.task_notify();
CREATE TRIGGER trg_task_notify_upd AFTER UPDATE ON public.manual_tasks
  FOR EACH ROW WHEN (OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id) EXECUTE FUNCTION public.task_notify();

-- ---------- Announcements ----------
-- Mirrors announcements_select RLS for a published announcement, per user.
CREATE OR REPLACE FUNCTION public.announcement_recipients(_announcement_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
    FROM public.profiles p
    JOIN public.announcements a ON a.id = _announcement_id
   WHERE coalesce(p.is_active, true)
     AND a.status = 'published'
     AND (
       public.is_hq_user(p.id)
       OR a.target_audience = 'all'
       OR (a.target_audience = 'partner' AND a.partner_id IS NOT NULL
           AND a.partner_id = public.get_user_partner_id(p.id))
       OR (a.target_audience = 'country' AND a.target_country IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.partners pa
                        WHERE pa.id = public.get_user_partner_id(p.id)
                          AND pa.country = a.target_country))
       OR (a.target_audience = 'partnership_level' AND a.target_partnership_level IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.partners pa
                        WHERE pa.id = public.get_user_partner_id(p.id)
                          AND pa.partnership_level = a.target_partnership_level))
     );
$$;
REVOKE EXECUTE ON FUNCTION public.announcement_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_recipients(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.announcement_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.status IS DISTINCT FROM 'published' OR NOT coalesce(NEW.is_active, true) OR NEW.archived_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND coalesce(OLD.is_active, true) AND OLD.archived_at IS NULL THEN
    RETURN NULL; -- already published: edits do not re-notify
  END IF;
  FOR r IN SELECT user_id FROM public.announcement_recipients(NEW.id) LOOP
    PERFORM public.notify('announcement.published', r.user_id, 'New announcement',
      coalesce(NEW.title, 'Announcement'), 'informational', 'announcement', NEW.id,
      '/announcements?id=' || NEW.id::text,
      'announcement:' || NEW.id::text || ':' || r.user_id::text,
      false, 'info', 'announcement');
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.announcement_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_announcement_notify ON public.announcements;
CREATE TRIGGER trg_announcement_notify AFTER INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcement_notify();

-- ---------- Integration failures ----------
CREATE OR REPLACE FUNCTION public.report_integration_failure(_source text, _error_class text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _src text := left(regexp_replace(coalesce(_source,'unknown'), '[^a-zA-Z0-9_.-]', '', 'g'), 60);
        _cls text := left(regexp_replace(coalesce(_error_class,'unknown'), '[^a-zA-Z0-9_.-]', '', 'g'), 60);
BEGIN
  RETURN public.notify_hq_admins('integration.failed',
    'Integration failure: ' || _src,
    'The ' || _src || ' integration failed (' || _cls || '). Check the function logs.',
    NULL,
    'integration.failed:' || _src || ':' || _cls || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24'),
    true, 'action_required');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_integration_failure(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_integration_failure(text, text) TO service_role;

/* ROLLBACK (Phase 2):
   DROP TRIGGER trg_task_notify_ins/trg_task_notify_upd ON lead_tasks, deal_tasks, manual_tasks;
   DROP TRIGGER trg_announcement_notify ON announcements;
   DROP FUNCTION task_notify(), announcement_notify(), announcement_recipients(uuid), report_integration_failure(text,text);
   Restore frontend inserts in AddLeadTaskDialog/AddDealTaskDialog from git if needed. */