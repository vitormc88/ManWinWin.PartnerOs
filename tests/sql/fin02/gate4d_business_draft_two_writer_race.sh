#!/usr/bin/env bash
# FIN01->FIN02 Gate4D: truly concurrent, two separate PostgreSQL sessions.
# DISPOSABLE postgres17 ONLY; no live TEST/PROD connection, no customer data.
set -euo pipefail
test "$PGHOST" = localhost
test "$PGDATABASE" = gate4d_atomic_draft_lab
test "$PGUSER" = postgres
test -z "$SUPABASE_ACCESS_TOKEN"
test -z "$SUPABASE_DB_PASSWORD"
proposal='00000000-0000-4000-8000-000000000904'
actor='00000000-0000-4000-8000-000000000301'
src='00000000-0000-4000-8000-000000000111'
partner='00000000-0000-4000-8000-000000000201'
stamp="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT updated_at FROM public.proposals WHERE id='$proposal'")"
test -n "$stamp"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT

# Session 0 holds the same Draft row lock while two authenticated same-version
# writers concurrently race for the new version.
psql -X -v ON_ERROR_STOP=1 -c "BEGIN; SELECT id FROM public.proposals WHERE id='$proposal' FOR UPDATE; SELECT pg_sleep(4); COMMIT;" \
 >"$dir/locker.log" 2>&1 &
locker=$!
sleep 0.2
for worker in A B; do
  psql -X -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated;
   SELECT set_config('request.jwt.claim.sub','$actor',false);
   SELECT public.save_business_draft_atomic_candidate(
     '$proposal', '$stamp'::timestamptz,
     public.gate4d_payload('client','$src','$partner','Fictitious Concurrent $worker'),
     public.gate4d_items(false));" >"$dir/$worker.log" 2>&1 &
  if [ "$worker" = A ]; then wa=$!; else wb=$!; fi
done
set +e
wait "$wa"; ea=$?
wait "$wb"; eb=$?
wait "$locker"; el=$?
set -e
test "$el" -eq 0 || { echo "FAIL: locking session"; exit 1; }
if [ "$ea" -eq 0 ] && [ "$eb" -ne 0 ]; then
  loser=B
elif [ "$eb" -eq 0 ] && [ "$ea" -ne 0 ]; then
  loser=A
else
  echo "FAIL: expected exactly one successful writer; A=$ea B=$eb"
  exit 1
fi
grep -q 'DRAFT_VERSION_CONFLICT' "$dir/$loser.log" || {
 echo "FAIL: loser did not explicitly reject stale version"; exit 1;
}
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE _name text; _cnt bigint;
BEGIN
 SELECT client_name INTO _name FROM public.proposals
 WHERE id='00000000-0000-4000-8000-000000000904';
 SELECT count(*) INTO _cnt FROM public.proposal_items
 WHERE proposal_id='00000000-0000-4000-8000-000000000904';
 IF _name NOT IN ('Fictitious Concurrent A','Fictitious Concurrent B')
    OR _cnt<>4
 THEN RAISE EXCEPTION 'Two-writer race corrupted header or line count'; END IF;
END $$;
SQL
echo "PASS Gate4D: two independent concurrent sessions/lock; one atomic Draft winner, loser version conflict, exactly four final lines."
