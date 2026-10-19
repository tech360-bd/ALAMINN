# Social Command Center — Operations

## URLs
- Overview `/admin/social` · Accounts `/admin/social/accounts` · Inbox `/admin/social/inbox` · Approvals `/admin/social/approvals` · Personality `/admin/social/personality` · Content `/admin/social/content` · Rules & switches `/admin/social/rules`
- Webhooks: `POST /api/v1/social/webhooks/{facebook|whatsapp|instagram}` (Meta verification `GET` same URL). Point Meta apps here.
- Publisher cron (hourly): `GET /api/cron/social-publish` with `x-cron-secret: $CRON_SECRET`.

## Safety model
- Global auto-reply defaults **OFF**. Every automated send re-reads `SocialAutomationState` + account + rule state **immediately before sending** (`assertAutomationAllowedNow`); unverifiable state = no send.
- OFF suppresses queued unsent replies in the same transaction. Already-delivered messages **cannot be recalled** — UI states this explicitly.
- Manual replies (`POST /inbox/[id]`) and approval-sends are human actions and remain available while automation is OFF.
- High-risk categories (complaint/sensitive/human-required), low confidence, and `neverAnswerTopics` always route to approval/escalation.
- Dedup: unique `(provider, providerEventId)` + unique `providerMessageId`. Own messages never answered.

## Before going live (external, cannot be done from code)
1. Meta app with `pages_messaging`, `pages_manage_posts`, `instagram_basic` etc. approved by Meta App Review; set `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`.
2. WhatsApp Business Platform number + approved templates for outside-24h messages; set existing `WHATSAPP_API_*`.
3. Run migration: backup DB → `npx prisma migrate deploy` → health check `/api/health`.
4. In admin: connect accounts → Test → create default personality → approve knowledge → leave automation OFF until test-console output is reviewed → enable per-account `controlled` only when ready.

## Rollback / backup
- Migration is additive (new tables only). Rollback = deploy previous build; optionally `DROP TABLE` the `Social*`/`AiPersonalityProfile` tables (loses social data only).
- Backup: `npm run db:backup` before migrating (existing script). Restore: `npm run db:restore`.

## Known limits
- YouTube/LinkedIn/TikTok adapters registered but disabled pending official API access. WhatsApp cannot publish feed posts (platform limit) — surfaced in UI.
- Local inference still needs hardware; if the LLM is unavailable the pipeline falls back to approved-FAQ/knowledge replies or a safe "team will reply" message — manual mode always works.
