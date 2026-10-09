-- TEST-only role checks for the account used in the browser pilot.
-- No session token is copied. All attempted writes are denied and rolled back.
BEGIN;
DO $$ BEGIN
 IF (SELECT functions_base_url FROM private.notification_settings LIMIT 1)
 IS DISTINCT FROM 'https://avxxzmoayxzrykwqzoqn.supabase.co/functions/v1'
 THEN RAISE EXCEPTION 'TEST environment required'; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE full_name='Francisco Santos' AND is_active AND NOT is_hq)<>1
 THEN RAISE EXCEPTION 'Unique active partner fixture required'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true)
FROM public.profiles WHERE full_name='Francisco Santos' AND is_active AND NOT is_hq;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT private.explorer_access(false) OR private.explorer_access(true)
 THEN RAISE EXCEPTION 'Incorrect partner capabilities'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory)
 THEN RAISE EXCEPTION 'Partner directory unexpectedly empty'; END IF;
 IF EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE NOT visible)
 OR EXISTS(SELECT 1 FROM public.customer_explorer_hq)
 OR EXISTS(SELECT 1 FROM public.customer_explorer_audit)
 THEN RAISE EXCEPTION 'HQ internals exposed'; END IF;
 BEGIN
  PERFORM public.customer_explorer_save_hq_batch('[{"client_id":"987654315","name":"Unauthorized TEST fixture","country":"PT","visible":false,"evidence_status":"unconfirmed"}]');
  RAISE EXCEPTION 'Partner HQ write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.customer_explorer_configure('all');
  RAISE EXCEPTION 'Partner settings write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Francisco read allowed; HQ internals and writes denied; rolled back' AS result;
