#!/usr/bin/env bash
# ============================================================================
# remote-setup.sh — Production environment & database setup script
# ----------------------------------------------------------------------------
# Security & operational invariants:
#   - Never contains hardcoded database credentials or bootstrap passwords.
#   - Requires DATABASE_URL and ADMIN_BOOTSTRAP_PASSWORD from the environment
#     (or an existing chmod-600 .env file).
#   - Never prints secret values or cats .env to stdout/logs.
#   - Never mutates tracked Prisma schema files or runs `prisma db push`.
#   - Uses `prisma/schema.mysql.prisma` + `prisma.config.mysql.ts` for MySQL /
#     MariaDB and `prisma/schema.prisma` + `prisma.config.ts` for SQLite.
# ============================================================================
set -euo pipefail

APP_DIR="${ALAMINN_APP_DIR:-$(pwd)}"
cd "$APP_DIR"

echo "[remote-setup] Starting Alaminn.info setup in $APP_DIR"

# ── 1. Load existing .env if present (without printing values) ──────────────
if [[ -f .env ]]; then
  chmod 600 .env
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── 2. Validate required injected secrets ───────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[remote-setup] ERROR: DATABASE_URL must be provided via environment or existing .env." >&2
  exit 1
fi

if [[ -z "${ADMIN_BOOTSTRAP_PASSWORD:-}" ]]; then
  echo "[remote-setup] ERROR: ADMIN_BOOTSTRAP_PASSWORD must be provided via environment or existing .env." >&2
  exit 1
fi

if [[ "${#ADMIN_BOOTSTRAP_PASSWORD}" -lt 12 ]]; then
  echo "[remote-setup] ERROR: ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters." >&2
  exit 1
fi

# ── 3. Generate random cryptographic secrets only when not already set ──────
JWT_SECRET="${JWT_SECRET:-${AUTH_SECRET:-$(openssl rand -hex 32)}}"
AUTH_SECRET="${AUTH_SECRET:-$JWT_SECRET}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 32)}"
HIGHER_STUDY_REFERRAL_SECRET="${HIGHER_STUDY_REFERRAL_SECRET:-$(openssl rand -hex 32)}"
ENGLISH_LEARNING_REFERRAL_SECRET="${ENGLISH_LEARNING_REFERRAL_SECRET:-$(openssl rand -hex 32)}"

NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-3056}"
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://alaminn.info}"
NEXTAUTH_URL="${NEXTAUTH_URL:-$NEXT_PUBLIC_SITE_URL}"
EMAIL_FROM="${EMAIL_FROM:-noreply@alaminn.info}"
EMAIL_REPLY_TO="${EMAIL_REPLY_TO:-hello@alaminn.info}"
LOG_LEVEL="${LOG_LEVEL:-error}"
WHATSAPP_NUMBER="${WHATSAPP_NUMBER:-01716609554}"
WHATSAPP_INTERNATIONAL_NUMBER="${WHATSAPP_INTERNATIONAL_NUMBER:-8801716609554}"
WHATSAPP_DISPLAY_NUMBER="${WHATSAPP_DISPLAY_NUMBER:-01716 609 554}"
WHATSAPP_BUSINESS_NAME="${WHATSAPP_BUSINESS_NAME:-Al Aminn}"
ADMIN_BOOTSTRAP_EMAIL="${ADMIN_BOOTSTRAP_EMAIL:-admin@alaminn.info}"

umask 077
cat > .env <<EOF
NODE_ENV=${NODE_ENV}
PORT=${PORT}
DATABASE_URL="${DATABASE_URL}"
NEXTAUTH_URL="${NEXTAUTH_URL}"
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}"
EMAIL_FROM="${EMAIL_FROM}"
EMAIL_REPLY_TO="${EMAIL_REPLY_TO}"
LOG_LEVEL=${LOG_LEVEL}
WHATSAPP_NUMBER="${WHATSAPP_NUMBER}"
WHATSAPP_INTERNATIONAL_NUMBER="${WHATSAPP_INTERNATIONAL_NUMBER}"
WHATSAPP_DISPLAY_NUMBER="${WHATSAPP_DISPLAY_NUMBER}"
WHATSAPP_BUSINESS_NAME="${WHATSAPP_BUSINESS_NAME}"
ADMIN_BOOTSTRAP_EMAIL="${ADMIN_BOOTSTRAP_EMAIL}"
ADMIN_BOOTSTRAP_PASSWORD="${ADMIN_BOOTSTRAP_PASSWORD}"
JWT_SECRET="${JWT_SECRET}"
AUTH_SECRET="${AUTH_SECRET}"
SESSION_SECRET="${SESSION_SECRET}"
CRON_SECRET="${CRON_SECRET}"
HIGHER_STUDY_REFERRAL_SECRET="${HIGHER_STUDY_REFERRAL_SECRET}"
ENGLISH_LEARNING_REFERRAL_SECRET="${ENGLISH_LEARNING_REFERRAL_SECRET}"
EOF
chmod 600 .env

echo "[remote-setup] .env written with mode 0600 (configured keys: NODE_ENV, PORT, DATABASE_URL, NEXT_PUBLIC_SITE_URL, EMAIL_FROM, ADMIN_BOOTSTRAP_EMAIL, JWT_SECRET, AUTH_SECRET, SESSION_SECRET, CRON_SECRET, HIGHER_STUDY_REFERRAL_SECRET, ENGLISH_LEARNING_REFERRAL_SECRET)."

# ── 4. Validate schema, generate client, and deploy migrations safely ───────
if [[ "$DATABASE_URL" == mysql://* || "$DATABASE_URL" == mariadb://* ]]; then
  echo "[remote-setup] Detected MySQL/MariaDB DATABASE_URL — using prisma/schema.mysql.prisma and prisma.config.mysql.ts"
  npm run db:validate -- mysql
  npm run db:generate -- mysql
  if [[ "${SKIP_MIGRATE_DEPLOY:-0}" != "1" ]]; then
    npm run db:migrate:deploy -- --config prisma.config.mysql.ts
  fi
elif [[ "$DATABASE_URL" == file:* ]]; then
  echo "[remote-setup] Detected SQLite DATABASE_URL — using prisma/schema.prisma"
  npm run db:validate
  npm run db:generate
  if [[ "${SKIP_MIGRATE_DEPLOY:-0}" != "1" ]]; then
    node scripts/apply-sqlite-migrations.mjs "${DATABASE_URL#file:}"
  fi
else
  echo "[remote-setup] ERROR: Unsupported DATABASE_URL scheme (expected mysql://, mariadb://, or file:)." >&2
  exit 1
fi

echo "[remote-setup] Setup completed successfully."
