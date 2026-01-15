#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/pg.env"

: "${PGHOST:=127.0.0.1}"
: "${PGPORT_PRIMARY:=5432}"
: "${PGPORT_FALLBACK:=5433}"
: "${PGDATA:=$here/.pgdata}"

LOGFILE="$PGDATA/server.log"
PORTFILE="$PGDATA/PORT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta '$1' en PATH."; exit 1; }; }
for bin in initdb pg_ctl pg_isready psql postgres; do need "$bin"; done

mkdir -p "$PGDATA"
chmod 700 "$PGDATA" 2>/dev/null || true

# Puerto libre: 5432 -> 5433 -> 5434-5450
port_free() { (echo >/dev/tcp/${PGHOST}/$1) >/dev/null 2>&1 && return 1 || return 0; }
pick_port() {
  for p in "$PGPORT_PRIMARY" "$PGPORT_FALLBACK" $(seq 5434 5450); do
    if port_free "$p"; then echo "$p"; return 0; fi
  done
  echo "No hay puertos libres entre 5432-5450" >&2
  return 1
}

# Detecta clúster incompleto/corrupto (faltan dirs requeridos como pg_notify)
cluster_ok() {
  [ -f "$PGDATA/PG_VERSION" ] || return 1
  for d in base global pg_wal pg_xact pg_multixact pg_notify; do
    [ -d "$PGDATA/$d" ] || return 1
  done
  return 0
}

# Si existe PG_VERSION pero faltan carpetas => recrear
if [ -e "$PGDATA/PG_VERSION" ] && ! cluster_ok; then
  echo "[pg-up] PGDATA incompleto/corrupto -> recreando clúster en $PGDATA"
  rm -rf "$PGDATA"
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA" 2>/dev/null || true
fi

# Primer arranque: initdb crea el clúster dentro de PGDATA :contentReference[oaicite:5]{index=5}
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[pg-up] initdb en $PGDATA"
  # -U postgres asegura que exista el rol postgres (superuser del clúster)
  # locale C evita varios problemas de locales en entornos minimalistas
  initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C
fi

# Si ya está corriendo, reporta y guarda el puerto real
if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rp="$(sed -n '4p' "$PGDATA/postmaster.pid" 2>/dev/null | tr -d '\r' || true)"
  if [ -n "${rp:-}" ]; then
    echo "$rp" > "$PORTFILE"
    echo "[pg-up] OK (ya estaba arriba) $PGHOST:$rp"
    exit 0
  fi
fi

# Limpia PID obsoleto si quedó
if [ -f "$PGDATA/postmaster.pid" ] && ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  rm -f "$PGDATA/postmaster.pid"
fi

PGPORT="$(pick_port)"
echo "$PGPORT" > "$PORTFILE"

echo "[pg-up] starting postgres en $PGHOST:$PGPORT ..."
if ! pg_ctl -D "$PGDATA" -l "$LOGFILE" start -w -o "-h ${PGHOST} -p ${PGPORT}" >/dev/null; then
  echo "[pg-up] ERROR: postgres no pudo iniciar. Log (últimas 200 líneas):"
  tail -n 200 "$LOGFILE" || true
  exit 1
fi

for i in {1..30}; do
  pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1 && { echo "[pg-up] OK $PGHOST:$PGPORT"; exit 0; }
  sleep 0.2
done

echo "[pg-up] No respondió. Log (últimas 200 líneas):"
tail -n 200 "$LOGFILE" || true
exit 1