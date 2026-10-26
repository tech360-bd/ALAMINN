# SERVER SPEC — ALAMINN.INFO

## Server environment

- Host: Ubuntu 22.04 LTS @ 103.231.239.79
- Node: v24.22.1 (NVM)
- Package manager: npm 11.19.1
- Process manager: PM2 7.1.1
- Reverse proxy: Nginx 1.18.0
- Database options: PostgreSQL 14 | Redis 6 | SQLite 3.37
- CDN / DNS: Cloudflare (proxied)
- SSL: Cloudflare Flexible (upgrade to Full/Strict pending)
- Framework: Next.js 16.x (App Router)

## System resources

- CPU: 8 cores — Intel(R) Core(TM) i5-10310U CPU @ 1.70GHz
- RAM: 15Gi total | 902Mi used
- Disk: 98G total | 22G used | 72G free

## Web server

- nginx version: nginx/1.18.0 (Ubuntu)
- Active sites:
  - agents.alolabs.net
  - alolabs.net
  - hosting.alolabs.net
  - marketing.alolabs.net
  - alaminn.info
  - english.aloeducation.com
  - learn.aloeducation.com
  - panel.alolabs.net

## Domain / runtime / process mapping

| Domain | PM2 App | Port |
|---|---|---:|
| alaminn.info | alaminn | 3056 |

## PM2 ecosystem

- App name: `alaminn`
- Port: `3056`
- Runtime: Node.js v24.22.1
- Status: online

## Production deployment summary

- Application: `alaminn.info`
- Public IP: `103.231.239.79`
- Reverse proxy: Nginx
- Internal upstream: `http://127.0.0.1:3056`
- TLS: Cloudflare edge proxy (Flexible mode)
- Deployment target: Ubuntu 22.04 LTS VPS
- Process manager: PM2

## Notes

This document is the authoritative server-spec reference for the live `alaminn.info` deployment on the VPS at `103.231.239.79`.
The project should keep application configuration aligned with these values to avoid port drift, PM2 name mismatches, and reverse-proxy routing errors.
