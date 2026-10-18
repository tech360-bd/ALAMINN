#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/backup-sqlite.sh — Safe SQLite backup using .backup command
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./backup-sqlite.sh [--destination <path>] [--compress]
#
# Safety:
#   - Uses SQLite's built-in .backup command (never file copy)
#   - Never touches production database while running
#   - Creates consistent snapshot without locking writes long-term
#   - Optional gzip compression
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DB_PATH="${DB_PATH:-/root/alaminn-info/db/custom.db}"
DEST="${DEST:-./backups}"
COMPRESS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --destination) DEST="$2"; shift 2 ;;
    --compress) COMPRESS=true; shift ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

mkdir -p "$DEST"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASE_NAME="alaminn-info-backup-$TIMESTAMP.sqlite"
TEMP_FILE="$DEST/$BASE_NAME"

echo "===== SQLite Backup ====="
echo "Source: $DB_PATH"
echo "Destination: $DEST"
echo "Compress: $COMPRESS"

# Verify database exists and is readable
if [ ! -f "$DB_PATH" ]; then
  echo "❌ Database not found: $DB_PATH"
  exit 1
fi

if [ ! -r "$DB_PATH" ]; then
  echo "❌ Database not readable: $DB_PATH"
  exit 1
fi

# Use SQLite's .backup command for safe, consistent backup
echo "Creating consistent backup with sqlite3 .backup command..."
sqlite3 "$DB_PATH" ".backup '$TEMP_FILE'"

# Verify backup was created
if [ ! -f "$TEMP_FILE" ]; then
  echo "❌ Backup file not created: $TEMP_FILE"
  exit 1
fi

# Optional compression
if [ "$COMPRESS" = true ]; then
  echo "Compressing backup..."
  gzip "$TEMP_FILE"
  BACKUP_FILE="${TEMP_FILE}.gz"
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Compressed backup not created: $BACKUP_FILE"
    exit 1
  fi
  echo "✅ Backup compressed: $BACKUP_FILE"
else
  BACKUP_FILE="$TEMP_FILE"
fi

# Show backup info
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup complete:"
echo "  File: $BACKUP_FILE"
echo "  Size: $SIZE"
echo "  Timestamp: $(date -r "$BACKUP_FILE")"

exit 0