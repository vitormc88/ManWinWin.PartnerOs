#!/usr/bin/env bash
# Gate4 rehearsal ONLY on synthetic PostgreSQL 17 GitHub Actions database.
# NOT a backup of real TEST. No cloud DB URLs, customer data or artifacts.
set -euo pipefail
test "${PGHOST:-}" = "localhost"
test "${PGUSER:-}" = "postgres"
test "${PGDATABASE:-}" = "fin02_gate3"
test -z "${SUPABASE_ACCESS_TOKEN:-}"
test -z "${SUPABASE_DB_PASSWORD:-}"
work="$(mktemp -d "${RUNNER_TEMP:-/tmp}/fin02-gate4-recovery.XXXXXX")"
restore_db="fin02_gate4_restore"
cleanup() {
  dropdb --if-exists --maintenance-db=postgres "$restore_db" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
docker run --rm --network host -e PGPASSWORD="$PGPASSWORD" -v "$work:/snapshot" \
 postgres:17 pg_dump -h localhost -U postgres -d fin02_gate3 \
 --format=custom --no-owner --file=/snapshot/fin02_synthetic.dump
test -s "$work/fin02_synthetic.dump"
sha256sum "$work/fin02_synthetic.dump" > "$work/fin02_synthetic.sha256"
(cd "$work" && sha256sum --check fin02_synthetic.sha256)
createdb --maintenance-db=postgres "$restore_db"
docker run --rm --network host -e PGPASSWORD="$PGPASSWORD" -v "$work:/snapshot" \
 postgres:17 pg_restore -h localhost -U postgres -d "$restore_db" \
 --exit-on-error --no-owner /snapshot/fin02_synthetic.dump
# Verify the restored state reproduces the entire targeted RLS/function/trigger
# fingerprint set, not only a handful of synthetic revenue totals.
source_meta="$(PGDATABASE=fin02_gate3 psql -X -A -t -v ON_ERROR_STOP=1 \
 -f tests/sql/fin02/release_patch_fingerprints.sql)"
restored_meta="$(PGDATABASE="$restore_db" psql -X -A -t -v ON_ERROR_STOP=1 \
 -f tests/sql/fin02/release_patch_fingerprints.sql)"
test "$source_meta" = "$restored_meta" || {
  echo "GATE4 backup recovery catalog MISMATCH"; exit 1;
}
sql="SELECT revenue_type||'|'||count(*)||'|'||sum(amount)::text
 FROM public.client_revenue_history h
 WHERE h.client_id IN (SELECT c.id FROM public.clients c
   WHERE c.source_deal_id='00000000-0000-4000-8000-000000000411')
 GROUP BY revenue_type ORDER BY revenue_type"
source_ledger="$(PGDATABASE=fin02_gate3 psql -X -At -v ON_ERROR_STOP=1 -c "$sql")"
restored_ledger="$(PGDATABASE="$restore_db" psql -X -At -v ON_ERROR_STOP=1 -c "$sql")"
test "$source_ledger" = "$restored_ledger" || {
  echo "GATE4 backup recovery financial HISTORY MISMATCH"; exit 1;
}
grep -q 'initial_sale|1|1608' <<< "$restored_ledger"
grep -q 'renewal|2|1140' <<< "$restored_ledger"
test "$(PGDATABASE="$restore_db" psql -X -At -c \
 "SELECT count(*) FROM public.renewals r JOIN public.clients c ON c.id=r.client_id
 WHERE c.source_deal_id='00000000-0000-4000-8000-000000000411'
 AND r.closed_at IS NOT NULL")" = "2"
echo "PASS: PostgreSQL 17 synthetic custom archive checksum, fresh-db restore,"
echo "      11 RLS predicates + source function/trigger, first sale and two renewals"
echo "      validated. THIS IS NOT A RESTORE OF LIVE TEST."
