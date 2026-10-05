#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  printf 'Usage: RESTORE_CONFIRM=YES PGHOST=... PGUSER=... PGDATABASE=... %s <backup.dump>\n' "$0" >&2
  exit 2
fi
if [[ "${RESTORE_CONFIRM:-}" != "YES" ]]; then
  printf 'Refusing destructive restore. Set RESTORE_CONFIRM=YES after stopping writers and verifying the target database.\n' >&2
  exit 2
fi
: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"
export PGSSLMODE="${PGSSLMODE:-require}"

pg_restore \
  --clean \
  --if-exists \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-acl \
  --host="$PGHOST" \
  --port="${PGPORT:-5432}" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  "$backup_file"

printf 'Restore completed into database %s on %s.\n' "$PGDATABASE" "$PGHOST"
