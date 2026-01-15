#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/pg.env"

PORTFILE="$PGDATA/PORT"
PGPORT="${PGPORT_PRIMARY}"

if [ -f "$PORTFILE" ]; then
  PGPORT="$(cat "$PORTFILE")"
fi

exec psql -h "$PGHOST" -p "$PGPORT" "$@"