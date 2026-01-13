#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/pg.env"

: "${PGDATA:=$here/.pgdata}"
PORTFILE="$PGDATA/PORT"
if [ -f "$PORTFILE" ]; then
  export PGPORT="$(cat "$PORTFILE")"
fi

exec psql "$@"