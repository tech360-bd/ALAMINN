# TELEGRAM INTEGRATION — DESIGN & BLOCKERS

Status 2026-09-30: **BLOCKED — not implemented.** No Telegram code or credentials exist in the repository. No bot token has been invented or configured (per project rules).

## Exact blockers (owner actions required)

1. Create the bot with @BotFather → obtain the **bot token**.
2. Decide the **admin chat IDs** allowed to interact (send `/start` to the bot, read the chat id).
3. Provide a public webhook URL (production `https://alaminn.info/api/v1/telegram/webhook`) and set the webhook with a **secret token** (`setWebhook?secret_token=…`).
4. Add to production `.env` (never commit):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET` (random ≥32 chars)
   - `TELEGRAM_ADMIN_CHAT_IDS` (comma-separated)

## Implementation plan (once credentials exist)

New files (additive, non-breaking):

| Component | Path | Notes |
|---|---|---|
| Webhook endpoint | `src/app/api/v1/telegram/webhook/route.ts` | Verifies `X-Telegram-Bot-Api-Secret-Token` header; rejects others |
| Command parser | `src/lib/telegram/commands.ts` | `/status`, `/tasks`, `/approve <id>`, `/reject <id>`, `/help` |
| Identity guard | `src/lib/telegram/auth.ts` | Only `TELEGRAM_ADMIN_CHAT_IDS` may act; everyone else gets "unauthorized" |
| Outbound notifier | `src/lib/telegram/notify.ts` | AI-task completion, approval requests, cron failures, deployment events |
| Approval bridge | extend existing AiApproval flow | Approvals via Telegram write the SAME audit records as the admin UI |
| Rate limiting | reuse `src/lib/higher-study/rate-limit.ts` pattern | Per-chat limiter |
| Tests | `tests/lib/telegram.test.ts` + webhook API tests | Secret header validation, unauthorized user, command parsing |

## Security rules (hard requirements)

- The webhook MUST validate the secret token header on every update — drop silently on mismatch.
- Admin identity is verified by chat ID **on every privileged action**; a random user who finds the bot can never approve or execute anything.
- All Telegram-triggered privileged actions write audit logs (actor = `telegram:<chat_id>`).
- Rate limit commands per chat; cap outbound notifications (no spam loops).
- The bot token never appears in logs, URLs, or client code.

## Out of scope until owner approves

- Group/channel automations, payment flows, inline bots.
