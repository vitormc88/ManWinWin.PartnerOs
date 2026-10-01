DO $$
DECLARE _d text;
BEGIN
  _d := pg_get_functiondef('private.notification_email_dispatch(uuid)'::regprocedure);
  IF position('''/user-management''' in _d) = 0 THEN RAISE EXCEPTION 'dispatch: link marker not found'; END IF;
  EXECUTE replace(_d, '''/user-management''', '''/users''');

  _d := pg_get_functiondef('public.task_notify()'::regprocedure);
  IF position('coalesce(nullif(NEW.related_route, ''''), ''/tasks'')' in _d) = 0 THEN RAISE EXCEPTION 'task_notify: marker not found'; END IF;
  EXECUTE replace(_d, 'coalesce(nullif(NEW.related_route, ''''), ''/tasks'')',
                      'coalesce(nullif(NEW.related_route, ''''), ''/tasks?task=manual:'' || NEW.id::text)');

  _d := pg_get_functiondef('public.notify_overdue_tasks(boolean)'::regprocedure);
  IF position('coalesce(nullif(mt.related_route,''''),''/tasks'')' in _d) = 0 THEN RAISE EXCEPTION 'overdue: marker not found'; END IF;
  EXECUTE replace(_d, 'coalesce(nullif(mt.related_route,''''),''/tasks'')',
                      'coalesce(nullif(mt.related_route,''''),''/tasks?task=manual:''||mt.id)');
END $$;