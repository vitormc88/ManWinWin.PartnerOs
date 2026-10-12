-- OPS01 Gate4C: standalone synthetic PostgreSQL 17 checks.
\set ON_ERROR_STOP on
DO $$
BEGIN
 IF has_function_privilege('anon','private.explorer_refresh_run(boolean)','EXECUTE')
 OR has_function_privilege('authenticated','private.explorer_refresh_run(boolean)','EXECUTE')
 OR has_table_privilege('authenticated','private.explorer_refresh_queue','SELECT')
 OR NOT has_function_privilege('service_role','private.explorer_refresh_run(boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'Gate4C queue or worker exposed to browser roles'; END IF;
END $$;

-- HQ changes still refresh immediately; source clients/partners only enqueue.
INSERT INTO public.customer_explorer_hq(id,client_id,client_key,name,country,sector)
 VALUES ('00000000-0000-4000-8000-000000000881','881','881','Fictitious HQ','PT','Services');
INSERT INTO public.partners(id,company_name,primary_contact_name,primary_contact_email)
 VALUES ('00000000-0000-4000-8000-000000000111','Fictional Partner','Nobody Real','contact@example.invalid');
INSERT INTO public.clients(id,client_code,commercial_name,partner_uuid)
 VALUES ('00000000-0000-4000-8000-000000000711','00042','Fictitious Client','00000000-0000-4000-8000-000000000111');
UPDATE public.partners SET company_name='Fictional Partner Updated'
 WHERE id='00000000-0000-4000-8000-000000000111';
UPDATE public.clients SET sector='Industrial'
 WHERE id='00000000-0000-4000-8000-000000000711';
DO $$
BEGIN
 IF (SELECT requested_generation FROM private.explorer_refresh_queue WHERE singleton)<>5
 OR (SELECT applied_generation FROM private.explorer_refresh_queue WHERE singleton)<>0
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>1
 OR EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='42')
 OR (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 THEN RAISE EXCEPTION 'Core write did not enqueue or performed synchronous refresh'; END IF;
END $$;
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;
DO $$
BEGIN
 IF (SELECT requested_generation FROM private.explorer_refresh_queue WHERE singleton)
  <> (SELECT applied_generation FROM private.explorer_refresh_queue WHERE singleton)
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>2
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory
    WHERE client_key='42' AND partner='Fictional Partner Updated' AND sector='Industrial')
 THEN RAISE EXCEPTION 'Worker failed to coalesce/source-refresh original directory'; END IF;
END $$;
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;

-- Uncommitted client writes and queue markers must both roll back.
BEGIN;
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000712','43','Rolled Back');
DO $$
BEGIN
 IF (SELECT requested_generation FROM private.explorer_refresh_queue WHERE singleton)<>6
 THEN RAISE EXCEPTION 'Uncommitted source event not queued'; END IF;
END $$;
ROLLBACK;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.clients WHERE client_code='43')
 OR (SELECT requested_generation FROM private.explorer_refresh_queue WHERE singleton)<>5
 THEN RAISE EXCEPTION 'Atomic client/queue rollback failed'; END IF;
END $$;

-- A source client with conflicting normalized code commits and queues an event.
-- Worker catches actual TEST directory unique key SQLSTATE 23505; it preserves
-- previous directory, retains rollout mode, sets fail-closed sync_failed_at.
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000713','44','Fictional 44');
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000714','00044','Fictional Alias');
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'23505'
 OR (SELECT sync_failed_at FROM private.customer_explorer_rollout WHERE singleton) IS NULL
 OR (SELECT last_error_code FROM private.explorer_refresh_queue WHERE singleton)<>'23505'
 OR (SELECT attempts FROM private.explorer_refresh_queue WHERE singleton)<>1
 OR (SELECT next_attempt_at FROM private.explorer_refresh_queue WHERE singleton)<=now()
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>3
 THEN RAISE EXCEPTION 'Async worker did not fail-closed with backoff/rollback'; END IF;
END $$;
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;
DO $$
BEGIN
 IF (SELECT attempts FROM private.explorer_refresh_queue WHERE singleton)<>1
 THEN RAISE EXCEPTION 'Retry ignored its backoff'; END IF;
END $$;

-- Original HQ source rule: while directory build would violate uniqueness,
-- HQ INSERT must fail atomically, NEVER queue and pretend success.
DO $$
DECLARE _failed boolean:=false;
BEGIN
 BEGIN
  INSERT INTO public.customer_explorer_hq(id,client_id,client_key,name,country,sector)
   VALUES ('00000000-0000-4000-8000-000000000882','882','882','Must Fail','PT','Services');
 EXCEPTION WHEN unique_violation THEN _failed:=true;
 END;
 IF NOT _failed OR EXISTS(SELECT 1 FROM public.customer_explorer_hq WHERE client_key='882')
 THEN RAISE EXCEPTION 'HQ sync was made asynchronous or non-atomic'; END IF;
END $$;

-- Source correction queues a new generation; authorized service-only forced
-- retry repairs original directory and clears the fail-closed status marker.
UPDATE public.clients SET client_code='45'
 WHERE id='00000000-0000-4000-8000-000000000714';
SET ROLE service_role;
SELECT private.explorer_refresh_run(true);
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.customer_explorer_directory)<>4
 OR (SELECT requested_generation FROM private.explorer_refresh_queue WHERE singleton)
    <> (SELECT applied_generation FROM private.explorer_refresh_queue WHERE singleton)
 OR (SELECT attempts FROM private.explorer_refresh_queue WHERE singleton)<>0
 OR EXISTS(SELECT 1 FROM private.customer_explorer_rollout WHERE sync_failed_at IS NOT NULL OR sync_error_code IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='45')
 THEN RAISE EXCEPTION 'Worker recovery failed to drain/repair original projection'; END IF;
END $$;
-- Numeric-only source eligibility is a product decision, not changed by OPS.
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000715','PT-COM-ABC123','Fictitious Awarded Company');
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_id='PT-COM-ABC123')
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>4
 THEN RAISE EXCEPTION 'Numeric-only Explorer policy changed without #41 decision'; END IF;
END $$;
SELECT 'PASS Gate4C: source queue coalescing, original refresh, idempotent worker, browser isolation, atomic rollback, fail-closed retry, HQ synchronous editing, scoped eligibility' AS outcome;
