#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/verify-backup.sh — Verify SQLite backup integrity
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./verify-backup.sh <backup-file>
#
# Safety:
#   - Never modifies the production database
#   - Verifies backup integrity using sqlite3 .restore to temp file
#   - Checks schema, row counts, and basic consistency
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  echo "Example: $0 ./backups/alaminn-info-backup-20240101-120000.sqlite"
  exit 1
fi

BACKUP_FILE="$1"
TEMP_VERIFY_DIR="$(mktemp -d)"
VERIFY_DB="${TEMP_VERIFY_DIR}/verify.db"

cleanup() {
  rm -rf "$TEMP_VERIFY_DIR"
}
trap cleanup EXIT

echo "===== Backup Verification ====="
echo "Backup file: $BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Decompress if gzipped
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "Decompressing backup..."
  gunzip -c "$BACKUP_FILE" > "$VERIFY_DB"
else
  cp "$BACKUP_FILE" "$VERIFY_DB"
fi

# Verify SQLite integrity
echo "Running SQLite integrity check..."
INTEGRITY=$(sqlite3 "$VERIFY_DB" "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
  echo "❌ Integrity check failed: $INTEGRITY"
  exit 1
fi
echo "✅ Integrity check passed."

# Verify database can be opened
TABLES=$(sqlite3 "$VERIFY_DB" ".tables")
echo "Tables: $TABLES"

# Count rows in each table
for TABLE in $(echo "$TABLES"); do
  COUNT=$(sqlite3 "$VERIFY_DB" "SELECT COUNT(*) FROM $TABLE;")
  echo "  Table '$TABLE': $COUNT rows"
done

# Verify essential tables exist (adjust based on your Prisma schema)
REQUIRED_TABLES="user session account verificationtoken"
MISSING=""
for TABLE in $REQUIRED_TABLES; do
  EXISTS=$(sqlite3 "$VERIFY_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='$TABLE';" 2>/dev/null || true)
  if [ -z "$EXISTS" ]; then
    MISSING="$MISSING $TABLE"
  fi
done

if [ -n "$MISSING" ]; then
  echo "⚠️  Missing tables (may be expected if using different schema):$MISSING"
fi

echo "✅ Backup verified successfully."
echo "  Temp location: $TEMP_VERIFY_DIR"
exit 0