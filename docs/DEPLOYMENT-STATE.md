# DEPLOYMENT STATE — ALAMINN.INFO

Audit date: 2026-10-26.

## 1. Live production (verified externally)

| Item | State |
|---|---|
| Domain | `alaminn.info` — **LIVE**, serving the current application |
| IP (A record) | `103.231.239.79` |
| HTTPS | Working via Cloudflare / Nginx proxy |
| PM2 app | `alaminn` |
| Port | `3056` |
| Health endpoint | `/api/health` |
| Reverse proxy | Nginx 1.18.0 |
| Runtime | Node.js `v24.22.1` |
| Process manager | PM2 `7.1.1` |
| OS | Ubuntu 22.04 LTS |

## 2. Deployment artifacts inventory

| Artifact | Purpose | Status |
|---|---|---|
| `Dockerfile` / `docker-compose.yml` | Container deployment | Present |
| `Caddyfile` | Caddy reverse proxy | Present |
| `deploy/nginx-alaminn-info.conf` | Nginx vhost + TLS | Current |
| `deploy/ols-vhost.conf` | OpenLiteSpeed vhost | Present |
| `deploy/alaminn-info.service` | systemd unit | Present |
| `deploy/ecosystem.pm2.cjs` | PM2 process config | Current |
| `deploy/install.sh` / `deploy/deploy.sh` | Server provisioning / release install | Present |
| `start-prod.sh` | Server launcher | Present |
| `server.js` | App entrypoint | Present |

## 3. Live configuration

- Public domain: `alaminn.info`
- PM2 app name: `alaminn`
- Internal upstream: `http://127.0.0.1:3056`
- Public IP: `103.231.239.79`
- Reverse proxy: Nginx
- TLS: Cloudflare Flexible / edge proxy

## 4. Known deployment constraints

1. The app should consistently use the same upstream port on all deployment config files.
2. Reverse proxy, PM2, and systemd configuration must match the live runtime port.
3. `SERVER-SPEC.md` is the permanent repository record for the server stack and runtime state.
