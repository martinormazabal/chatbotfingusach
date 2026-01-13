#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/pg.env"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta '$1' en PATH (servidor PostgreSQL no instalado)."; exit 1; }; }
need psql
need initdb
need pg_ctl
need pg_isready

mkdir -p "$PGDATA"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[pg-up] initdb en $PGDATA"
  initdb -D "$PGDATA" --username=postgres --auth=trust >/dev/null
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = ${PGPORT}"
  } >> "$PGDATA/postgresql.conf"
fi

if ! pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
  echo "[pg-up] starting postgres..."
  pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" start >/dev/null
fi

for i in {1..30}; do
  pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1 && { echo "[pg-up] OK $PGHOST:$PGPORT"; exit 0; }
  sleep 0.2
done

echo "[pg-up] No respondió. Log: $PGDATA/server.log"
exit 1