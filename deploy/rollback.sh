#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/rollback.sh — Roll back to the previous release
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./rollback.sh [--force]
#
# Flags:
#   --force   Skip confirmation prompt (use in CI/CD automation)
#
# Safety:
#   - Only restores the release immediately preceding the current one.
#   - Never deletes the current release (so it can be restored later).
#   - Requires SSH access to the production server.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${DEPLOY_HOST:-100.72.91.1}"
USER="${DEPLOY_USER:-deploy}"
PORT="${DEPLOY_PORT:-22}"
APP_DIR="${APP_DIR:-$HOME/alaminn.info}"
RELEASES_DIR="${APP_DIR}/releases"
CURRENT_LINK="${APP_DIR}/current"
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=true; shift ;;
    *) echo "Unknown flag: $1"; exit 2 ;;
  esac
done

echo "===== Rollback ====="
echo "Host: ${HOST}"
echo "User: ${USER}"
echo "App Dir: ${APP_DIR}"

# Verify SSH connectivity
if ! ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
     -o ConnectTimeout=10 -o BatchMode=yes \
     "${USER}@${HOST}" "echo 'SSH_OK'" 2>/dev/null; then
  echo "❌ SSH connection failed. Check credentials and network."
  exit 1
fi

# Get current and previous releases
CURRENT=$(ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
          -o ConnectTimeout=10 "${USER}@${HOST}" \
          "ls -1dt ${RELEASES_DIR}/*/ 2>/dev/null | head -1 | xargs basename" 2>/dev/null)

PREVIOUS=$(ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
           -o ConnectTimeout=10 "${USER}@${HOST}" \
           "ls -1dt ${RELEASES_DIR}/*/ 2>/dev/null | head -2 | tail -1 | xargs basename" 2>/dev/null)

echo "Current release: ${CURRENT}"
echo "Previous release: ${PREVIOUS}"

if [ -z "$PREVIOUS" ] || [ "$PREVIOUS" = "$CURRENT" ]; then
  echo "❌ No previous release available to restore."
  echo "Manual intervention required."
  exit 1
fi

if [ "$FORCE" != true ]; then
  read -r -p "Roll back from ${CURRENT} to ${PREVIOUS}? [y/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 0
  fi
fi

echo "🔄 Restoring release: ${PREVIOUS}"
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    -o ConnectTimeout=10 "${USER}@${HOST}" \
    "cd ${APP_DIR} && ln -sfn ${RELEASES_DIR}/${PREVIOUS} current"

# Reload PM2 service
echo "🔄 Reloading PM2 service..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    -o ConnectTimeout=10 "${USER}@${HOST}" \
    "pm2 reload alaminn-info --update-no-deps || pm2 restart alaminn-info || systemctl restart alaminn-info" 2>/dev/null || true

sleep 5

# Verify health after rollback
HEALTH_OK=false
for i in $(seq 1 15); do
  HTTP_CODE=$(ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
              -o ConnectTimeout=10 "${USER}@${HOST}" \
              "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3076/api/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" = true ]; then
  echo "✅ Rollback complete — health check passed."
  exit 0
else
  echo "❌ Rollback completed but health check failed."
  echo "Manual intervention required."
  exit 1
fi