#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$here/pg.env" ] && source "$here/pg.env"

: "${PGHOST:=127.0.0.1}"
: "${PGDATA:=$here/.pgdata}"
PORTFILE="$PGDATA/PORT"

PGPORT="${PGPORT_PRIMARY:-5432}"
[ -f "$PORTFILE" ] && PGPORT="$(cat "$PORTFILE")"

exec psql -h "$PGHOST" -p "$PGPORT" "$@"