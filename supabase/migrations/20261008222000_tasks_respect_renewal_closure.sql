-- Auto renewal tasks are signals of active work, not independently completable rows.
DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_viewdef('public.unified_tasks'::regclass,true);
 IF position('r.status <> ALL' in definition)=0 THEN RAISE EXCEPTION 'Unexpected unified_tasks renewal predicate'; END IF;
 definition := replace(definition,
  '(r.status <> ALL (ARRAY[''Renewed''::text, ''Lost''::text, ''Cancelled''::text]))',
  '(r.closed_at IS NULL AND r.outcome IS NULL AND r.superseded_by_renewal_id IS NULL AND r.status <> ALL (ARRAY[''Won''::text, ''Completed''::text, ''Renewed''::text, ''Lost''::text, ''Cancelled''::text]))');
 definition := replace(definition, '''/renewals''::text AS text', '(''/renewals?renewal=''::text || r.id::text) AS text');
 EXECUTE 'CREATE OR REPLACE VIEW public.unified_tasks WITH (security_invoker=true) AS ' || definition;
END $$;
