# Deployment Architecture
# ========================
#
# ALAMINN Production Deployment Stack
# ----------------------------------
#   - Domain:    https://alaminn.info
#   - Server:    ALO-Education (100.72.91.1 via Tailscale)
#   - OS:        Ubuntu
#   - Stack:     Node.js 24.22.0, npm 11.19.1
#   - Framework: Next.js 16.4.2, React 19.3.1
#   - ORM:       Prisma 6.12.0 with SQLite
#   - Process:   PM2 application "alaminn-info"
#   - CI/CD:     GitHub Actions (manual approval required)

# ─────────────────────────────────────────────────────────────────────
# Directory Structure
# ─────────────────────────────────────────────────────────────────────
# /var/www/alaminn.info/
#   ├── current -> releases/20240101-120000   (active symlink)
#   ├── releases/
#   │   ├── 20240101-120000/   # release 1
#   │   ├── 20240101-130000/   # release 2 (current)
#   │   └── ...
#   ├── backups/               # SQLite backups
#   ├── logs/
#   │   ├── out.log
#   │   └── error.log
#   └── .env                   # Production environment variables (NOT in git)

# ─────────────────────────────────────────────────────────────────────
# Deployment Flow
# ─────────────────────────────────────────────────────────────────────
#
# 1. Developer pushes to feature branch → CI runs (typecheck, lint, tests, build)
# 2. CI passes → Pull Request opened against main
# 3. PR approved and merged to main
# 4. Deployment NOT automatic — requires manual workflow_dispatch with approval
# 5. GitHub Actions deploy job:
#    a. Connects via SSH using Tailscale host key
#    b. Creates versioned release directory
#    c. Builds production app from target commit
#    d. Switches symlink to new release
#    e. Reloads PM2 service
#    f. Runs health check → if fail, rollback to previous release
#
# ─────────────────────────────────────────────────────────────────────
# Safety Gates
# ─────────────────────────────────────────────────────────────────────
#   ✅ Manual approval required before any deployment
#   ✅ Versioned releases — previous release always kept
#   ✅ Automatic rollback on health check failure
#   ✅ SQLite backup before destructive operations
#   ✅ Deploy user (least privilege) — never root
#   ✅ SSH host key verification via known_hosts
#   ✅ SQLite .backup command (never file copy)
#   ✅ No automatic database migrations — manual only
#   ✅ No changes to /root directory permissions
#   ✅ No modifications to other PM2 services
#   ✅ No DNS/Tailscale/reverse-proxy changes without approval

# ─────────────────────────────────────────────────────────────────────
# GitHub Secrets Required
# ─────────────────────────────────────────────────────────────────────
#   DEPLOY_HOST      = 100.72.91.1
#   DEPLOY_USER      = deploy
#   DEPLOY_SSH_KEY   = contents of ~/.ssh/alaminn-github-deploy
#   DEPLOY_HOST_KEY  = ssh-keyscan output from 100.72.91.1
#   TS_OAUTH_CLIENT_ID = (from Tailnet)
#   TS_OAUTH_SECRET    = (from Tailnet)
#
# These secrets are already configured per user instructions — never print them.

# ─────────────────────────────────────────────────────────────────────
# Rollback Procedure
# ─────────────────────────────────────────────────────────────────────
# Automatic rollback:
#   1. Health check fails after deployment
#   2. deploy.yml job switches symlink back to previous release
#   3. PM2 reloads previous release
#   4. Job fails loudly — manual intervention required
#
# Manual rollback:
#   ./deploy/rollback.sh --force   (restores previous release)
#   OR via GitHub Actions: versioned-release.yml with action=rollback

# ─────────────────────────────────────────────────────────────────────
# Backup Procedure
# ─────────────────────────────────────────────────────────────────────
# Before any destructive operation:
#   ./deploy/backup-sqlite.sh
#
# Verify backup:
#   ./deploy/verify-backup.sh ./backups/alaminn-info-backup-*.sqlite
#
# Restore (emergency only):
#   ./deploy/restore-sqlite.sh ./backups/alaminn-info-backup-*.sqlite \
#     --confirm-destructive

# ─────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────
# Check application health:
#   curl http://127.0.0.1:3076/api/health
#   Expected: HTTP 200 with status "healthy"
#
# Run full health check:
#   ./deploy/healthcheck.sh

# ─────────────────────────────────────────────────────────────────────
# PM2 Commands
# ─────────────────────────────────────────────────────────────────────
# Start:     pm2 start deploy/ecosystem.pm2.cjs --env production
# Reload:    pm2 reload alaminn-info --update-no-deps
# Restart:   pm2 restart alaminn-info
# Stop:      pm2 stop alaminn-info
# Logs:      pm2 logs alaminn-info
# Status:    pm2 status
# Save:      pm2 save
# Startup:   pm2 startup

# ─────────────────────────────────────────────────────────────────────
# Production Safety — Do NOT
# ─────────────────────────────────────────────────────────────────────
#   ❌ Do NOT use root SSH — use deploy user
#   ❌ Do NOT change /root directory permissions
#   ❌ Do NOT modify other PM2 services
#   ❌ Do NOT run destructive database migrations
#   ❌ Do NOT migrate SQLite to MySQL
#   ❌ Do NOT delete production website files, database, or uploads
#   ❌ Do NOT change DNS, Tailscale, or reverse-proxy without approval
#   ❌ Do NOT enable automatic production deployment until safety gates pass
#   ❌ Do NOT force-push Git history without approval
