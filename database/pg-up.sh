#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Carga variables si existe pg.env (opcional)
if [ -f "$here/pg.env" ]; then
  # shellcheck disable=SC1091
  source "$here/pg.env"
fi

: "${PGHOST:=127.0.0.1}"
: "${PGPORT_PRIMARY:=5432}"
: "${PGPORT_FALLBACK:=5433}"
: "${PGDATA:=$here/.pgdata}"

LOGFILE="$PGDATA/server.log"
PORTFILE="$PGDATA/PORT"
LOCKDIR="$PGDATA/.pg-up.lockdir"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta '$1' en PATH."; exit 1; }; }
for bin in initdb pg_ctl pg_isready postgres; do need "$bin"; done

mkdir -p "$PGDATA"
chmod 700 "$PGDATA" 2>/dev/null || true

# Lock atómico sin flock (evita que concurrently dispare dos arranques a la vez)
acquire_lock() {
  local waited=0
  while ! mkdir "$LOCKDIR" 2>/dev/null; do
    sleep 0.1
    waited=$((waited+1))
    if [ "$waited" -ge 300 ]; then
      echo "[pg-up] No se pudo adquirir lock ($LOCKDIR). ¿Hay otro pg-up corriendo?" >&2
      return 1
    fi
  done
  trap 'rm -rf "$LOCKDIR" 2>/dev/null || true' EXIT
}
acquire_lock

# Clúster válido (carpetas básicas)
cluster_ok() {
  [ -f "$PGDATA/PG_VERSION" ] || return 1
  for d in base global pg_wal pg_xact pg_multixact pg_notify; do
    [ -d "$PGDATA/$d" ] || return 1
  done
  return 0
}

# Si quedó un clúster incompleto (ej: falta pg_notify), recrear
if [ -e "$PGDATA/PG_VERSION" ] && ! cluster_ok; then
  echo "[pg-up] PGDATA incompleto/corrupto -> recreando clúster en $PGDATA"
  rm -rf "$PGDATA"
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA" 2>/dev/null || true
fi

# ====== BOOTSTRAP AUTOMÁTICO (TU PRIMER INTENTO) ======
# Si no hay PG_VERSION, entonces NO existe clúster -> initdb
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[pg-up] initdb en $PGDATA"
  # Equivalente a: initdb -D .pgdata -U postgres --auth=trust --encoding=UTF8 --locale=C
  initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null

  # Asegura socket en PGDATA (evita /run/postgresql)
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "unix_socket_directories = '${PGDATA}'"
  } >> "$PGDATA/postgresql.conf"
fi

# Si ya está corriendo, salir OK
if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rp="$(sed -n '4p' "$PGDATA/postmaster.pid" 2>/dev/null | tr -d '\r' || true)"
  [ -n "${rp:-}" ] && echo "$rp" > "$PORTFILE"
  echo "[pg-up] OK (ya estaba arriba) $PGHOST:${rp:-?}"
  exit 0
fi

# Limpia PID obsoleto si existe y no está arriba
if [ -f "$PGDATA/postmaster.pid" ] && ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rm -f "$PGDATA/postmaster.pid"
fi

port_free() { (echo >/dev/tcp/${PGHOST}/$1) >/dev/null 2>&1 && return 1 || return 0; }

validate_port() {
  local port="$1"
  if [ -z "${port:-}" ] || ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "[pg-up] ERROR: puerto inválido '${port}'. Debe ser numérico y no vacío." >&2
    return 1
  fi
}

pick_ports() {
  echo "$PGPORT_PRIMARY" "$PGPORT_FALLBACK"
  seq 5434 5450
}

update_postgres_conf_port() {
  local port="$1"
  validate_port "$port"

  if grep -qE '^[#[:space:]]*port[[:space:]]*=' "$PGDATA/postgresql.conf"; then
    sed -i.bak -E "s/^[#[:space:]]*port[[:space:]]*=.*/port = ${port}/" "$PGDATA/postgresql.conf"
  else
    echo "port = ${port}" >> "$PGDATA/postgresql.conf"
  fi
}

start_postgres() {
  local port="$1"
  validate_port "$port"
  update_postgres_conf_port "$port"
  echo "[pg-up] starting postgres en $PGHOST:$port ..."
  # Equivalente a: pg_ctl -D .pgdata -l .pgdata/server.log start -w -o "-h 127.0.0.1 -p 5432 -k $(pwd)/.pgdata"
    if ! pg_ctl -D "$PGDATA" -l "$LOGFILE" start -w \
    -o "-h ${PGHOST} -p ${port} -k ${PGDATA}" >/dev/null; then
    echo "[pg-up] ERROR: no se pudo iniciar postgres en ${PGHOST}:${port}. Log (últimas 200 líneas):"
    tail -n 200 "$LOGFILE" || true
    return 1
  fi
}

PGPORT=""
for candidate in $(pick_ports); do
  validate_port "$candidate"
  if ! port_free "$candidate"; then
    continue
  fi

  if start_postgres "$candidate"; then
    PGPORT="$candidate"
    echo "$PGPORT" > "$PORTFILE"
    break
  fi
done

if [ -z "$PGPORT" ]; then
  echo "[pg-up] ERROR: postgres no pudo iniciar en 5432-5450. Log (últimas 200 líneas):"
  tail -n 200 "$LOGFILE" || true
  exit 1
fi

# Espera listo
for i in {1..30}; do
  pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1 && { echo "[pg-up] OK $PGHOST:$PGPORT"; exit 0; }
  sleep 0.2
done

echo "[pg-up] No respondió. Log (últimas 200 líneas):"
tail -n 200 "$LOGFILE" || true
exit 1