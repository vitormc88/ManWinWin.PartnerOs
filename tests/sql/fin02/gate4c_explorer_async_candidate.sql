-- OPS01/FIN02 Gate4C LAB ONLY - no deployable migration.
-- Run only in a disposable PostgreSQL 17 database after:
-- tests/sql/fin02/gate4b_explorer_actual_source_refresh.sql
-- Original TEST private.refresh_customer_explorer() remains UNCHANGED.
-- Client/partner source transactions only mark a dirty generation; HQ/override
-- operations keep the synchronous fail-atomic behavior of actual TEST.
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE TABLE private.explorer_refresh_queue(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 requested_generation bigint NOT NULL DEFAULT 1 CHECK(requested_generation>=1),
 applied_generation bigint NOT NULL DEFAULT 0 CHECK(applied_generation>=0),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_attempt_at timestamptz,
 last_success_at timestamptz,
 last_error_code text,
 CHECK(applied_generation<=requested_generation)
);
ALTER TABLE private.explorer_refresh_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.explorer_refresh_queue FROM PUBLIC,anon,authenticated;
INSERT INTO private.explorer_refresh_queue(singleton) VALUES(true);

CREATE OR REPLACE FUNCTION private.sync_customer_explorer_directory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF tg_table_schema='public' AND tg_table_name IN ('clients','partners') THEN
  INSERT INTO private.explorer_refresh_queue(singleton,requested_generation,applied_generation)
  VALUES(true,1,0)
  ON CONFLICT(singleton) DO UPDATE SET
   requested_generation=private.explorer_refresh_queue.requested_generation+1,
   requested_at=clock_timestamp();
 ELSE
  -- HQ/overrides are intentionally NOT asynchronous: preserve original
  -- source behavior, including rejection of invalid HQ edits.
  PERFORM private.refresh_customer_explorer();
 END IF;
 RETURN NULL;
END $fn$;
CREATE TRIGGER customer_explorer_hq_sync AFTER INSERT OR UPDATE OR DELETE
 ON public.customer_explorer_hq FOR EACH STATEMENT
 EXECUTE FUNCTION private.sync_customer_explorer_directory();
CREATE TRIGGER customer_explorer_overrides_sync AFTER INSERT OR UPDATE OR DELETE
 ON public.customer_explorer_overrides FOR EACH STATEMENT
 EXECUTE FUNCTION private.sync_customer_explorer_directory();

CREATE FUNCTION private.explorer_refresh_run(_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE _target bigint; _code text;
BEGIN
 IF NOT pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtext('customer-explorer-async-worker')) THEN
  RETURN pg_catalog.jsonb_build_object('result','busy');
 END IF;
 SELECT requested_generation INTO _target
 FROM private.explorer_refresh_queue WHERE singleton
 AND applied_generation<requested_generation
 AND (_force OR next_attempt_at<=clock_timestamp());
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('result','idle'); END IF;
 BEGIN
  PERFORM private.refresh_customer_explorer();
 EXCEPTION WHEN OTHERS THEN
  _code:=SQLSTATE;
  UPDATE private.explorer_refresh_queue
  SET attempts=attempts+1,
      next_attempt_at=clock_timestamp()+
       least(300,power(2,least(attempts+1,8))::integer)*interval '1 second',
      last_attempt_at=clock_timestamp(),last_error_code=_code
  WHERE singleton;
  -- The existing private.explorer_access() blocks reads when this is set;
  -- preserve the selected rollout mode for authorized recovery.
  UPDATE private.customer_explorer_rollout
  SET sync_failed_at=clock_timestamp(),sync_error_code=_code,
      changed_at=clock_timestamp() WHERE singleton;
  RETURN pg_catalog.jsonb_build_object('result','failed','sqlstate',_code);
 END;
 -- Do not mark changes received DURING this refresh as processed.
 UPDATE private.explorer_refresh_queue
 SET applied_generation=greatest(applied_generation,_target),
     attempts=0,next_attempt_at=clock_timestamp(),
     last_attempt_at=clock_timestamp(),last_success_at=clock_timestamp(),
     last_error_code=NULL WHERE singleton;
 UPDATE private.customer_explorer_rollout
 SET sync_failed_at=NULL,sync_error_code=NULL,changed_at=clock_timestamp()
 WHERE singleton AND sync_failed_at IS NOT NULL;
 RETURN pg_catalog.jsonb_build_object('result','refreshed','generation',_target);
END $fn$;
REVOKE ALL ON FUNCTION private.explorer_refresh_run(boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_customer_explorer_directory() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.explorer_refresh_run(boolean) TO service_role;
