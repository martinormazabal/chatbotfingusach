#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/pg.env"

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGPORT_FALLBACK:=5433}"
: "${PGDATA:=$here/.pgdata}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta '$1' en PATH."; exit 1; }; }
for bin in psql initdb pg_ctl pg_isready postgres; do need "$bin"; done

mkdir -p "$PGDATA"
chmod 700 "$PGDATA" 2>/dev/null || true

LOGFILE="$PGDATA/server.log"
PORTFILE="$PGDATA/PORT"

# Devuelve 0 si el puerto está libre (nadie escuchando), 1 si está ocupado.
port_free() {
  local port="$1"
  (echo >/dev/tcp/${PGHOST}/${port}) >/dev/null 2>&1 && return 1 || return 0
}

pick_port() {
  local preferred="$PGPORT"
  local fallback="$PGPORT_FALLBACK"

  if port_free "$preferred"; then echo "$preferred"; return 0; fi
  if port_free "$fallback"; then echo "$fallback"; return 0; fi

  for p in $(seq 5434 5450); do
    if port_free "$p"; then echo "$p"; return 0; fi
  done

  echo "No hay puertos libres entre 5432-5450" >&2
  return 1
}

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[pg-up] initdb en $PGDATA"
  initdb -D "$PGDATA" --username=postgres --auth=trust >/dev/null

  cat >> "$PGDATA/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
unix_socket_directories = '${PGDATA}'
max_connections = 20
shared_buffers = 32MB
work_mem = 4MB
maintenance_work_mem = 32MB
CONF
fi

CHOSEN_PORT="$(pick_port)"
export PGPORT="$CHOSEN_PORT"
echo "$PGPORT" > "$PORTFILE"

if pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
  echo "[pg-up] OK (ya estaba arriba) $PGHOST:$PGPORT"
  exit 0
fi

if [ -f "$PGDATA/postmaster.pid" ] && ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rm -f "$PGDATA/postmaster.pid"
fi

echo "[pg-up] starting postgres en $PGHOST:$PGPORT ..."
if ! pg_ctl -D "$PGDATA" -l "$LOGFILE" -o "-p ${PGPORT} -h 127.0.0.1 -k ${PGDATA}" start -w >/dev/null; then
  echo "[pg-up] ERROR: postgres no pudo iniciar."
  echo "---- Últimas 200 líneas del log: $LOGFILE ----"
  tail -n 200 "$LOGFILE" || true
  echo "--------------------------------------------"
  exit 1
fi

echo "[pg-up] OK $PGHOST:$PGPORT"
