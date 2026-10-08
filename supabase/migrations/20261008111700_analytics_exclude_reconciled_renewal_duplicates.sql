DO $view$
DECLARE definition text;
BEGIN
 definition := pg_get_viewdef('public.v_analytics_renewals_summary'::regclass,true);
 IF position('superseded_by_renewal_id' in definition)=0 THEN
   definition := regexp_replace(definition, 'FROM renewals;', 'FROM renewals WHERE superseded_by_renewal_id IS NULL;');
   IF position('superseded_by_renewal_id' in definition)=0 THEN RAISE EXCEPTION 'Unexpected renewal summary definition'; END IF;
   EXECUTE 'CREATE OR REPLACE VIEW public.v_analytics_renewals_summary WITH (security_invoker=true) AS ' || definition;
 END IF;
END $view$;