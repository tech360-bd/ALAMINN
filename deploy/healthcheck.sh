#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/healthcheck.sh — Post-deployment health check + rollback trigger
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./healthcheck.sh [--rollback] [--strict]
#
# Env required:
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY (from GitHub Secrets)
#
# Flags:
#   --rollback   Restore previous release (never runs by default)
#   --strict     Fail immediately if health check fails (default)
#   --verbose    Show all output (default: concise)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${DEPLOY_HOST:-100.72.91.1}"
USER="${DEPLOY_USER:-deploy}"
PORT="${DEPLOY_PORT:-22}"
APP_DIR="${APP_DIR:-$HOME/alaminn.info}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3076/api/health}"
REPO="tech360-bd/ALAMINN"
BRANCH="main"
TIMEOUT=30
MAX_FAILS=3

rollback_flag=false
strict=true
verbose=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rollback) rollback_flag=true; shift ;;
    --strict) strict=true; shift ;;
    --verbose) verbose=true; shift ;;
    *) echo "Unknown flag: $1"; exit 2 ;;
  esac
done

ssh_exec() {
  local cmd="$*"
  if [ "$verbose" = true ]; then
    echo ">>> SSH: $cmd" >&2
  fi
  ssh -i ~/.ssh/deploy_key -p "$PORT" \
      -o StrictHostKeyChecking=yes \
      -o ConnectTimeout="$TIMEOUT" \
      -o BatchMode=yes \
      "${USER}@${HOST}" "$cmd"
}

echo "===== Health Check ====="
echo "Host: ${HOST}"
echo "Port: ${PORT}"
echo "App Dir: ${APP_DIR}"
echo "Health URL: ${HEALTH_URL}"

RELEASES_DIR="${APP_DIR}/releases"
CURRENT=$(basename "${APP_DIR}/current" 2>/dev/null || echo "none")

# Check if current release exists
if [ ! -d "${APP_DIR}/current" ]; then
  echo "ERROR: No 'current' directory at ${APP_DIR}/current"
  if [ "$rollback_flag" = true ]; then
    PREVIOUS=$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | tail -1 | xargs basename)
    if [ -n "$PREVIOUS" ] && [ -d "${RELEASES_DIR}/${PREVIOUS}" ]; then
      echo "Restoring previous release: ${PREVIOUS}"
      ssh_exec "cd ${APP_DIR} && ln -sfn ${RELEASES_DIR}/${PREVIOUS} current"
    else
      echo "No previous release to restore from."
      exit 1
    fi
  else
    exit 1
  fi
fi

# Health endpoint check
healthy=false
for i in $(seq 1 $((MAX_FAILS * 5))); do
  HTTP_CODE=$(ssh_exec "curl -s -o /dev/null -w '%{http_code}' ${HEALTH_URL}" 2>/dev/null || echo "000")
  echo "Attempt ${i}: HTTP ${HTTP_CODE}"
  if [ "$HTTP_CODE" = "200" ]; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != true ]; then
  echo "❌ HEALTH CHECK FAILED on release: ${CURRENT}"
  echo "Attempted ${MAX_FAILS} retries — none succeeded."

  if [ "$rollback_flag" = true ]; then
    echo "🔄 Rolling back..."
    PREVIOUS=$(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | tail -1 | xargs basename)
    if [ -z "$PREVIOUS" ] || [ "$PREVIOUS" = "$CURRENT" ]; then
      echo "No previous release to restore. Manual intervention required."
      exit 1
    fi
    ssh_exec "cd ${APP_DIR} && ln -sfn ${RELEASES_DIR}/${PREVIOUS} current"
    echo "Restored release: ${PREVIOUS}"
    # Force restart the restored app
    ssh_exec "pm2 reload alaminn-info --update-no-deps || pm2 restart alaminn-info || systemctl restart alaminn-info" 2>/dev/null || true
    echo "PM2/systemd restart attempted for restored release."
    sleep 5
    echo "✅ Rollback complete."
    exit 0
  else
    if [ "$strict" = true ]; then
      echo "Strict mode: exiting with failure."
      exit 1
    fi
    echo "Non-strict mode continuing."
  fi
else
  echo "✅ POST-DEPLOTH HEALTH CHECK PASSED (release: ${CURRENT})"
  exit 0
fi
