#!/usr/bin/env bash
# OPS01 Gate4C: ORIGINAL TEST directory refresh + LAB async source queue.
set -euo pipefail
test "$PGHOST" = "localhost"
test "$PGUSER" = "postgres"
test "$PGDATABASE" = "gate4c_async_lab"
test -z "$SUPABASE_ACCESS_TOKEN"
test -z "$SUPABASE_DB_PASSWORD"
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4b_explorer_actual_source_refresh.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4c_explorer_async_candidate.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4c_explorer_async_assertions.sql

# A second worker must receive busy, not run a competing refresh.
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-async-worker')); SELECT pg_sleep(3); COMMIT;" >/dev/null 2>&1 &
locker=$!
trap 'kill "$locker" 2>/dev/null || true' EXIT
held=0
for i in $(seq 1 90); do
  state="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-async-worker'))")"
  if [ "$state" = f ]; then held=1; break; fi
  sleep 0.03
done
test "$held" -eq 1 || { echo "FAIL: worker lock precondition missing"; exit 1; }
res="$(psql -X -At -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT private.explorer_refresh_run(); RESET ROLE;")"
echo "$res" | grep -q '"result": "busy"' || { echo "FAIL: second worker did not decline concurrent run"; exit 1; }
wait "$locker"
trap - EXIT
echo "PASS Gate4C: worker advisory lock prevents concurrent duplicate refreshes."

# Race: worker reads target generation then waits on ORIGINAL refresh advisory
# lock. Additional source change commits while worker is waiting.
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(5); COMMIT;" >/dev/null 2>&1 &
blocker=$!
trap 'kill "$blocker" 2>/dev/null || true' EXIT
held=0
for i in $(seq 1 90); do
  state="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [ "$state" = f ]; then held=1; break; fi
  sleep 0.03
done
test "$held" -eq 1 || { echo "FAIL: original refresh lock not held"; exit 1; }
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO public.clients(id,client_code,commercial_name) VALUES ('00000000-0000-4000-8000-000000000716','46','Fictitious Before Worker');"
psql -X -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT private.explorer_refresh_run(); RESET ROLE;" >/dev/null 2>&1 &
worker=$!
# Wait for the worker's distinct advisory lock, proving it entered
# private.explorer_refresh_run and selected the pre-existing generation.
running=0
for i in $(seq 1 80); do
  state="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-async-worker'))")"
  if [ "$state" = f ]; then running=1; break; fi
  sleep 0.03
done
test "$running" -eq 1 || { echo "FAIL: active worker never acquired its lock"; exit 1; }
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO public.clients(id,client_code,commercial_name) VALUES ('00000000-0000-4000-8000-000000000717','47','Fictitious After Worker Started');"
wait "$blocker"
wait "$worker"
trap - EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF (SELECT requested_generation-applied_generation FROM private.explorer_refresh_queue WHERE singleton)<>1
 THEN RAISE EXCEPTION 'LOST SOURCE EVENT: a newer generation was marked processed'; END IF;
END $$;
SET ROLE service_role;
SELECT private.explorer_refresh_run();
RESET ROLE;
DO $$
BEGIN
 IF (SELECT requested_generation-applied_generation FROM private.explorer_refresh_queue WHERE singleton)<>0
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='47')
 THEN RAISE EXCEPTION 'Worker failed to drain newer generation'; END IF;
END $$;
SQL
echo "PASS Gate4C: request arriving during refresh remains pending, then drains."

# A lock timeout in BACKGROUND worker must not roll back a successful source
# INSERT. It records a retry and suppresses stale Explorer reads (sync_failed).
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(4); COMMIT;" >/dev/null 2>&1 &
blocker=$!
trap 'kill "$blocker" 2>/dev/null || true' EXIT
held=0
for i in $(seq 1 90); do
  state="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [ "$state" = f ]; then held=1; break; fi
  sleep 0.03
done
test "$held" -eq 1 || { echo "FAIL: timeout precondition"; exit 1; }
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO public.clients(id,client_code,commercial_name) VALUES ('00000000-0000-4000-8000-000000000718','48','Fictitious Background Timeout');"
response="$(psql -X -At -v ON_ERROR_STOP=1 -c "SET lock_timeout='500ms'; SET ROLE service_role; SELECT private.explorer_refresh_run(); RESET ROLE;")"
echo "$response" | grep -q '"result": "failed"' || { echo "FAIL: worker timeout not recorded"; exit 1; }
wait "$blocker"
trap - EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.clients WHERE client_code='48')
 OR NOT EXISTS(SELECT 1 FROM private.explorer_refresh_queue WHERE last_error_code='55P03' AND attempts=1)
 OR NOT EXISTS(SELECT 1 FROM private.customer_explorer_rollout WHERE sync_error_code='55P03' AND sync_failed_at IS NOT NULL AND mode='hq')
 THEN RAISE EXCEPTION 'Background timeout broke source transaction or lost alert marker'; END IF;
END $$;
SET ROLE service_role;
SELECT private.explorer_refresh_run(true);
RESET ROLE;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='48')
 OR EXISTS(SELECT 1 FROM private.customer_explorer_rollout WHERE sync_failed_at IS NOT NULL)
 OR (SELECT applied_generation FROM private.explorer_refresh_queue WHERE singleton)
    <> (SELECT requested_generation FROM private.explorer_refresh_queue WHERE singleton)
 THEN RAISE EXCEPTION 'Retry following background timeout did not recover'; END IF;
END $$;
SQL
echo "PASS Gate4C: background timeout does not abort source Client; fail-closed status and next retry repair."
