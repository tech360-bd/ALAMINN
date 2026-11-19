#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Alaminn.info — one-time server install script
#  Run ONCE on a fresh ALO Education server (as the aloedu user).
# ═══════════════════════════════════════════════════════════════════
#
#  This script:
#    1. Verifies the pinned Node.js installation
#    2. Creates the app directory
#    3. Installs the systemd service
#    4. Creates a MariaDB database + user (interactive password)
#    5. Prints the exact next steps
#
#  USAGE (as aloedu, from the repo root):
#    sudo bash scripts/install-server.sh
#
#  It is safe to re-run (idempotent where possible).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="${ALAMINN_APP_DIR:-/var/www/alaminn-info}"
APP_USER="aloedu"
SERVICE_NAME="alaminn-info"

log()  { echo -e "\033[1;34m▶\033[0m $*"; }
ok()   { echo -e "\033[1;32m✓\033[0m $*"; }
die()  { echo -e "\033[1;31m✗\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash scripts/install-server.sh"

# ── 1. Pinned Node.js ───────────────────────────────────────────────
NODE_VERSION=$(tr -d '[:space:]' < .nvmrc)
[[ -x /usr/local/bin/node ]] && [[ "$(/usr/local/bin/node -p 'process.versions.node')" == "$NODE_VERSION" ]] ||
  die "Install Node.js $NODE_VERSION with its bundled npm in /usr/local before installing the units."
[[ ! -e "$APP_DIR/.env" ]] || die "Existing environment detected; preserve it and use the versioned release workflow."
ok "Node.js $NODE_VERSION ready"

# ── 2. App directory ────────────────────────────────────────────────
log "Ensuring app directory: $APP_DIR"
mkdir -p "$APP_DIR"
chown "$APP_USER":"$APP_USER" "$APP_DIR"
ok "App directory ready (owned by $APP_USER)"

# ── 3. systemd service ──────────────────────────────────────────────
log "Installing systemd service: $SERVICE_NAME (+ UMC messaging service)"
cp deploy/alaminn-info.service /etc/systemd/system/"$SERVICE_NAME".service
cp deploy/alaminn-umc.service /etc/systemd/system/alaminn-umc.service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" alaminn-umc
ok "Service installed & enabled (not started yet — run deploy first)"

# ── 4. MariaDB database ─────────────────────────────────────────────
log "MariaDB setup"
if ! command -v mariadb &>/dev/null && ! command -v mysql &>/dev/null; then
  die "MariaDB not found. CyberPanel should have installed it. Install: apt install mariadb-server"
fi

read -rsp "Choose a password for the MariaDB user 'aloeduca_alamin_crm': " DB_PASS
echo ""
read -rsp "Confirm password: " DB_PASS_CONFIRM
echo ""
[[ "$DB_PASS" == "$DB_PASS_CONFIRM" ]] || die "Passwords do not match."

# Generate the init SQL with the real password (URL-encoded for safety)
[[ "$DB_PASS" =~ ^[A-Za-z0-9_-]{24,}$ ]] || die "Use at least 24 URL-safe characters (for example: openssl rand -hex 24)."
URL_PASS="$DB_PASS"

# Write a temp init SQL with the real password
TMP_SQL=$(mktemp)
trap 'rm -f "$TMP_SQL"' EXIT
sed "s/CHANGE_ME_STRONG_PASSWORD/${URL_PASS}/g" deploy/mariadb-init.sql > "$TMP_SQL"

log "Creating database & user"
if command -v mariadb >/dev/null; then mariadb < "$TMP_SQL"; else mysql < "$TMP_SQL"; fi
rm -f "$TMP_SQL"
ok "MariaDB database 'aloeduca_alamin_crm' & user 'aloeduca_alamin_crm' created"

# ── 5. Write .env ───────────────────────────────────────────────────
log "Writing .env"
AUTH_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
umask 077
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://alaminn.info
PORT=3056
DATABASE_URL="mysql://aloeduca_alamin_crm:${URL_PASS}@localhost:3306/aloeduca_alamin_crm"
JWT_SECRET=${AUTH_SECRET}
CRON_SECRET=${CRON_SECRET}
SESSION_SECRET=${SESSION_SECRET}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://alaminn.info
UMC_SERVICE_URL=http://127.0.0.1:3010
SMTP_HOST=127.0.0.1
SMTP_PORT=25
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="Al Aminn <noreply@alaminn.info>"
EMAIL_REPLY_TO="Al Aminn <hello@alaminn.info>"
ANALYTICS_ENABLED=true
REDIS_URL=
ADMIN_BOOTSTRAP_EMAIL=admin@alaminn.info

EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
ok ".env written (chmod 600)"

# ── 6. Done — print next steps ──────────────────────────────────────
echo ""
echo "  ═══════════════════════════════════════════════════════════"
echo "  SERVER INSTALL COMPLETE"
echo "  ═══════════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Upload the project to $APP_DIR (git clone or rsync)"
echo "     Ensure the aloedu user owns it:"
echo "       sudo chown -R aloedu:aloedu $APP_DIR"
echo ""
echo "  2. In CyberPanel, create the website alaminn.info & issue SSL."
echo "     Then add the reverse-proxy config from deploy/ols-vhost.conf"
echo "     (CyberPanel → Websites → alaminn.info → vHost Conf)."
echo ""
echo "  3. Deploy the app:"
echo "       cd $APP_DIR"
echo "       Read docs/RELEASE-SAFETY.md and provision the versioned release."
echo ""
echo "  4. Verify: https://alaminn.info  (should show the homepage)"
echo ""
echo "  Service:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:     sudo journalctl -u $SERVICE_NAME -f"
echo ""
