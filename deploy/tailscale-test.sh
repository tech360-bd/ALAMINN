#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy/tailscale-test.sh — Verify Tailscale connectivity to production
# ─────────────────────────────────────────────────────────────────────
# Usage:
#   ./tailscale-test.sh [--port PORT]
#
# Safety:
#   - Read-only test: no modifications to production
#   - Verifies SSH connectivity via Tailscale
#   - Validates host key fingerprint against known_hosts
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${DEPLOY_HOST:-100.72.91.1}"
USER="${DEPLOY_USER:-deploy}"
PORT="${DEPLOY_PORT:-22}"
KEY_FILE="${SSH_KEY:-~/.ssh/alaminn-github-deploy}"
TIMEOUT=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --key) KEY_FILE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

echo "===== Tailscale Connectivity Test ====="
echo "Host: ${HOST}:${PORT}"
echo "User: ${USER}"
echo "Key: ${KEY_FILE}"
echo ""

# Step 1: Verify SSH key exists
if [ ! -f "$KEY_FILE" ]; then
  echo "❌ SSH key not found: $KEY_FILE"
  echo "   Generate: ssh-keygen -t ed25519 -f $KEY_FILE"
  exit 1
fi
echo "✅ SSH key found: $KEY_FILE"

# Step 2: Check host key
echo ""
echo "Checking SSH host key..."
SSH_KEYSCAN=$(ssh-keyscan -T "$TIMEOUT" -p "$PORT" -H "$HOST" 2>/dev/null || echo "FAILED")
if echo "$SSH_KEYSCAN" | grep -q "$HOST"; then
  echo "✅ Host key retrieved from ${HOST}:${PORT}"
else
  echo "❌ Could not retrieve host key — check network/Tailscale connectivity"
  exit 1
fi

# Step 3: Test SSH connection
echo ""
echo "Testing SSH connection..."
CONNECT_TEST=$(ssh -i "$KEY_FILE" -p "$PORT" -o StrictHostKeyChecking=yes \
    -o ConnectTimeout="$TIMEOUT" -o BatchMode=yes \
    "${USER}@${HOST}" "echo 'CONNECT_OK'" 2>&1 || echo "CONNECT_FAILED")

if echo "$CONNECT_TEST" | grep -q "CONNECT_OK"; then
  echo "✅ SSH connection successful"
else
  echo "❌ SSH connection failed"
  echo "   Error: $CONNECT_TEST"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Verify Tailscale is running: tailscale status"
  echo "  2. Verify Tailscale IP is reachable: ping $HOST"
  echo "  3. Verify SSH key is authorized on server"
  echo "  4. Verify deploy user exists on server"
  exit 1
fi

# Step 4: Verify deploy user permissions
echo ""
echo "Verifying deploy user permissions..."
PERMS=$(ssh -i "$KEY_FILE" -p "$PORT" -o StrictHostKeyChecking=yes \
    -o ConnectTimeout="$TIMEOUT" "${USER}@${HOST}" \
    "whoami && id && pwd && ls -la ~/alaminn.info 2>/dev/null || echo 'PERM_FAIL'" 2>&1 || true)

echo "$PERMS"

echo ""
echo "===== Tailscale Test Complete ====="