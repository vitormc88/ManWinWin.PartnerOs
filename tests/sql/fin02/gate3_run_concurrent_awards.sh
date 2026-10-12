#!/usr/bin/env bash
# Two separate original award RPC transactions contend on one deal row.
# The coordinator temporarily locks the deal so both workers queue.
# All three sessions connect only to the disposable CI postgres service.
set -euo pipefail
test -n "${PGDATABASE:-}"
psql -X -v ON_ERROR_STOP=1 -c "
BEGIN;
SELECT id FROM public.deals WHERE id='00000000-0000-4000-8000-000000000412' FOR UPDATE;
SELECT pg_sleep(3);
COMMIT;
" > /tmp/gate3-holder.log 2>&1 &
holder=$!
sleep 0.5
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate3_concurrent_award_call.sql > /tmp/gate3-concurrent-a.log 2>&1 &
first=$!
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate3_concurrent_award_call.sql > /tmp/gate3-concurrent-b.log 2>&1 &
second=$!
set +e
wait "$first"; a=$?
wait "$second"; b=$?
wait "$holder"; c=$?
set -e
if [[ "$a" != 0 || "$b" != 0 || "$c" != 0 ]]; then
  echo "Gate3 concurrency SQL process failed: coordinator=$c first=$a second=$b"
  cat /tmp/gate3-holder.log /tmp/gate3-concurrent-a.log /tmp/gate3-concurrent-b.log
  exit 1
fi
python3 - <<'PY'
from pathlib import Path
import re
results=[]
for f in ('/tmp/gate3-concurrent-a.log','/tmp/gate3-concurrent-b.log'):
    source=Path(f).read_text()
    results += re.findall(r'"already_awarded":\s*(true|false)',source)
if sorted(results) != ['false','true']:
    raise SystemExit(f'Expected one first award and one idempotent repeat; got {results!r}')
print('Two concurrent PostgreSQL transaction results: one first award and one already_awarded. Both committed.')
PY
psql -X -v ON_ERROR_STOP=1 -f tests/sql/fin02/gate3_concurrent_award_assertions.sql
