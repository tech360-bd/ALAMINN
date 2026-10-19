# PRODUCTION VERIFICATION

Two layers: (A) what was verified externally during the 2026-09-30 audit, and (B) the on-server verification an operator with SSH must run to complete the evidence. Nothing here is claimed without its evidence source.

## A. Verified externally (2026-09-30, platform fetcher — no server access needed)

| Check | Result |
|---|---|
| `https://alaminn.info/` | HTTP 200, full homepage (hero, destinations, services, stats 12/24/8/30, AI advisor, ecosystem) |
| `https://www.alaminn.info/` | DNS resolves to the same IP; TLS fetch path verified for apex |
| DNS A records | `alaminn.info → 103.231.239.79`, `www → 103.231.239.79` |
| `/api/health` | 200 `{"success":true,"status":"ok"}` |
| `/higher-study` | 200 — full hub (30 destinations, featured universities w/ verification badges) |
| `/api/v1/admin/dashboard` (anonymous) | Rejected: `{"success":false,"errors":["unauthenticated"]}` |
| Content parity | Production content matches this repository's seed data exactly → production runs a recent build of this codebase |

## B. On-server verification (requires SSH — run `scripts/verify-production.sh`)

```bash
bash scripts/verify-production.sh          # project's own suite
# Manual spot checks:
systemctl status alaminn-info              # or: pm2 status   (identify the real manager)
ls -la /home/aloedu/apps/alaminn-source    # historical path — CONFIRM actual app dir + port (3076 historical)
cat /etc/caddy/Caddyfile /etc/caddy/sites/alaminn.info.caddy 2>/dev/null   # or nginx/OLS equivalents
openssl s_client -connect alaminn.info:443 -servername alaminn.info </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
mysql -e "SELECT 1" $DB                    # confirm MariaDB connectivity (never print credentials)
crontab -l                                 # confirm cron entries for /api/cron/* with CRON_SECRET
df -h && free -m                           # resources
```

## C. Post-deploy smoke checklist (any release)

- [ ] `/` → 200 with content
- [ ] `/higher-study`, `/english-learning`, `/work-with-me`, `/contact` → 200
- [ ] `/api/health` → 200 ok; `/api/health/deep` (authorized) → no degraded services
- [ ] `/api/v1/admin/dashboard` anonymous → 401; authorized login works
- [ ] Contact form: one controlled submission → success state (only after backend confirms)
- [ ] Referral flow: one test referral creation (dev-safe data), token verifies
- [ ] Security headers present (`curl -sI` → XCTO, XFO=DENY, CSP, RP, HSTS at the edge)
- [ ] TLS certificate valid & ≥25 days to expiry
- [ ] Static assets 200 (`/_next/static/…`, `/brand/portrait.webp`)
- [ ] No critical errors in app logs over the following 30 min
- [ ] Previous release still present on disk (rollback-ready)

## D. Known gaps in evidence (honest register)

| Item | Why not verified here |
|---|---|
| Process manager / app port / release dir | No SSH access from the audit sandbox |
| TLS issuer/expiry | Needs direct TLS handshake (blocked egress) |
| Production DB provider + migration status | No server/DB access |
| Production cron schedule | crontab unreadable without server access |
| Real email/WhatsApp delivery | Credentials not available; adapters verified in code + tests only |
| Lighthouse score | Requires full browser environment; not measured — report actuals when run |
