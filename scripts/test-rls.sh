#!/usr/bin/env bash
# Runs the RLS test suite against a throwaway local Postgres cluster.
#
# Emulates the Supabase runtime (roles + auth schema) via
# scripts/supabase-shim.sql, applies the production migration, then executes
# supabase/tests/rls.test.sql. No Docker or Supabase CLI required — only a
# local Postgres server installation (initdb/pg_ctl/psql).
#
# Usage: pnpm test:rls   (or: bash scripts/test-rls.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Locate Postgres server binaries (Debian/Ubuntu keep them off PATH).
if command -v initdb >/dev/null 2>&1; then
  PGBIN="$(dirname "$(command -v initdb)")"
else
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "error: Postgres server binaries not found (need initdb/pg_ctl)." >&2
  exit 1
fi

DATADIR="$(mktemp -d /tmp/housekey-rls-XXXXXX)"
PORT="${RLS_TEST_PORT:-54329}"
DBNAME="housekey_rls_test"

# Postgres refuses to run as root; drop to an unprivileged user if needed.
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  RUN_AS="$(getent passwd postgres >/dev/null && echo postgres || echo nobody)"
  chown "$RUN_AS" "$DATADIR"
fi

run_pg() {
  if [ -n "$RUN_AS" ]; then
    setpriv --reuid="$RUN_AS" --regid="$(id -g "$RUN_AS")" --clear-groups "$@" 2>/dev/null \
      || su -s /bin/sh "$RUN_AS" -c "$(printf '%q ' "$@")"
  else
    "$@"
  fi
}

cleanup() {
  run_pg "$PGBIN/pg_ctl" -D "$DATADIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATADIR"
}
trap cleanup EXIT

echo "==> initdb ($DATADIR)"
run_pg "$PGBIN/initdb" -D "$DATADIR" -U postgres -A trust >/dev/null

echo "==> starting postgres on 127.0.0.1:$PORT"
run_pg "$PGBIN/pg_ctl" -D "$DATADIR" -w -l "$DATADIR/pg.log" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -k $DATADIR" start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres

psql -v ON_ERROR_STOP=1 -q -c "create database $DBNAME" postgres

echo "==> applying supabase shim + migration"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/supabase-shim.sql" "$DBNAME"
# 0002_storage_branding.sql is Supabase-only (storage schema) and is skipped.
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0001_init.sql" "$DBNAME"

echo "==> running RLS tests"
psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/rls.test.sql" "$DBNAME"

echo "==> OK"
