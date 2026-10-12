-- Gate4B synthetic-only reproduction of original TEST client-sync trigger.
-- The 2026-10-12 TEST backup's *exact* sync wrapper/trigger definitions are
-- used below. private.refresh_customer_explorer() is a deliberate SYNTHETIC
-- in-memory double; this does NOT reproduce the real directory refresh.
-- DATABASE: ephemeral PostgreSQL 17 ONLY. NO remote credentials or client rows.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.clients(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE private.customer_explorer_rollout(
  singleton boolean PRIMARY KEY DEFAULT true,
  mode text NOT NULL DEFAULT 'hq',
  sync_failed_at timestamptz,
  sync_error_code text,
  changed_at timestamptz DEFAULT now()
);
CREATE TABLE private.gate4_refresh_control(
  singleton boolean PRIMARY KEY DEFAULT true,
  force_failure boolean NOT NULL DEFAULT false
);
CREATE TABLE private.gate4_refresh_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.customer_explorer_rollout(singleton,mode) VALUES(true,'hq');
INSERT INTO private.gate4_refresh_control(singleton) VALUES(true);
CREATE OR REPLACE FUNCTION private.refresh_customer_explorer()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF (SELECT force_failure FROM private.gate4_refresh_control WHERE singleton) THEN
    RAISE EXCEPTION 'Synthetic refresh failure' USING ERRCODE='P0001';
  END IF;
  INSERT INTO private.gate4_refresh_audit DEFAULT VALUES;
END;
$$;

-- BEGIN SOURCE-EXACT FUNCTION DEFINITION FROM THE REAL TEST ARCHIVE.
CREATE FUNCTION private.sync_customer_explorer_directory() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if tg_table_schema='public' and tg_table_name in ('clients','partners') then
  if exists(select 1 from private.customer_explorer_rollout where singleton and mode='off') then return null;end if;
  begin
   if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('customer-explorer-refresh')) then
    raise exception 'Explorer refresh busy' using errcode='55P03';
   end if;
   perform private.refresh_customer_explorer();
  exception when others then
   -- Retain only SQLSTATE, never client details or internal error messages.
   update private.customer_explorer_rollout set mode='off',sync_failed_at=now(),
    sync_error_code=sqlstate,changed_at=now() where singleton;
  end;
 else
  perform private.refresh_customer_explorer();
 end if;
 return null;
end; $$;
CREATE TRIGGER customer_explorer_clients_sync AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH STATEMENT EXECUTE FUNCTION private.sync_customer_explorer_directory();
-- END SOURCE-EXACT TEST FUNCTION + TRIGGER.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.clients'::regclass
      AND tgname='customer_explorer_clients_sync' AND tgenabled='O'
  ) THEN RAISE EXCEPTION 'Gate4B original TEST sync trigger missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid='private.sync_customer_explorer_directory()'::regprocedure
      AND prosecdef AND proconfig @> ARRAY['search_path=']::text[]
  ) THEN RAISE EXCEPTION 'Gate4B original sync wrapper permissions/config missing'; END IF;
END $$;
