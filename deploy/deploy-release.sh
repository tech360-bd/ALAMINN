#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/deploy-release.sh — Deploy a specific commit to production
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./deploy-release.sh <commit-sha>
#
# Requirements:
#   - SSH key at ~/.ssh/deploy_key
#   - SSH host key verified (in ~/.ssh/known_hosts)
#   - Deploy user on server with access to ~/alaminn.info
#
# Safety:
#   - Requires manual approval (never runs automatically)
#   - Versioned release directory (previous releases preserved)
#   - Automatic rollback on health check failure
#   - Never deletes or overwrites existing production data
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <commit-sha>"
  echo "Example: $0 a45a1abb9f6984ae562c74b8c67731d6df2bbba6"
  exit 1
fi

TARGET_SHA="$1"
HOST="${DEPLOY_HOST:-100.72.91.1}"
USER="${DEPLOY_USER:-deploy}"
PORT="${DEPLOY_PORT:-22}"
APP_DIR="${APP_DIR:-$HOME/alaminn.info}"
RELEASES_DIR="${APP_DIR}/releases"
BRANCH="main"
REPO="tech360-bd/ALAMINN"
HEALTH_URL="http://127.0.0.1:3076/api/health"

echo "===== Deploying Commit ====="
echo "SHA: ${TARGET_SHA}"
echo "Host: ${HOST}"
echo "User: ${USER}"
echo "App Dir: ${APP_DIR}"

# Verify SSH connectivity
if ! ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
     -o ConnectTimeout=10 -o BatchMode=yes \
     "${USER}@${HOST}" "echo 'SSH_OK'" 2>/dev/null; then
  echo "❌ SSH connection failed."
  exit 1
fi

# Verify the commit exists locally before deploying
if ! git cat-file -t "${TARGET_SHA}" >/dev/null 2>&1; then
  echo "❌ Commit ${TARGET_SHA} not found locally."
  exit 1
fi

# Create versioned release directory
RELEASE_DIR="${RELEASES_DIR}/$(date +%Y%m%d-%H%M%S)"
echo "Creating release directory: ${RELEASE_DIR}"

ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "mkdir -p ${RELEASES_DIR}"

# Fetch the commit on the remote server
echo "Fetching commit on remote server..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "cd ${APP_DIR} && git fetch origin ${TARGET_SHA}"

# Create git worktree from the target commit
echo "Creating git worktree at ${RELEASE_DIR}..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "cd ${APP_DIR} && git worktree add ${RELEASE_DIR} ${TARGET_SHA}"

# Install dependencies (lockfile-based, no audit)
echo "Installing dependencies..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "cd ${RELEASE_DIR} && npm ci --no-audit --no-fund"

# Build production version
echo "Building production version..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "cd ${RELEASE_DIR} && npm run build"

# Switch the symlink to the new release
echo "Switching traffic to new release..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "cd ${APP_DIR} && ln -sfn ${RELEASE_DIR} current"

# Reload PM2 service
echo "Reloading PM2 service..."
ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
    "${USER}@${HOST}" "pm2 reload alaminn-info --update-no-deps || pm2 restart alaminn-info || systemctl restart alaminn-info"

# Health check with retry
echo "Running health check..."
HEALTH_OK=false
for i in $(seq 1 15); do
  HTTP_CODE=$(ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
              -o ConnectTimeout=10 "${USER}@${HOST}" \
              "curl -s -o /dev/null -w '%{http_code}' ${HEALTH_URL}" 2>/dev/null || echo "000")
  echo "Attempt ${i}: HTTP ${HTTP_CODE}"
  if [ "$HTTP_CODE" = "200" ]; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" = true ]; then
  echo "✅ Deployment successful — health check passed."
  echo "Release: ${RELEASE_DIR}"
  exit 0
else
  echo "❌ Health check failed — rolling back..."
  PREVIOUS=$(ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
             "${USER}@${HOST}" "ls -1dt ${RELEASES_DIR}/*/ 2>/dev/null | head -2 | tail -1 | xargs basename")
  if [ -n "$PREVIOUS" ]; then
    ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
        "${USER}@${HOST}" "cd ${APP_DIR} && ln -sfn ${RELEASES_DIR}/${PREVIOUS} current"
    ssh -i ~/.ssh/deploy_key -p "$PORT" -o StrictHostKeyChecking=yes \
        "${USER}@${HOST}" "pm2 reload alaminn-info --update-no-deps || pm2 restart alaminn-info || systemctl restart alaminn-info"
    echo "✅ Rollback complete to ${PREVIOUS}"
  else
    echo "❌ No previous release to restore. Manual intervention required."
  fi
  exit 1
fi