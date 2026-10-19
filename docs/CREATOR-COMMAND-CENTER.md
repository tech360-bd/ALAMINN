# CREATOR COMMAND CENTER — GUIDE

Status 2026-09-30: the private admin dashboard at `/admin` is implemented, session-protected, RBAC-gated, and **verified** (routes build, APIs return 401 anonymously, authorized flows work locally; production admin correctly rejects anonymous access). This guide maps the required creator modules to the implementation and marks what remains.

## 1. Module map

| # | Required module | Implementation | Status |
|---|---|---|---|
| 1 | Overview | `/admin` dashboard + `/api/v1/admin/dashboard` | VERIFIED (401 anonymous; data authorized) |
| 2 | AI Content Generator | `/admin/ai-assistant` + `/api/v1/ai/tasks` + AiTask/AiApproval models | IMPLEMENTED — live generation needs an AI provider credential |
| 3 | Blog Manager | `/admin/articles` + Article model (draft/publish states, SEO fields) | VERIFIED (build + API) |
| 4 | Newsletter Manager | `/admin/newsletter` + double-opt-in pipeline | VERIFIED (subscription flow tested) |
| 5 | Social Media Manager | `/admin/whatsapp-ai` (WhatsApp agent console) | PARTIAL — WhatsApp only; other platforms blocked (see SOCIAL-MEDIA-INTEGRATIONS.md) |
| 6 | Campaign Calendar | Meetings/tasks/notifications modules | PARTIAL — no unified calendar view yet |
| 7 | Media Library | `/admin/media` + hardened `/api/v1/admin/uploads` | VERIFIED (magic-byte + sharp validation, tests pass) |
| 8 | Automation Center | 11 cron endpoints + 5 mini-service workers | IMPLEMENTED — production scheduler needs server verification |
| 9 | Analytics | `/admin/analytics` (Recharts) + AnalyticsEvent model | VERIFIED |
| 10 | CRM & Leads | Contacts, inquiries, meetings, opportunities, companies | VERIFIED (round-trip tested) |
| 11 | Approval Queue | `/admin/approvals` + AiApproval (approval gates for AI actions) | VERIFIED (seeded example; API enforced) |
| 12 | Users & Roles | `/admin/users`, `/admin/roles` — 11 roles | VERIFIED (RBAC test suite 22/22) |
| 13 | Integration Settings | `/admin/settings` (8 defaults seeded) | VERIFIED |
| 14 | Audit Logs | `/admin/audit-logs` + retention pruning cron | VERIFIED (pruning tested with old-row delete) |

## 2. AI content pipeline (how it works)

1. An AI task is created (`AiTask`) with type/copy/language (EN/BN fields exist in schema).
2. A worker (`mini-services/ai-worker` or API route with provider SDK) executes it.
3. Output becomes a draft (article/social/newsletter) — **never auto-published**.
4. Drafts pass through the Approval Queue (`AiApproval`) per the configured policy; only approved content can be published by a CONTENT_MANAGER/OWNER.

**Blocked item:** no AI provider credential is configured in the sandbox, so live generation was not executed. Owner action: set the provider key (z-ai-web-dev-sdk or OpenAI) in the production `.env`.

## 3. Publishing rules (enforced)

- AI output requires approval before publishing (approval gates in code).
- All privileged admin actions write audit logs (`AuditLog` + module logs).
- Sessions are HMAC-signed, HttpOnly, SameSite=Lax, 8 h expiry; brute-force lockout is active.

## 4. Operating notes

- Admin bootstrap: `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` (≥12 chars) at seed time; rotate the production password via `/admin/users` after handover.
- Audit-log retention: weekly `GET /api/cron/audit-log-prune` (x-cron-secret) prunes logs older than `AUDIT_LOG_RETENTION_DAYS` (default 365, floor 30).
- Media uploads: admin-only, MIME allowlist, 10 MB cap, magic-byte signature validation, sharp decode + true dimensions, server-derived extensions. Executables/disguised files are rejected (tested).
