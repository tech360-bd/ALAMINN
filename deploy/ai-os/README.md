# ALAMINN AI-OS — self-hosted AI & automation microservice stack

This directory deploys the **AI-OS stack**: LibreChat, LiteLLM, Open-WebUI,
Activepieces, Temporal, Directus, NocoBase and Rocket.Chat — the open-source
AI & automation ecosystem that connects to ALAMINN through the
**ecosystem bridge** (`/api/v1/ecosystem/*` on the main site).

## Architecture (production-safe hybrid)

```
                    ┌─────────────────────────────────────────────┐
 Internet ──TLS──►  │ nginx (deploy/nginx-ai-os.conf)              │
                    │   ai-os.alaminn.info/{litellm,librechat,…}  │
                    └──────────────┬──────────────────────────────┘
                                   │ host ports 4000/3080/8080/8081/8055/8082/3083
                    ┌──────────────▼──────────────────────────────┐
                    │ docker network "ai-os" (isolated)           │
                    │  litellm · librechat · open-webui           │
                    │  activepieces · temporal(+pg)               │
                    │  directus · nocobase · postgres · redis     │
                    │  rocket-chat (+mongo replica set)           │
                    └──────────────┬──────────────────────────────┘
                                   │ ecosystem bridge (HTTPS + API key + HMAC)
                    ┌──────────────▼──────────────────────────────┐
                    │ alaminn.info (Next.js app — stays as is)    │
                    │ /api/v1/ecosystem/{leads,applications,     │
                    │                    copilot,health}          │
                    └─────────────────────────────────────────────┘
```

**Why hybrid:** the Next.js app never vendors this code (GPL/AGPL projects stay
separate services), the build stays small (no OOM), and every connection is a
plain HTTPS call with an API key — registered and health-tested from
`/admin/integrations`.

## 1. Prerequisites

- A VPS with Docker Engine 24+ and ~7.5 GB free RAM for the full stack
  (each service has a memory limit: ~9.5 GB total ceiling, typically ~4–5 GB
  at idle) plus the existing ALAMINN app
- DNS record `ai-os.alaminn.info` → the VPS
- Ports 4000, 3080, 8080, 8081, 8055, 8082, 3083 bound to 127.0.0.1 only.
  Rocket.Chat publishes `127.0.0.1:3083`; the other services are reached by
  docker network aliases where the host nginx runs inside the network or by
  publishing the same 127.0.0.1-only mapping locally if needed.

## 2. Deploy the stack (VPS commands)

```bash
cd /opt/alaminn/ALAMINN            # wherever the repo lives on the server
cd deploy/ai-os

# 1) secrets
cp .env.ai-os.example .env.ai-os
$EDITOR .env.ai-os                 # fill every value (openssl rand -hex 32)

# 2) start (isolated network, memory limits, healthchecks)
docker compose -f docker-compose.ai-os.yml --env-file .env.ai-os up -d

# 3) watch the healthchecks turn healthy
docker compose -f docker-compose.ai-os.yml ps
docker compose -f docker-compose.ai-os.yml logs -f --tail=50
```

## 3. Wire the nginx reverse proxy

```bash
sudo cp ../nginx-ai-os.conf /etc/nginx/sites-available/ai-os
sudo ln -sf /etc/nginx/sites-available/ai-os /etc/nginx/sites-enabled/
sudo certbot --nginx -d ai-os.alaminn.info
sudo nginx -t && sudo systemctl reload nginx
```

Then verify from the server: `curl -sf http://127.0.0.1:4000/health/liveliness`.

## 4. Connect the stack to ALAMINN

On the ALAMINN app server (or hosting panel), set:

```
ALAMINN_ECOSYSTEM_API_KEY=<openssl rand -hex 32>     # min 32 chars
```

Restart the app, then in `/admin/integrations` register each service:

| Service | Base URL | Credentials |
| --- | --- | --- |
| LiteLLM | `https://ai-os.alaminn.info/litellm` | master key (LITELLM_MASTER_KEY) |
| LibreChat | `https://ai-os.alaminn.info/librechat` | — (staff login) |
| Open-WebUI | `https://ai-os.alaminn.info/openwebui` | — (staff login) |
| Activepieces | `https://ai-os.alaminn.info/activepieces` | account key |
| Temporal | `127.0.0.1:7233` (internal/VPN only) | — |
| Directus | `https://ai-os.alaminn.info/directus` | static token |
| NocoBase | `https://ai-os.alaminn.info/nocobase` | API token |
| Rocket.Chat | `https://ai-os.alaminn.info/rocketchat` | admin login (staff chat) |

Each entry has a **Test connection** button (SSRF-safe probes, real health
endpoints). Secrets are AES-encrypted at rest; the UI only shows masks.

## 5. Use the ecosystem bridge

Give the AI-OS services one key each (or the shared env key) and call:

```bash
KEY="$ALAMINN_ECOSYSTEM_API_KEY"
BASE="https://alaminn.info/api/v1/ecosystem"

# health / service status
curl -H "X-Api-Key: $KEY" $BASE/health

# create a lead (dedupes; scores; fires automation + webhooks)
curl -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"fullName":"Rahim Uddin","email":"rahim@example.com","country":"Bangladesh","tags":"lead,whatsapp"}' \
  $BASE/leads

# create a Higher Study application
curl -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"referralType":"course-application","targetUrl":"https://alo.example/course","countrySlug":"uk"}' \
  $BASE/applications

# AI copilot action (routed via LiteLLM master key first)
curl -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"Draft a follow-up for a student asking about January intakes"}' \
  $BASE/copilot
```

Optional HMAC signing (recommended for Temporal workers):

```bash
TS=$(date +%s)
BODY='{"fullName":"Rahim Uddin","email":"rahim@example.com"}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$KEY" -hex | awk '{print $2}')
curl -X POST -H "X-Api-Key: $KEY" \
     -H "X-ALAMINN-Signature: t=$TS,v1=$SIG" \
     -H "Content-Type: application/json" \
     -d "$BODY" $BASE/leads
```

Signatures are optional but **fail closed**: a present-but-invalid signature
always rejects; timestamps older than 5 minutes reject.

## 6. Admin surfaces on the main site

- `/admin/api-platform` — API keys (scopes, rate limits), outbound webhooks
  (HMAC-signed, with delivery retry + audit), usage metrics per key/route
- `/admin/automation` — trigger rules + follow-up email sequences (the
  15-minute cron `/api/cron/automation-queue` sends due consent-checked steps)
- `/admin/aeo` — LLM-readiness audit, citation tracking, content gaps
- `/admin/integrations` — the connector registry incl. all AI-OS services

## 7. PaaS alternatives

**CapRover:** create a One-Click Docker Compose app from
`docker-compose.ai-os.yml` (paste the file, replace `${VAR}`s), or deploy the
minimal LiteLLM gateway from `captain-definition` + `Dockerfile.ai-os`.

**Dokku:** the `Procfile` deploys the LiteLLM gateway as a Dokku app
(`git push dokku ai-os:main` after `dokku apps:create alaminn-litellm` and
setting `LITELLM_MASTER_KEY`). Run the full stack with the host compose file.

## 8. Operations

- **Backups:** `docker run --rm -v alaminn-ai-os_postgres-data:/data -v $PWD:/backup alpine tar czf /backup/ai-os-pg.tgz /data`
  (repeat for the other named volumes). Also export LiteLLM virtual-key config.
- **Upgrades:** `docker compose -f docker-compose.ai-os.yml pull && docker compose -f docker-compose.ai-os.yml --env-file .env.ai-os up -d`
- **Memory:** total ceiling ≈ 9.5 GB including Rocket.Chat + Mongo (`docker stats`);
  lower the per-service `deploy.resources.limits.memory` values on small VPSes —
  healthchecks fail fast if a limit is too low. Mongo runs with a replica set
  (Rocket.Chat requires oplog/transactions); the one-shot `mongo-init-replica`
  service initializes it on first `up`.
- **Licensing:** NocoBase is AGPL-3.0 and Directus is BSL-1.1 — they run as
  separate network services (no code sharing), which is the intended use here.
  Rocket.Chat community edition has an MIT core with a separately licensed
  `ee/` enterprise directory — the compose image is the free community build.
