#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/pg.env"

: "${PGHOST:=127.0.0.1}"
: "${PGPORT_PRIMARY:=5432}"
: "${PGPORT_FALLBACK:=5433}"
: "${PGDATA:=$here/.pgdata}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta '$1' en PATH."; exit 1; }; }
for bin in psql initdb pg_ctl pg_isready postgres; do need "$bin"; done

mkdir -p "$PGDATA"
chmod 700 "$PGDATA" 2>/dev/null || true

LOGFILE="$PGDATA/server.log"
PORTFILE="$PGDATA/PORT"

running_port_from_pid() {
  [ -f "$PGDATA/postmaster.pid" ] && sed -n '4p' "$PGDATA/postmaster.pid" | tr -d '\r' || true
}

set_conf_port() {
  local p="$1"
  if grep -qE '^[[:space:]]*port[[:space:]]*=' "$PGDATA/postgresql.conf"; then
    sed -i -E "s/^[[:space:]]*port[[:space:]]*=.*/port = ${p}/" "$PGDATA/postgresql.conf"
  else
    echo "port = ${p}" >> "$PGDATA/postgresql.conf"
  fi
}

# Detecta PGDATA roto (PG_VERSION existe, pero faltan dirs requeridos como pg_notify)
pgdata_is_broken() {
  [ -f "$PGDATA/PG_VERSION" ] || return 1
  for d in base global pg_wal pg_xact pg_notify; do
    [ -d "$PGDATA/$d" ] || return 0
  done
  return 1
}

reinit_pgdata() {
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  echo "[pg-up] PGDATA roto (faltan directorios como pg_notify). Re-inicializando..."
  mv "$PGDATA" "${PGDATA}.broken-${ts}" 2>/dev/null || true
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA" 2>/dev/null || true

  initdb -D "$PGDATA" --username=postgres --auth=trust >/dev/null

  cat >> "$PGDATA/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
unix_socket_directories = '${PGDATA}'
max_connections = 20
shared_buffers = 32MB
work_mem = 4MB
maintenance_work_mem = 32MB
CONF
}

# 0) Si está roto, reinit (esto evita el FATAL pg_notify)
if pgdata_is_broken; then
  reinit_pgdata
fi

# 1) initdb si falta totalmente
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

# 2) Si ya corre este clúster, fijar PORTFILE y salir
if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rp="$(running_port_from_pid)"
  if [ -n "$rp" ]; then
    echo "$rp" > "$PORTFILE"
    echo "[pg-up] OK (ya estaba arriba) $PGHOST:$rp"
    exit 0
  fi
fi

# Limpia pid obsoleto si quedó
if [ -f "$PGDATA/postmaster.pid" ] && ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rm -f "$PGDATA/postmaster.pid"
fi

try_start() {
  local p="$1"
  set_conf_port "$p"
  echo "[pg-up] starting postgres en $PGHOST:$p ..."
  if pg_ctl -D "$PGDATA" -l "$LOGFILE" -o "-p ${p} -h 127.0.0.1 -k ${PGDATA}" start -w >/dev/null; then
    echo "$p" > "$PORTFILE"
    echo "[pg-up] OK $PGHOST:$p"
    return 0
  fi
  return 1
}

# 3) 5432 primero; si falla, 5433
if ! try_start "$PGPORT_PRIMARY"; then
  echo "[pg-up] No pudo iniciar en $PGPORT_PRIMARY, intentando $PGPORT_FALLBACK..."
  if ! try_start "$PGPORT_FALLBACK"; then
    echo "[pg-up] ERROR: no pudo iniciar ni en $PGPORT_PRIMARY ni en $PGPORT_FALLBACK"
    echo "---- Últimas 200 líneas del log: $LOGFILE ----"
    tail -n 200 "$LOGFILE" || true
    echo "--------------------------------------------"
    exit 1
  fi
fi