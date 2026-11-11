# Universal Messaging Channel (UMC)

Open-source-first **chat/messaging channel and adapter layer** for the Universal
Enterprise AI Calling Center program. Implements Phase 1 of the MirrorFly
Integration & Free-Services Merge Plan: the four adapter interfaces plus a fully
working built-in messaging channel — real code, no simulated behaviour.

## What is inside

| Path | Purpose |
| --- | --- |
| `src/adapters/types.ts` | The four committed interfaces: **MessagingChannel**, **TelephonyTransport**, **ModerationService**, **AgentConsoleBridge** (+ TranslationProvider) |
| `src/adapters/registry.ts` | Environment-driven provider selection; unknown providers fail at boot instead of simulating |
| `src/adapters/builtin-messaging.ts` | Built-in MessagingChannel (the program's own engine) |
| `src/adapters/moderation-basic.ts` | Deterministic per-tenant wordlist moderation |
| `src/adapters/console-socket.ts` | Handoff event bridge to the agent console |
| `src/adapters/telephony-none.ts` | Honest telephony boundary: **no transport configured → dialling is refused, never simulated** |
| `src/lib/engine.ts` | Core send path: moderation + compliance + receipts + broadcast for **every** sender (human, AI, scheduler) |
| `src/lib/compliance.ts` | Consent, suppression list, tenant-timezone messaging window, audit trail |
| `src/lib/ai-agent.ts` | LLM chatbot (bn/en/Banglish language policy) + human-handoff triggers |
| `src/lib/translate.ts` | On-demand translation: LLM-backed default, LibreTranslate-compatible client via env |
| `src/lib/scheduler.ts` | Scheduled send dispatch, disappearing-message expiry, conversation burnout |
| `src/lib/realtime.ts` | socket.io: auth, rooms, typing, presence/last-seen, notifications |
| `src/lib/routes.ts` | REST API (`/api/umc/...`) |

## Feature coverage (mapped to the MirrorFly catalogue cluster)

Typing indicators · delivery/read receipts · unread counts · last seen ·
@mentions · in-app notifications · on-demand translation (bn↔en) · attachments
(with preview metadata) · chat tags · message search · starred messages ·
chat rooms/groups · one-way and two-way public channels with join · admin
messages · structured/custom message types · scheduled messages · polls ·
self-message · disappearing messages · conversation burnout · ban · block ·
report · verified business badge · AI chatbot · unlimited chat.

## Compliance control plane (never delegated to a vendor)

- **Consent registry** per subject/channel/purpose with proof reference; marketing sends without granted consent are refused (`451 consent_missing`).
- **Suppression list** per channel; suppressed recipients are refused (`451 suppressed`).
- **Messaging window** in the tenant's own timezone; proactive agent outbound outside the window is refused (`451 hours_violation`) while replies inside a 30-minute customer session are always allowed.
- **Audit trail** records every enforcement decision.

## Multi-tenancy

Every table carries `tenantId`; every query is tenant-scoped. For PostgreSQL
deployments, `prisma/rls/postgres-rls.sql` enforces the same isolation with
row-level security (`SET app.tenant_id = ...` per session). No tenant, brand,
project or domain identity is hard-coded anywhere in this service.

## Run

```bash
bun run dev          # serves REST + socket.io on :3010
curl localhost:3010/api/umc/health
```

Provider selection (Phase 3 owner-approval gate required for vendor adapters):

```bash
UMC_MESSAGING_PROVIDER=builtin-umc      # only built-in provider in this deployment
UMC_MODERATION_PROVIDER=builtin-wordlist
UMC_TRANSLATION_PROVIDER=llm            # or 'libre' + UMC_TRANSLATION_ENDPOINT
UMC_TELEPHONY_PROVIDER=none             # real transports register here with their own credentials
```
