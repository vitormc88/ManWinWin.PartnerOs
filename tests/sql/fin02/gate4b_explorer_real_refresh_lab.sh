#!/usr/bin/env bash
set -euo pipefail
test "$PGHOST" = "localhost"
test "$PGDATABASE" = "gate4b_original_refresh"
test -z "$SUPABASE_ACCESS_TOKEN"
test -z "$SUPABASE_DB_PASSWORD"
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4b_explorer_actual_source_refresh.sql

# Initial materialization uses the ACTUAL TEST refresh SQL from backup.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.partners(id,company_name,primary_contact_name,primary_contact_email)
 VALUES ('00000000-0000-4000-8000-000000000111','Fictional Partner','Fictitious Contact','contact@example.invalid');
INSERT INTO public.customer_explorer_hq(id,client_id,client_key,name,country,sector)
 VALUES ('00000000-0000-4000-8000-000000000811','800','800','Fictitious HQ','PT','Services');
INSERT INTO public.customer_explorer_overrides(client_id,sector,visible,evidence_status)
 VALUES ('00000000-0000-4000-8000-000000000711','Industrial equipment',false,'validated');
INSERT INTO public.clients(id,client_code,commercial_name,short_name,country,sector,partner_uuid)
 VALUES ('00000000-0000-4000-8000-000000000711','00042','Fictitious Client','FC','PT','Superseded','00000000-0000-4000-8000-000000000111');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.customer_explorer_directory)<>2
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory
   WHERE client_key='42' AND partner='Fictional Partner'
     AND sector='Industrial equipment' AND visible=false AND evidence_status='validated')
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory
   WHERE client_key='800' AND source_kind='hq')
 THEN RAISE EXCEPTION 'Real refresh missing source partner/HQ/override rules'; END IF;
END $$;
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000712','0','Excluded Zero');
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000713','9998','Excluded Reserved');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.customer_explorer_directory)<>2
 THEN RAISE EXCEPTION 'Real refresh included excluded source client codes'; END IF;
END $$;
UPDATE public.partners SET company_name='Fictional Partner Updated'
 WHERE id='00000000-0000-4000-8000-000000000111';
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory
   WHERE client_key='42' AND partner='Fictional Partner Updated')
 THEN RAISE EXCEPTION 'Actual partner trigger missed full refresh'; END IF;
END $$;
SQL
echo "PASS full TEST refresh: partner, HQ, overrides, 0/9998 exclusions, partner update."

# Original race: A owns advisory lock, B inserts and original exception handler
# silently commits client but disables Explorer without refreshing directory.
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(4); COMMIT;" >/dev/null 2>&1 &
locker=$!
trap 'kill "$locker" 2>/dev/null || true' EXIT
held=0
for i in $(seq 1 50); do
  state="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [ "$state" = f ]; then held=1; break; fi
  sleep 0.05
done
test "$held" -eq 1 || { echo "Race setup failed"; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000714','43','Fictitious Contender');
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'off'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'55P03'
 OR EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='43')
 THEN RAISE EXCEPTION 'Original source race was not reproduced'; END IF;
END $$;
SQL
wait "$locker"
trap - EXIT
echo "REPRODUCED: ORIGINAL full TEST refresh stale / mode=off / SQLSTATE 55P03."

# LAB candidate waits for the previously held advisory lock.
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate4b_customer_explorer_serialized_candidate.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
UPDATE private.customer_explorer_rollout SET mode='hq',sync_error_code=NULL,sync_failed_at=NULL WHERE singleton;
UPDATE public.clients SET country=country WHERE id='00000000-0000-4000-8000-000000000714';
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>3
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='43')
 THEN RAISE EXCEPTION 'Candidate cannot recover original full directory'; END IF;
END $$;
SQL
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(4); COMMIT;" >/dev/null 2>&1 &
locker=$!
trap 'kill "$locker" 2>/dev/null || true' EXIT
held=0
for i in $(seq 1 50); do
  state="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [ "$state" = f ]; then held=1; break; fi
  sleep 0.05
done
test "$held" -eq 1 || { echo "Candidate race setup failed"; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000715','44','Fictitious Serialized');
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>4
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='44')
 THEN RAISE EXCEPTION 'Real directory not synchronized after candidate contention'; END IF;
END $$;
SQL
wait "$locker"
trap - EXIT
echo "PASS candidate serializes actual source refresh; clients 42/43/44 and HQ 800 materialized."

# Source integrity edge: distinct raw client codes normalize to same directory
# key (44, 00044). Real directory unique constraint raises SQLSTATE 23505.
# Exception subtransaction rolls back directory DELETE+partial INSERT but
# client INSERT commits and rollout becomes off.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000716','00044','Fictitious Duplicate Normalized Key');
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'off'
 OR (SELECT sync_error_code FROM private.customer_explorer_rollout WHERE singleton)<>'23505'
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>4
 OR (SELECT count(*) FROM public.clients)<>6
 THEN RAISE EXCEPTION 'Real refresh uniqueness failure not atomic'; END IF;
END $$;
UPDATE public.clients SET client_code='45'
 WHERE id='00000000-0000-4000-8000-000000000716';
UPDATE private.customer_explorer_rollout SET mode='hq',sync_error_code=NULL,sync_failed_at=NULL WHERE singleton;
UPDATE public.clients SET country=country
 WHERE id='00000000-0000-4000-8000-000000000716';
DO $$
BEGIN
 IF (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>5
 OR NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='45')
 THEN RAISE EXCEPTION 'Real full refresh failed after fixing collision'; END IF;
END $$;
BEGIN;
INSERT INTO public.clients(id,client_code,commercial_name)
 VALUES ('00000000-0000-4000-8000-000000000717','46','Fictitious Rolled Back');
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='46')
 THEN RAISE EXCEPTION 'Rollback precondition: no in-txn directory refresh'; END IF;
END $$;
ROLLBACK;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.clients WHERE client_code='46')
 OR EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='46')
 OR (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>5
 THEN RAISE EXCEPTION 'Full source directory and client rollback not atomic'; END IF;
END $$;
SQL
echo "PASS real full refresh: code normalization collision/repair and atomic rollback."

# Blocking advisory candidate can wait on contention. A bounded statement
# timeout must fail the CLIENT write atomically instead of disabling Explorer.
# This is a failure-mode test of the LAB-only candidate, not a production SLO.
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT pg_advisory_xact_lock(hashtext('customer-explorer-refresh')); SELECT pg_sleep(4); COMMIT;" >/dev/null 2>&1 &
locker=$!
trap 'kill "$locker" 2>/dev/null || true' EXIT
held=0
for i in $(seq 1 50); do
  state="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT pg_try_advisory_xact_lock(hashtext('customer-explorer-refresh'))")"
  if [ "$state" = f ]; then held=1; break; fi
  sleep 0.05
done
test "$held" -eq 1 || { echo "Timeout race setup failed"; exit 1; }
timeout_log="$(mktemp)"
set +e
psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout='500ms';" \
  -c "INSERT INTO public.clients(id,client_code,commercial_name)
      VALUES ('00000000-0000-4000-8000-000000000718','47','Fictitious Timed Out Client');" \
  >"$timeout_log" 2>&1
failed_rc=$?
set -e
if [ "$failed_rc" -eq 0 ]; then
  rm -f "$timeout_log"
  echo "UNSAFE: simulated lock timeout completed client INSERT unexpectedly"
  exit 1
fi
if ! grep -q 'canceling statement due to statement timeout' "$timeout_log"; then
  rm -f "$timeout_log"
  echo "UNEXPECTED: statement failed for reason other than expected lock timeout"
  exit 1
fi
rm -f "$timeout_log"
wait "$locker"
trap - EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.clients WHERE client_code='47')
 OR EXISTS(SELECT 1 FROM public.customer_explorer_directory WHERE client_key='47')
 OR (SELECT mode FROM private.customer_explorer_rollout WHERE singleton)<>'hq'
 OR (SELECT count(*) FROM public.customer_explorer_directory)<>5
 THEN RAISE EXCEPTION 'Timeout caused partial client/Explorer write or bad rollout'; END IF;
END $$;
SQL
echo "PASS lab candidate timeout: cancelled insert rolled back, directory remained consistent, Explorer mode stayed HQ."
