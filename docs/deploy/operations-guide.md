# ALAMINN.INFO — Deployment Operations Guide

> Per spec §18: exact commands for initial setup, preflight, deployment, verification, and recovery.

## Prerequisites

### GitHub repository configuration

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `100.94.234.101` (Tailscale IP of `alo-server-lap`) |
| `DEPLOY_HOST_KEY` | Pinned SSH public host key (ed25519 base64) |
| `DEPLOY_SSH_KEY` | SSH private key for user `alamin` (PEM format) |
| `DEPLOY_USER` | `alamin` |
| `DEPLOY_PORT` | `22` (or custom port) |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret |

**Variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value | Purpose |
|---|---|---|
| `DEPLOY_ENABLED` | `false` | **Mandatory gate.** Set to `true` only when you want to allow deploys. |
| `TS_TAG` | `ci-deploy` | Tailscale authorized tag for the CI runner |

### Tailscale setup

1. Create a Tailscale OAuth client at https://login.tailscale.com/admin/settings/oauth
2. Grant it the `ci-deploy` tag with `Write` ACL to the production server.
3. Ensure the ACL policy allows the `ci-deploy` tag to SSH to `alo-server-lap`:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:ci-deploy"],
      "dst": ["alo-server-lap:22", "100.94.234.101:22"]
    }
  ]
}
```

### Production server setup (one-time)

On `alo-server-lap` as user `alamin`:

```bash
mkdir -p /home/alamin/alaminn/{releases,staging,backups}
cp .env.example /home/alamin/alaminn/.env
nano /home/alamin/alaminn/.env  # Fill in production values
pm2 list  # Verify 'alaminn' app exists
curl -s http://127.0.0.1:3056/api/health  # Verify health
```

## 1. Initial setup (preflight only)

```bash
gh workflow run deploy.yml --ref main -f preflight_only=true
gh run watch
```

## 2. Preflight check (before every deploy)

```bash
gh workflow run deploy.yml --ref main -f preflight_only=true
gh run watch
```

## 3. Deployment

### Step 1: Enable deployment
```bash
gh variable set DEPLOY_ENABLED --body "true"
```

### Step 2: Verify CI is green
```bash
gh run list --workflow=ci.yml --branch=main --limit=1
```

### Step 3: Trigger the deploy
```bash
gh workflow run deploy.yml --ref main
# OR deploy a specific commit:
gh workflow run deploy.yml --ref main -f commit=<SHA>
gh run watch
```

### Step 4: Approve the production environment
Approve in GitHub web UI when the `deploy` job requests it.

### Step 5: Disable deployment after deploy
```bash
gh variable set DEPLOY_ENABLED --body "false"
```

## 4. Verification

```bash
# Health check
curl -s https://alaminn.info/api/health | jq .

# Homepage
curl -s -o /dev/null -w '%{http_code}\n' https://alaminn.info/  # Expected: 200

# Higher Study portal
curl -s -o /dev/null -w '%{http_code}\n' https://alaminn.info/higher-study  # Expected: 200

# Authn-negative (admin API must reject anonymous)
curl -s -o /dev/null -w '%{http_code}\n' https://alaminn.info/api/v1/admin/dashboard  # Expected: 401 or 403
```

### Verify on the server (via Tailscale SSH)
```bash
ssh alamin@100.94.234.101
pm2 list
readlink -f /home/alamin/alaminn/current
cat /home/alamin/alaminn/.last-good-release
curl -s http://127.0.0.1:3056/api/health
```

## 5. Recovery (rollback)

### Option A: Automatic rollback (during failed deploy)
If the deploy job's health check fails, the trap-based rollback fires automatically.

### Option B: Manual rollback (post-deploy discovery)
```bash
gh workflow run versioned-release.yml --ref main -f action=rollback
gh run watch
```

### Option C: List available releases (read-only)
```bash
gh workflow run versioned-release.yml --ref main -f action=list
gh run watch
```

### Emergency: manual SSH rollback
```bash
ssh alamin@100.94.234.101
ls -1dt /home/alamin/alaminn/releases/*/
cat /home/alamin/alaminn/.last-good-release
ln -sfn /home/alamin/alaminn/releases/<release-id> /home/alamin/alaminn/current.new
mv -Tf /home/alamin/alaminn/current.new /home/alamin/alaminn/current
pm2 reload alaminn --update-no-deps
curl -s http://127.0.0.1:3056/api/health
```

## Troubleshooting

### "DEPLOY_ENABLED variable is not 'true'"
```bash
gh variable set DEPLOY_ENABLED --body "true"
```

### "Secret X is not configured"
Add the missing secret in GitHub repo settings → Secrets and variables → Actions → Secrets.

### "SSH access failed"
1. Verify Tailscale is running on the production server: `sudo tailscale status`
2. Verify the OAuth client has the `ci-deploy` tag
3. Verify the ACL policy allows `tag:ci-deploy` → `alo-server-lap:22`
4. Verify the `DEPLOY_HOST_KEY` matches the server's actual host key

### "PM2 app 'alaminn' does not exist"
The server has a different PM2 app name. **Do not modify other PM2 apps** (per spec §11).

### "Health check failed"
1. Check PM2 logs: `pm2 logs alaminn --lines 50`
2. Verify the `.env` file exists at `/home/alamin/alaminn/current/.env`
3. Verify the database is accessible
4. Check if port 3056 is in use: `ss -tlnp | grep 3056`

## Important constraints

- **Never** set `DEPLOY_ENABLED=true` and leave it — always reset to `false` after deploy.
- **Never** use `ssh-keyscan` in the workflow — always use the pinned `DEPLOY_HOST_KEY`.
- **Never** run `prisma migrate deploy` automatically — only `prisma migrate status`.
- **Never** run `db:seed` in production.
- **Never** modify other PM2 apps on the server.
- **Never** print credentials in logs.
- **Always** run preflight before the first deploy to a new server.
- **Always** verify the live site after deploy.
- **Always** reset `DEPLOY_ENABLED=false` after a successful deploy.
