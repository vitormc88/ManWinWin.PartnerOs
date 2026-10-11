#!/usr/bin/env bash
# FIN02 R1 independent migration/rollback and schema-drift tests.
# DISPOSABLE GitHub Actions PostgreSQL ONLY. Input is the Gate3 synthetic
# database *after* all four reverse-order rollbacks.
set -euo pipefail
test "\${PGHOST:-}" = "localhost"
test "\${PGUSER:-}" = "postgres"
test "\${PGDATABASE:-}" = "fin02_gate3"
test -z "\${SUPABASE_DB_PASSWORD:-}"
test -z "\${SUPABASE_ACCESS_TOKEN:-}"
TEMPLATE_DB="$PGDATABASE"
ROOT="supabase/migrations"
RB="tests/sql/fin02/rollbacks"
declare -A MIG=(
 [35]="$ROOT/20261012000100_fin02_sec35_clients_write_policy.sql"
 [36]="$ROOT/20261012000200_fin02_sec36_canonical_partner_reads.sql"
 [37]="$ROOT/20261012000300_fin02_sec37_initial_sale_ledger.sql"
 [38]="$ROOT/20261012000400_fin02_sec38_financial_write_policy.sql"
)
declare -A ROLLBACK=(
 [35]="$RB/sec35_clients_write_policy.rollback.sql"
 [36]="$RB/sec36_canonical_partner_reads.rollback.sql"
 [37]="$RB/sec37_initial_sale_ledger.rollback.sql"
 [38]="$RB/sec38_financial_write_policy.rollback.sql"
)
declare -A TBL=([35]=clients [36]=licenses [38]=licenses)
declare -A POLICY=([35]=clients_update [36]=licenses_select [38]=licenses_update)
declare -A ORIGINAL=(
 [35]=9c6212431a65fefd979fb4d126457188
 [36]=bfebb8436f0634b4bc6bd8ae92d2853a
 [38]=dcc929cfdd00e2acf7554d5d94f58bea
)
fresh() {
 local name="fin02_rb_$1"
 createdb --maintenance-db=postgres --template="$TEMPLATE_DB" "$name"
 printf "%s" "$name"
}
run_file() { PGDATABASE="$1" psql -X -v ON_ERROR_STOP=1 -q -f "$2"; }
query() { PGDATABASE="$1" psql -X -A -t -v ON_ERROR_STOP=1 -c "$2"; }
expect_error() {
 local db="$1" file="$2" expected="$3" output
 output="$(mktemp)"
 if PGDATABASE="$db" psql -X -v ON_ERROR_STOP=1 -f "$file" >"$output" 2>&1; then
   echo "FAIL: expected rejection ($expected) from $file on $db"
   cat "$output"; rm -f "$output"; exit 1
 fi
 if ! grep -q "$expected" "$output"; then
   echo "FAIL: wrong failure, expected $expected from $file on $db"
   cat "$output"; rm -f "$output"; exit 1
 fi
 rm -f "$output"
 echo "PASS expected fail-closed: $expected ($db)"
}
hash_policy() {
 query "$1" "SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) FROM pg_policies WHERE schemaname='public' AND tablename='$2' AND policyname='$3'"
}
ledger_snapshot() {
 query "$1" "SELECT count(*)||':'||coalesce(sum(amount),0)::text FROM public.client_revenue_history WHERE client_id IN (SELECT c.id FROM public.clients c WHERE c.source_deal_id='00000000-0000-4000-8000-000000000411')"
}
for n in 35 36 37 38; do
 db="$(fresh "\${n}_ok")"
 before_ledger="$(ledger_snapshot "$db")"
 run_file "$db" "\${MIG[$n]}"
 if [ "$n" != 37 ]; then
   patched="$(hash_policy "$db" "\${TBL[$n]}" "\${POLICY[$n]}")"
   test "$patched" != "\${ORIGINAL[$n]}" || { echo "FAIL: SEC$n forward no-op"; exit 1; }
 else
   test "$(query "$db" "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.deals'::regclass AND tgname='fin02_initial_sale_on_won'")" = "1"
 fi
 run_file "$db" "\${ROLLBACK[$n]}"
 if [ "$n" != 37 ]; then
   restored="$(hash_policy "$db" "\${TBL[$n]}" "\${POLICY[$n]}")"
   test "$restored" = "\${ORIGINAL[$n]}" || { echo "FAIL: SEC$n failed baseline restore"; exit 1; }
 else
   test "$(query "$db" "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.deals'::regclass AND tgname='fin02_initial_sale_on_won'")" = "0"
   test "$(query "$db" "SELECT to_regprocedure('public.fin02_record_initial_sale()') IS NULL")" = "t"
 fi
 test "$(ledger_snapshot "$db")" = "$before_ledger" || { echo "FAIL: SEC$n changed ledger"; exit 1; }
 expect_error "$db" "\${ROLLBACK[$n]}" "FIN02_SEC\${n}_ROLLBACK_"
 echo "PASS SEC$n independent forward -> rollback -> replay rejected, ledger preserved"
done
for n in 35 36 38; do
 db="$(fresh "\${n}_expr")"
 run_file "$db" "\${MIG[$n]}"
 query "$db" "ALTER POLICY \${POLICY[$n]} ON public.\${TBL[$n]} USING (false)" >/dev/null
 expect_error "$db" "\${ROLLBACK[$n]}" "FIN02_SEC\${n}_ROLLBACK_POLICY_DRIFT"
 db="$(fresh "\${n}_roles")"
 run_file "$db" "\${MIG[$n]}"
 query "$db" "ALTER POLICY \${POLICY[$n]} ON public.\${TBL[$n]} TO PUBLIC" >/dev/null
 expect_error "$db" "\${ROLLBACK[$n]}" "FIN02_SEC\${n}_ROLLBACK_POLICY_DRIFT"
 db="$(fresh "\${n}_pre")"
 query "$db" "ALTER POLICY \${POLICY[$n]} ON public.\${TBL[$n]} TO PUBLIC" >/dev/null
 expect_error "$db" "\${MIG[$n]}" "FIN02_SEC\${n}_BASELINE_DRIFT"
 echo "PASS SEC$n modified predicate/role/forward baseline refused"
done
db="$(fresh "37_func")"
run_file "$db" "\${MIG[37]}"
query "$db" "ALTER FUNCTION public.fin02_record_initial_sale() SECURITY INVOKER" >/dev/null
expect_error "$db" "\${ROLLBACK[37]}" "FIN02_SEC37_ROLLBACK_FUNCTION_SOURCE_DRIFT"
test "$(query "$db" "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.deals'::regclass AND tgname='fin02_initial_sale_on_won'")" = "1"
db="$(fresh "37_trig")"
run_file "$db" "\${MIG[37]}"
query "$db" "ALTER TABLE public.deals DISABLE TRIGGER fin02_initial_sale_on_won" >/dev/null
expect_error "$db" "\${ROLLBACK[37]}" "FIN02_SEC37_ROLLBACK_TRIGGER_DRIFT"
test "$(query "$db" "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.deals'::regclass AND tgname='fin02_initial_sale_on_won'")" = "1"
db="$(fresh "37_pre")"
query "$db" "ALTER TABLE public.client_revenue_history ADD COLUMN source_deal_id uuid" >/dev/null
expect_error "$db" "\${MIG[37]}" "FIN02_SEC37_PROD_SCHEMA_OR_EXISTING_LEDGER_TRIGGER_NO_GO"
echo "PASS SEC37 function/trigger/PROD-shape drift protection"
echo "PASS FIN02 independent migrations/rollbacks, drift detection, ledger preservation; ZERO TEST/PROD writes"
