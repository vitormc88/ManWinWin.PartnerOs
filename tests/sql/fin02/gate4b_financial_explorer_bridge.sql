-- Gate4B cross-domain FINANCIAL lab bootstrap — synthetic directory only.
-- The ORIGINAL TEST wrapper/trigger is added separately from the 2026-10-12
-- source-verified fixture, then the SERIALIZED candidate is installed.
-- Does NOT contain user records, client data, auth secrets, Storage, or jobs.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.customer_explorer_rollout(
 singleton boolean PRIMARY KEY DEFAULT true,
 mode text NOT NULL DEFAULT 'hq',
 sync_failed_at timestamptz,
 sync_error_code text,
 changed_at timestamptz DEFAULT now()
);
CREATE TABLE private.gate4_refresh_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 refreshed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.customer_explorer_rollout(singleton,mode) VALUES(true,'hq');
-- Intentional in-memory synthetic refresh double. Not the real Explorer
-- directory implementation, which requires private views and infrastructure.
CREATE OR REPLACE FUNCTION private.refresh_customer_explorer()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 INSERT INTO private.gate4_refresh_audit DEFAULT VALUES;
END $$;
