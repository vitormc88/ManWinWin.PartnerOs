#!/usr/bin/env bash
# ONLY synthetic PostgreSQL 17 hosted inside GitHub Actions.
# Test source-exact TEST sync wrapper, not the production Explorer refresh.
set -euo pipefail
test "${PGHOST:-}" = localhost
test "${PGUSER:-}" = postgres
test "${PGDATABASE:-}" = fin02_explorer_lab
test -z "${SUPABASE_ACCESS_TOKEN:-}"
test -z "${SUPABASE_DB_PASSWORD:-}"
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4b_customer_explorer_source_wrapper.sql

psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.clients(id,name) VALUES
('00000000-0000-4000-8000-0000000007a1','Fictional Company A');
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT count(*) FROM private.gate4_refresh_audit)<>1
 OR EXISTS (SELECT 1 FROM private.customer_explorer_rollout WHERE sync_error_code IS NOT NULL)
 THEN RAISE EXCEPTION 'Gate4B ordinary award simulation incorrectly disabled Explorer'; END IF;
END $$;
-- An idempotent no-op INSERT still invokes a statement-level trigger. The
-- documented extra refresh is observed, not silently treated as no effect.
INSERT INTO public.clients(id,name) VALUES
('00000000-0000-4000-8000-0000000007a1','Fictional Company A')
ON CONFLICT DO NOTHING;
DO $$
BEGIN
 IF (SELECT count(*) FROM private.gate4_refresh_audit)<>2
 OR (SELECT count(*) FROM public.clients)<>1
 THEN RAISE EXCEPTION 'Gate4B no-op statement-level retry observation changed'; END IF;
END $$;
SQL

# Obtain the *actual same advisory lock* in session A, while a second
# connection inserts another wholly fictional client in session B.
psql -X -v ON_ERROR_STOP=1 -c \
 "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(5); COMMIT;" \
 >/dev/null 2>&1 &
locker_pid=$!
trap 'kill "$locker_pid" 2>/dev/null || true' EXIT
seen="false"
for i in {1..35}; do
  state="$(psql -X -A -t -v ON_ERROR_STOP=1 -c \
    "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [[ "$state" == f ]]; then seen="true"; break; fi
  sleep 0.12
done
test "$seen" = "true" || { echo "Could not establish simultaneous advisory lock"; exit 1; }

psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.clients(id,name) VALUES
('00000000-0000-4000-8000-0000000007b2','Fictional Company B');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.clients)<>2
 OR (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'off'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'55P03'
 OR (SELECT count(*) FROM private.gate4_refresh_audit)<>2
 THEN RAISE EXCEPTION 'Gate4B expected source-exact concurrency fail-open behavior absent'; END IF;
END $$;
SQL
wait "$locker_pid"
trap - EXIT
echo "CONFIRMED SOURCE-WRAPPER RISK: competing client INSERT succeeded while Explorer rollout became OFF / SQLSTATE 55P03."

psql -X -v ON_ERROR_STOP=1 <<'SQL'
-- Synthetic maintenance/re-enable; no operation on the real TEST state.
UPDATE private.customer_explorer_rollout
 SET mode='hq',sync_error_code=NULL,sync_failed_at=NULL,changed_at=now() WHERE singleton;
UPDATE private.gate4_refresh_control SET force_failure=true WHERE singleton;
INSERT INTO public.clients(id,name) VALUES
('00000000-0000-4000-8000-0000000007c3','Fictional Company C');
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'off'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'P0001'
 OR (SELECT count(*) FROM public.clients)<>3
 THEN RAISE EXCEPTION 'Gate4B error-handling source behavior changed'; END IF;
END $$;

-- Forced rollback of a successful synthetic Explorer refresh. Validate
-- transactional cleanup of audit/client/rollout state.
BEGIN;
UPDATE private.customer_explorer_rollout
 SET mode='hq',sync_error_code=NULL,sync_failed_at=NULL,changed_at=now() WHERE singleton;
UPDATE private.gate4_refresh_control SET force_failure=false WHERE singleton;
INSERT INTO public.clients(id,name) VALUES
('00000000-0000-4000-8000-0000000007d4','Fictional Company D');
DO $$
BEGIN
 IF (SELECT count(*) FROM private.gate4_refresh_audit)<>3
 THEN RAISE EXCEPTION 'Gate4B refresh was not observed before rollback'; END IF;
END $$;
ROLLBACK;
DO $$
BEGIN
 IF (SELECT count(*) FROM private.gate4_refresh_audit)<>2
 OR (SELECT count(*) FROM public.clients)<>3
 OR (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'off'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'P0001'
 THEN RAISE EXCEPTION 'Gate4B transaction rollback left stale Explorer or client state'; END IF;
END $$;
SQL
echo "PASS: ordinary insert, no-op retry, forced refresh error, and full transactional rollback."
echo "RISK/NO-GO: simultaneous source-exact sync calls can disable Explorer. Needs design fix and full private restored-TEST run."
