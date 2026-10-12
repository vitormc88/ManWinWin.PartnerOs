-- Gate4B LAB-ONLY candidate. DO NOT deploy without full restored TEST E2E
-- and performance/deadlock review. Preserves original security definer,
-- fail-closed rollout on ACTUAL refresh exceptions, but serializes
-- expected concurrent refreshes with a blocking advisory transaction lock.
CREATE OR REPLACE FUNCTION private.sync_customer_explorer_directory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF tg_table_schema='public' AND tg_table_name IN ('clients','partners') THEN
  IF EXISTS(SELECT 1 FROM private.customer_explorer_rollout
            WHERE singleton AND mode='off') THEN
   RETURN NULL;
  END IF;
  BEGIN
   -- Candidate CHANGE: block until the previous refresh transaction ends.
   -- The original pg_try_advisory_xact_lock() returned false and disabled
   -- the Explorer on mere lock contention.
   PERFORM pg_catalog.pg_advisory_xact_lock(
       pg_catalog.hashtext('customer-explorer-refresh'));
   PERFORM private.refresh_customer_explorer();
  EXCEPTION WHEN OTHERS THEN
   UPDATE private.customer_explorer_rollout
   SET mode='off',sync_failed_at=now(),
       sync_error_code=sqlstate,changed_at=now()
   WHERE singleton;
  END;
 ELSE
  PERFORM private.refresh_customer_explorer();
 END IF;
 RETURN NULL;
END $$;
