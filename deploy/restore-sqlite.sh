#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/restore-sqlite.sh — Restore SQLite database from backup
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./restore-sqlite.sh <backup-file> [--destination <db-path>] [--dry-run]
#
# Safety:
#   - NEVER overwrites production database without explicit flag
#   - Requires --confirm-destructive to proceed with restoration
#   - Creates backup of current database before restoration
#   - Preserves WAL/SHM files consistency
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file> [--destination <db-path>] [--dry-run] [--confirm-destructive]"
  exit 1
fi

BACKUP_FILE="$1"
DEST_DB=""
DRY_RUN=false
CONFIRM_DESTRUCTIVE=false

shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --destination) DEST_DB="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --confirm-destructive) CONFIRM_DESTRUCTIVE=true; shift ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

DEST_DB="${DEST_DB:-/root/alaminn-info/db/custom.db}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PRE_RESTORE_BACKUP="${DEST_DB}.pre-restore-$TIMESTAMP.bak"

echo "===== SQLite Restore ====="
echo "Backup source: $BACKUP_FILE"
echo "Destination: $DEST_DB"
echo "Dry run: $DRY_RUN"
echo "Confirm destructive: $CONFIRM_DESTRUCTIVE"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Decompress if gzipped
if [[ "$BACKUP_FILE" == *.gz ]]; then
  TEMP_DECOMP=$(mktemp)
  gunzip -c "$BACKUP_FILE" > "$TEMP_DECOMP"
  BACKUP_FILE="$TEMP_DECOMP"
  trap "rm -f $TEMP_DECOMP" EXIT
fi

# Verify source backup integrity before restoration
echo "Verifying source backup integrity..."
INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
  echo "❌ Source backup integrity check failed: $INTEGRITY"
  exit 1
fi
echo "✅ Source backup integrity passed."

# Safety check: never overwrite production without explicit confirmation
if [ "$CONFIRM_DESTRUCTIVE" != true ]; then
  echo "⚠️  Destructive operation: This will replace the database at $DEST_DB"
  echo "    Use --confirm-destructive to proceed with restoration."
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN: Would restore $BACKUP_FILE to $DEST_DB"
  echo "DRY RUN: Would create pre-restore backup at $PRE_RESTORE_BACKUP"
  echo "DRY RUN: Restoration aborted (dry run mode)."
  exit 0
fi

# Backup current database before restoration
if [ -f "$DEST_DB" ]; then
  echo "Creating pre-restore backup of current database..."
  cp -p "$DEST_DB" "$PRE_RESTORE_BACKUP"
  echo "✅ Pre-restore backup saved: $PRE_RESTORE_BACKUP"
fi

# Restore database
echo "Restoring database..."
cp "$BACKUP_FILE" "$DEST_DB"

# Verify restored database integrity
echo "Verifying restored database..."
RESTORE_INTEGRITY=$(sqlite3 "$DEST_DB" "PRAGMA integrity_check;")
if [ "$RESTORE_INTEGRITY" != "ok" ]; then
  echo "❌ Restored database integrity check failed!"
  echo "   Attempting to recover from pre-restore backup..."
  if [ -f "$PRE_RESTORE_BACKUP" ]; then
    cp "$PRE_RESTORE_BACKUP" "$DEST_DB"
    echo "   Restored from pre-restore backup."
  fi
  exit 1
fi
echo "✅ Restored database verified."

# Restore WAL/SHM if present in backup
WAL_FILE="${BACKUP_FILE}-wal"
SHM_FILE="${BACKUP_FILE}-shm"
if [ -f "$WAL_FILE" ]; then
  echo "Restoring WAL file..."
  cp "$WAL_FILE" "${DEST_DB}-wal"
fi
if [ -f "$SHM_FILE" ]; then
  echo "Restoring SHM file..."
  cp "$SHM_FILE" "${DEST_DB}-shm"
fi

echo "✅ SQLite database restored successfully."
echo "  Destination: $DEST_DB"
echo "  Timestamp: $(date)"

exit 0