# ALAMINN Digital Command Centre — Baseline Audit

**Audit date:** 2026-11-23  
**Repository:** `tech360-bd/ALAMINN`  
**Branch / baseline:** `arena/12888c13-alaminn` / `63c9964f07285c9dfd73f1076f4389703a5717d3`  
**Scope:** Repository source, checked-in deployment configuration, schemas, workflows, and locally executable checks. Production host, production database, provider consoles, credentials, and real social accounts were not accessed.

> This is a baseline, not a claim that the requested command centre is production-ready. No live account, phone number, external API, AI video model, production database, or deployment was tested.

## 1. Repository and infrastructure audit — PASS (source-level only)

- The existing Next.js application and its admin/auth/API modules are present; this work does not create a replacement app.
- At audit time there were no open pull requests. The working tree contained the existing dependency/type/lint fixes on the active Arena branch; they are preserved.
- Checked-in package versions are Node `22.22.3`, Next.js `16.4.6`, Prisma `7.10.1`, and React `19.3.1`. This differs from the prompt's approximate Prisma `6.19.0` stack note; the checked-in manifests and Prisma schemas are the source of truth for this branch.
- The root PM2 configuration names the process `alaminn-info` and defaults to port `3056`. The checked-in systemd service also uses `3056`.
- **Deployment configuration discrepancy — FAIL / investigate before deployment:** `Caddyfile` currently proxies the application to `localhost:3000`, while the PM2/systemd/Nginx production configurations use `3056`. Several older deployment documents and scripts also refer to different roots and process-manager commands. No config was changed because production ownership and the active proxy were not verifiable here.
- The prompt's production directory `/home/alamin/alaminn` and the checked-in service examples' `/var/www/alaminn-info` could not be reconciled without production-host access. No production port, process, Nginx, Caddy, `.env`, or server file was touched.

## 2. Existing capability inventory

| Area | Current repository evidence | Status against requested outcome |
|---|---|---|
| Admin/auth | Protected `/admin` shell, session checks, permission-guarded APIs, roles, audit logs, notifications | **PASS** as an existing admin foundation; production access control not live-tested |
| Social account records | `SocialAccount` stores platform/external ID, encrypted token, capabilities, status, response mode and health metadata; admin account CRUD exists | **PARTIAL**; token-backed records now remain Pending until a health check verifies the provider API. OAuth onboarding/provider-permission grants still require owner setup. |
| Social publishing | Approval/scheduling records, publishing switch, cron publisher, idempotent claim steps; Facebook and Instagram adapters are implemented for limited post types | **PARTIAL**; only supported post types/capabilities are available; real provider accounts and publishing were not tested |
| Unified social inbox | Account-linked conversations/messages, search/status filters, reply/assignment endpoints, approval decisions | **PARTIAL**; UI does not yet expose all requested assignment, notes, filters and account-specific channel workflows; no real inbox data was verified |
| WhatsApp | Account-scoped SocialAccount sender, encrypted per-account token storage, multi-event webhook parsing, account-linked inbox persistence, persistent dedupe, Meta delivery-status updates, explicit account selection for manual sends | **PARTIAL; four-account live acceptance still BLOCKED.** Both WhatsApp webhook routes process every text event using Meta `metadata.phone_number_id`; missing IDs never fall back to a global sender. The established WhatsApp AI agent still creates the draft and lead/handoff effects, while outbound delivery is routed through the shared approval/automation policy. Four credential pairs are isolated in automated tests. Manual sends require a selected connected record and an inbound message within 24 hours; template sends are unavailable. Four real numbers, permissions and live delivery remain unverified. The older global sender remains exported for compatibility but is no longer called by these app routes.
| Other social platforms | Adapter registry explicitly returns unsupported for YouTube, LinkedIn, TikTok. No enabled adapters found for X, Threads, Pinterest or Telegram | **BLOCKED / unsupported** pending official API access and implementation. Facebook Groups are not represented as a verified capability. |
| AI content | Existing AI assistant, social personality and content draft APIs, templates/feature kits | **PARTIAL**; drafts/generation depend on configured providers and are not evidence of a complete owner-controlled content studio |
| AI agents | Agent UI, AI task/approval records and existing AI services are present | **PARTIAL / NOT TESTED live**; no evidence that the 25 proposed specialist agents are all configured, tool-scoped, monitored and operational |
| Video studio | `/admin/video-studio` is a storyboard/script editor with scene timing, text generation and script export | **FAIL for rendered video production.** No integrated video-generation/edit/render pipeline, scene media replacement pipeline, export/transcode worker, or tested video model was found. No FFmpeg/ffprobe, Docker runtime, or GPU tooling was available in this sandbox; production hardware is unknown. |
| Media library | `MediaAsset` metadata model and authenticated image/document upload path exist; upload cap is 10 MB and the path writes under `public/uploads` | **PARTIAL**; it is not a private/original-video asset store and large media/background processing is not implemented. Public uploads require a separate storage/security design before video use. |
| Campaign/calendar | Social campaigns, content targets, scheduled content and a visual calendar are present | **PARTIAL**; supported channels and publishing are limited to the implemented adapters |
| Analytics | Real site analytics events, database counts and system-health data exist | **PARTIAL**; third-party follower/reach/watch-time metrics are unavailable unless a provider API supplies them. Do not interpret internal counts as platform metrics. |
| Background work | Cron routes, publishing worker pattern, operation/automation/job records and mini-services exist | **PARTIAL**; queue reliability, retries and rendering capacity have not been tested against production services |

### Social platform support observed in code

- **Facebook:** Graph API text feed publishing, message reply and health request are present. Media/feed and permissions remain provider-dependent; no live call was made.
- **Instagram:** image-container publishing/reply/health paths are present; the scheduler currently identifies Facebook text posts and Instagram image posts as supported.
- **WhatsApp:** social inbox and admin manual-send paths use the selected account's encrypted credentials and do not fall back to global credentials. Both webhook routes parse all text messages by Meta's `phone_number_id`; the dedicated route uses the established WhatsApp AI agent for drafts/lead/handoff effects, then the shared approval policy for sending. Webhook deduplication is database-backed; Meta delivery/read/failure receipts update outbound inbox messages. Manual free-form sends enforce the 24-hour customer-service window; approved templates are not supported. The code still targets Meta Graph API v18.0 for WhatsApp, and current-version support has not been externally verified, so confirm/upgrade that API version before live use. This is source/test evidence, not live four-number acceptance.
- **YouTube, LinkedIn, TikTok:** explicit unsupported adapters.
- **X, Threads, Pinterest, Telegram, Groups:** no verified enabled publishing integration found.

## 3. Database and security audit — BLOCKED for production sign-off

- Both `prisma/schema.prisma` (SQLite) and `prisma/schema.mysql.prisma` (MySQL) exist, with 109 models in each and provider-specific migration histories. Existing models include `SocialAccount`, `SocialConversation`, `SocialMessage`, `SocialWebhookEvent`, `SocialApproval`, `SocialContent`, `MediaAsset`, `AgentOsTask`, `AgentOsApproval`, `AuditLog`, and `Notification`.
- Static schema validation passed for both providers. The project also has schema parity and SQLite replay checks.
- **No production connection, table inventory, backup, restore rehearsal, or staging copy was accessible.** Production provider and actual record counts therefore remain **NOT TESTED**. No database was reset, replaced, or migrated.
- Existing token code uses AES-256-GCM at rest and API responses remove encrypted token fields. Meta webhook signature checking is implemented. These are source-level controls only; production secret strength, rotation, account revocation, and webhook delivery were not verified.
- Before any schema/data migration: identify the actual production provider and database, obtain owner-approved backup/restore evidence, test only against a staging copy, review generated SQL for destructive operations, and get explicit approval before production migration.
- No API tokens, passwords, `.env` values, or production credentials were read or requested in chat.

## 4. Test and workflow evidence

Checks run in the workspace during this audit cycle:

| Check | Result |
|---|---|
| Clean `npm ci` (lockfile) | **PASS** after correcting dependency/lockfile mismatch |
| `npm run typecheck` | **PASS** |
| `npm run lint -- --quiet` | **PASS**; normal lint reports warnings, not lint errors |
| `npm run db:validate` and MySQL schema validation | **PASS** |
| Unit/lib tests | **PASS** — 42 files, 563 tests (includes four-account sender isolation, webhook batch parsing, and 24-hour window policy tests) |
| WhatsApp integration tests | **PASS** — 2 files, 10 tests (HMAC, replay/idempotency, multi-account inbox persistence, explicit account send, outbound inbox record, and 24-hour send-window rejection) |
| Disposable live HTTP E2E/security suite (`npm run test:disposable`) | **PASS** — 33 API/integration tests plus 22 security checks against a temporary SQLite DB and local Next server; DB/server cleaned afterward. No browser-driven Playwright suite/config is present. |
| Production build | **PASS** using a temporary SQLite database initialized from checked-in migration SQL |
| Standalone smoke test | **PASS** — public routes/readiness returned 200, anonymous admin returned 401, authorized readiness write probe returned 200 |
| `npm audit --omit=dev --audit-level=critical` | **PASS at configured threshold**; output still reports 7 high-severity advisories in the Prisma `effect` dependency chain |
| Prisma CLI migration/deploy and full server-backed/security suite | **BLOCKED / NOT TESTED** here: Prisma CLI could not download its engine from `binaries.prisma.sh` in this sandbox; the GitHub Actions runner has a different network environment |
| Live provider/WhatsApp/video model tests | **NOT TESTED** — no account credentials, provider console, model service, or production hardware was available |

The latest GitHub runs found on the repository head were CI `#247` and Supply Chain `#226`; both failed at `npm ci` because the lockfile specified `@tanstack/react-table` / `@tanstack/table-core` `9.3.1` while `package.json` required `8.21.3`. The lockfile is now aligned, and the local clean install passes. No run numbered `884` was present in the Actions runs returned for this repository. No new remote run was triggered from this unpushed working tree.

## 5. Phased plan and gates

1. **Phase 1 — repository/source/infrastructure audit:** **PASS** for checked-in source/config and local verification only. Production host details remain outside scope.
2. **Phase 2 — database/security audit:** **BLOCKED** for production sign-off pending owner-approved production inventory, backup, restore rehearsal and staging access. No destructive operation is authorized.
3. **Phase 3 — Super Admin Command Centre:** next implementation stage; preserve the existing `/admin` shell, auth and modules. Reuse real service data and explicitly label unavailable integrations rather than showing placeholder activity.
4. **Phases 4–6 — social connections, four WhatsApp accounts, unified inbox:** code-side account isolation, all-entry webhook ingestion, inbox persistence, delivery receipts, explicit manual account selection and 24-hour free-form-window checks are implemented and locally tested. Remaining: health-check four real Meta numbers, verify inbound/outbound delivery and permissions, add approved-template support, and confirm the WhatsApp Cloud API version/permissions against current Meta requirements before production. Do not assume eligibility.
5. **Phases 7–12 — content, video, scheduling, agents and analytics:** build only around providers/models that are selected after license, commercial-use, hardware, cost and operational review. Keep long render jobs in a worker/queue and store media outside the relational database.
6. **Phases 13–15 — assurance, staging and production:** integration/security tests, staging acceptance and backup/migration evidence first; production deployment only after explicit owner approval. Preserve the existing process name and `3056` unless an approved change resolves the checked-in proxy discrepancy.

### Inputs needed before live integration or production work

- Confirmation of the active production database provider and a secure, owner-controlled staging backup/restore workflow.
- Official Meta Business Platform access/approval and the four phone-number IDs/account eligibility; credentials should be installed through the server's approved secret mechanism, never pasted into chat.
- Selection of the initial video-generation/render provider(s), commercial-use/model-weight license review, available GPU/worker hardware and a spending limit.
- Confirmation of the active production proxy/service configuration (Caddy versus Nginx/systemd/PM2) so the documented `3000`/`3056` discrepancy can be resolved safely.

## 6. Readiness summary

**Overall: NOT READY for the requested end-to-end production acceptance.** Account-scoped WhatsApp sending and inbox ingestion now have code and sandbox tests, but four real Meta numbers and live delivery are unverified; approved-template support and current Graph API version validation remain. Broad official social publishing, rendered AI video, platform-level analytics and production integration/security checks are incomplete or unverified. No production deployment or database migration was performed or authorized.
