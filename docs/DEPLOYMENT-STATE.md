# DEPLOYMENT STATE — ALAMINN.INFO

Audit date: 2026-09-30.

## 1. Live production (verified externally)

| Item | State |
|---|---|
| Domain | `alaminn.info` — **LIVE**, serving the current application |
| IP (A record) | `103.231.239.79` (also `www`) |
| HTTPS | Working (successful TLS fetch of homepage, `/api/health`, `/higher-study`) |
| Health endpoint | `/api/health` → 200 `status: ok` |
| Anonymous admin access | Rejected (`unauthenticated`) on `/api/v1/admin/dashboard` |
| Content parity | Production content matches this repository's seed exactly (12 universities / 24 courses / 8 scholarships / 30 destinations) — production runs a recent build |

**Not verifiable without server access** (owner or `scripts/verify-production.sh` on the host):
- OS/runtime versions, process manager (PM2/systemd/cPanel), active release directory & port (historically `/home/aloedu/apps/alaminn-source`, port `3076` — UNCONFIRMED)
- Reverse proxy in use (Caddy vs Nginx vs OpenLiteSpeed — all three configs exist in repo)
- TLS certificate issuer/expiry/renewal
- Production database provider/state (MariaDB vs SQLite) and backup schedule
- Production cron scheduler entries

## 2. Deployment artifacts inventory (all present in repo)

| Artifact | Purpose | Status |
|---|---|---|
| `Dockerfile` / `docker-compose.yml` | Container deployment (Next standalone) | Current (targets Node ≥20, standalone output) |
| `Caddyfile` | Caddy reverse proxy (auto-HTTPS) | Present; domain `alaminn.info` |
| `deploy/nginx-alaminn-info.conf` | Nginx vhost + TLS | Present |
| `deploy/ols-vhost.conf` | OpenLiteSpeed vhost | Present |
| `deploy/alaminn-info.service` | systemd unit | Present |
| `deploy/ecosystem.pm2.cjs` | PM2 process config | Present |
| `deploy/install.sh` / `deploy/deploy.sh` | Server provisioning / release install | Present |
| `deploy/mariadb-init.sql` | Production DB bootstrap | Present (production targets MariaDB) |
| `deploy/cpanel/setup-cpanel.sh`, `redeploy.sh` | cPanel Node.js app deployment | Present — matches `server.js` startup-file pattern |
| `scripts/install-server.sh`, `scripts/deploy-cyberpanel.sh` | VPS/CyberPanel installers | Present |
| `scripts/verify-production.sh` | Post-deploy verification suite | Present (must be run ON the server) |
| `scripts/backup.sh` / `restore.sh` / `verify-backup.sh` | DB + config backup/restore | Present |
| `start-prod.sh` | Standalone launcher; generates `AUTH_SECRET`/`CRON_SECRET`/referral secrets once into `.env.prod-secrets` (chmod 600) | Present |
| `server.js` | cPanel/VPS entry: loads root `.env`, sets NODE_ENV, boots `.next/standalone/server.js`, graceful shutdown | Present |

**Architecture rule confirmed:** only ONE reverse proxy should terminate TLS on the host. The artifacts support Caddy, Nginx, and OLS — the operator must pick per actual server. Do not enable multiple simultaneously.

## 3. Release process (documented + encoded in scripts)

1. `npm ci` → `npm run build` (standalone output, copies `static` + `public`)
2. Install to a versioned release directory; keep previous release intact
3. `.env` lives OUTSIDE the build (root); `server.js` loads it
4. Run reviewed migrations (`prisma migrate deploy` against MariaDB) — never dev seed against production
5. Start new release (separate port), health-check `/api/health`, smoke pages, then switch proxy upstream
6. Rollback = switch proxy back to previous release directory + restart

## 4. CI/CD (GitHub Actions)

- **Current state:** BROKEN — the repository contains only an auto-generated `NodeJS with Webpack` workflow (`.github/workflows/webpack.yml`) whose run failed (`npx webpack` — webpack is not part of this stack).
- **This branch** adds a proper pipeline: install (lockfile) → typecheck → lint → test → security → build → artifact validation. See `.github/workflows/ci.yml`.
- **Deployment workflow** (`.github/workflows/deploy.yml`) is included but inert until the owner configures repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`. It deploys only on manual approval (`workflow_dispatch` + environment gate) and runs post-deploy health checks with automatic rollback guidance.

## 5. Known deployment constraints

1. **Prisma engines at build time:** the build host must reach `binaries.prisma.sh` (default). In restricted networks set `PRISMA_ENGINES_MIRROR` to a mirror. (Sandbox used a verified GitHub mirror — checksums validated.)
2. **Google Fonts:** no longer required at build time (fonts are self-hosted since this branch).
3. **SQLite relative path:** under `output: "standalone"`, use an absolute `DATABASE_URL` (or MariaDB) — documented in `.env.example`.
4. **Secrets:** `AUTH_SECRET`, `CRON_SECRET`, `HIGHER_STUDY_REFERRAL_SECRET`, `ENGLISH_LEARNING_REFERRAL_SECRET` must be ≥32 chars and stable across restarts (session invalidation otherwise). `start-prod.sh` persists them safely.
