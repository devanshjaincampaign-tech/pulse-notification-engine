#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir="${1:-./backups}"
: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"

mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_database="${PGDATABASE//[^a-zA-Z0-9_.-]/_}"
backup_file="${backup_dir%/}/${safe_database}-${timestamp}-$$.dump"
export PGSSLMODE="${PGSSLMODE:-require}"

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --host="$PGHOST" \
  --port="${PGPORT:-5432}" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --file="$backup_file"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "${backup_file}.sha256"
fi
printf 'Backup written: %s\n' "$backup_file"
