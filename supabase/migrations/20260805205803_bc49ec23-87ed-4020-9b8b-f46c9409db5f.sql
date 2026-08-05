DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='unified_tasks' AND c.relkind='v') THEN
    EXECUTE 'ALTER VIEW public.unified_tasks SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON public.unified_tasks FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.unified_tasks FROM anon';
    EXECUTE 'REVOKE ALL ON public.unified_tasks FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.unified_tasks TO authenticated';
    EXECUTE 'GRANT SELECT ON public.unified_tasks TO service_role';
  END IF;
END $$;