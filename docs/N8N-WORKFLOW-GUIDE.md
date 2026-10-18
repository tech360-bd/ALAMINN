# N8N WORKFLOW GUIDE — STATUS & INTEGRATION CONTRACT

Status 2026-09-30: **BLOCKED — no n8n instance or credentials are available.** The referenced archive *"4000 N8N Workflow Automation Templates By ExclusiveTechAccess (1).rar.zip"* is **NOT present** in the repository (verified by filesystem search). No workflows were imported, and none will be claimed as installed.

## Why blocked

- n8n is a self-hosted/external automation platform — it is not part of this Next.js codebase.
- Importing untrusted third-party workflow packs is explicitly disallowed by project rules (arbitrary code execution / credential exposure risk).

## Owner actions to unblock

1. Provision n8n (self-host on the production VPS or n8n.cloud).
2. Store platform credentials in n8n's own credential store (never in this repo).
3. Whitelist this app's webhook endpoints in n8n and configure the shared secret.

## Integration contract (this app's side — already supported)

The application exposes CRON_SECRET-guarded endpoints that n8n can drive on schedules:

| Endpoint | Purpose |
|---|---|
| `GET /api/cron/email-queue` | Process pending outbound email |
| `GET /api/cron/notification-queue` | Dispatch notifications |
| `GET /api/cron/referral-retry` | Retry unconfirmed ALO referrals |
| `GET /api/cron/phd-deadlines` | Refresh PhD deadline data |
| `GET /api/cron/scholarship-deadlines` | Refresh scholarship deadlines |
| `GET /api/cron/backup` | Trigger DB backup |
| `GET /api/cron/data-verification` | Verify DB integrity |
| `GET /api/cron/session-cleanup` | Expire stale sessions |
| `GET /api/cron/sitemap-generate` | Regenerate/ping sitemap |
| `GET /api/cron/temp-cleanup` | Purge `storage/temporary` (>24 h) |
| `GET /api/cron/audit-log-prune` | Prune logs beyond retention |

**Auth:** every call must send `x-cron-secret: <CRON_SECRET>` (header preferred over query param). 401 otherwise.

## Recommended workflows (when n8n exists)

1. **Blog publishing** — n8n Schedule → `POST /api/v1/ai/tasks` (draft) → approval webhook → publish approved article.
2. **Newsletter delivery** — n8n Schedule → `/api/cron/email-queue`.
3. **Inquiry notifications** — n8n Webhook ← inquiry API event → Telegram/Email alert.
4. **Referral events** — n8n Schedule → `/api/cron/referral-retry`.
5. **Backups & maintenance** — n8n Schedule → `/api/cron/backup` + `/api/cron/temp-cleanup` + `/api/cron/audit-log-prune`.

Rules for any imported workflow: review every node, disable arbitrary `Execute Command` nodes, keep credentials in n8n's store, require the shared secret on inbound webhooks, and test in staging first.
