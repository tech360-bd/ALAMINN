# SERVER SPEC — ALAMINN.INFO

> **Authoritative runtime configuration for the production deployment.**
> Last verified: 2026-11-05.

## Production server

| Field | Value | Source |
|---|---|---|
| Hostname | `alo-server-lap` | Spec |
| Tailscale IP | `100.94.234.101` | Spec |
| SSH user | `alamin` | Spec |
| Application directory | `/home/alamin/alaminn` | Spec |
| PM2 app name | `alaminn` | Spec + `deploy/ecosystem.pm2.cjs:11` |
| Application port | `3056` | Spec + `deploy/ecosystem.pm2.cjs:18` |
| Domain | `https://alaminn.info` | Spec |
| Reverse proxy | Nginx | Existing |
| CDN/DNS | Cloudflare (proxied) | Existing |
| Framework | Next.js 16.x (App Router, standalone) | `package.json` |

## GitHub Actions secrets (per spec §2)

| Secret | Purpose |
|---|---|
| `DEPLOY_HOST` | Tailscale IP or hostname (`100.94.234.101`) |
| `DEPLOY_HOST_KEY` | Pinned SSH public host key (ed25519 base64) — **never** use `ssh-keyscan` |
| `DEPLOY_SSH_KEY` | SSH private key for the `alamin` deploy user |
| `DEPLOY_USER` | SSH username (`alamin`) |
| `DEPLOY_PORT` | SSH port (optional, default 22) |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID for runner auth |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret |

## GitHub Actions variables (per spec §3)

| Variable | Purpose |
|---|---|
| `DEPLOY_ENABLED` | **Mandatory deployment gate.** Must be `true` for any deploy to proceed. `false` = deployment blocked. |
| `TS_TAG` | Tailscale authorized tag for the CI runner (default: `ci-deploy`) |

## Directory layout on production server

```
/home/alamin/alaminn/                 # Application root
├── .env                              # Persistent environment file (NEVER committed)
├── .last-good-release                # Marker file: path to last verified-healthy release
├── current → releases/<release-id>/  # Symlink to the active release
├── releases/                         # Versioned release directories
│   ├── 20261105-120000Z-r123-abc123/
│   └── ...
├── staging/                          # Temporary upload area for tarballs
└── backups/                          # Pre-deploy database backups
    └── pre-deploy-<release-id>.db
```

## PM2 runtime

- **App name:** `alaminn` (NOT `alaminn-info`)
- **Port:** `3056` (NOT `3076`)
- **Start command:** `node .next/standalone/server.js`
- **CWD:** `/home/alamin/alaminn/current`

## Deployment workflow

1. **Guard:** Verify `DEPLOY_ENABLED=true` + CI green on target SHA.
2. **Preflight:** Tailscale auth → SSH access (pinned key) → PM2 app check → directory check.
3. **Build:** Checkout exact SHA → `npm ci` → `prisma generate` → `npm run build` → pack tarball + SHA256.
4. **Deploy:** Transfer tarball → verify checksum server-side → extract → DB backup → migration status (read-only) → atomic symlink swap → PM2 reload → health check on `:3056` → authn-negative check → public route smoke → write `.last-good-release`.
5. **Rollback:** `versioned-release.yml` workflow_dispatch with `action=rollback` restores `.last-good-release`.

## Health check endpoint

- **Internal:** `http://127.0.0.1:3056/api/health` (must return 200)
- **Authn-negative:** `http://127.0.0.1:3056/api/v1/admin/dashboard` (must return 401 or 403 for anonymous)
- **Public routes:** `/`, `/higher-study`, `/english-learning` (must return 200)

## Rollback

Run the `Versioned Release & Rollback` workflow with `action=rollback`. It:
1. Authenticates to Tailscale
2. SSHes using the pinned host key
3. Reads `/home/alamin/alaminn/.last-good-release`
4. Atomically swaps the `current` symlink
5. Reloads PM2 app `alaminn`
6. Verifies health on port `3056`

## Important notes

- **Never** use `ssh-keyscan` — always use the pinned `DEPLOY_HOST_KEY`.
- **Never** run `prisma migrate deploy` automatically — only `prisma migrate status` (read-only).
- **Never** run `db:seed` in production.
- **Never** modify other PM2 apps on the server (per spec §11).
- **Never** print production credentials in logs (per spec §13).
- The `DEPLOY_ENABLED` variable is a **mandatory gate** — even if all other checks pass, deployment is blocked when it is not `true`.
