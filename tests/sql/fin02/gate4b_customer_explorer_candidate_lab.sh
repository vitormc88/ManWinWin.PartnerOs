#!/usr/bin/env bash
# Isolation: disposable synthetic PostgreSQL, after SOURCE failure reproduction.
set -euo pipefail
test "${PGDATABASE:-}" = fin02_explorer_lab
test "${PGHOST:-}" = localhost
test -z "${SUPABASE_DB_PASSWORD:-}"
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4b_customer_explorer_serialized_candidate.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
UPDATE private.customer_explorer_rollout
 SET mode='hq',sync_failed_at=NULL,sync_error_code=NULL,changed_at=now()
 WHERE singleton;
UPDATE private.gate4_refresh_control
 SET force_failure=false WHERE singleton;
SQL

psql -X -v ON_ERROR_STOP=1 -c \
 "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(5); COMMIT;" \
 > /dev/null 2>&1 &
locker=$!
trap 'kill "$locker" 2>/dev/null || true' EXIT
held=0
for i in {1..35}; do
  attempt="$(psql -X -At -v ON_ERROR_STOP=1 -c \
     "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [ "$attempt" = f ]; then held=1; break; fi
  sleep 0.12
done
test "$held" -eq 1 || { echo 'Candidate test failed to establish lock contention'; exit 1; }
# With the candidate this statement must BLOCK, then resume after session A
# releases the advisory lock. It must NOT silently mark the rollout OFF.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.clients(id,name) VALUES
 ('00000000-0000-4000-8000-0000000007e5','Fictional Company E');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.clients)<>4
 OR (SELECT count(*) FROM private.gate4_refresh_audit)<>3
 OR (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR EXISTS (SELECT 1 FROM private.customer_explorer_rollout WHERE sync_error_code IS NOT NULL)
 THEN RAISE EXCEPTION 'Gate4B candidate failed to serialize contention safely'; END IF;
END $$;
SQL
wait "$locker"
trap - EXIT
echo "PASS: blocking advisory candidate waits, then inserts client and refreshes Explorer without changing rollout from HQ."

# A real failure in the refresh procedure must remain visible through the
# original fail-closed behavior (mode=off). Don't camouflage that difference.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
UPDATE private.gate4_refresh_control SET force_failure=true WHERE singleton;
INSERT INTO public.clients(id,name) VALUES
 ('00000000-0000-4000-8000-0000000007f6','Fictional Company F');
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'off'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'P0001'
 THEN RAISE EXCEPTION 'Gate4B candidate hid a genuine refresh error'; END IF;
END $$;
SQL
echo "PASS: original refresh-error suppression/rollout-off semantics preserved (requires separate design review)."
echo "LAB CANDIDATE ONLY: no original full refresh, no live TEST, no production SQL, no deadline guarantee or deadlock proof."
