# Stage report — Unified Inbox, Website CMS and persistent AI Chat

Branch: `arena/ed00ead1-alaminn` (fixed session branch; no branch switch or push).
Date: 2026-11-24 (UTC). Base commit: `7dd1bae2dfc841fa3803044a0a3f420d6b8f8666`.

This report follows the owner's required nine-section format. No production deployment,
production database migration, credential write, commit or push was performed.

## 1. Features implemented

### Unified Inbox — `IMPLEMENTED AND TESTED` (local/DB scope)

- Channel-agnostic models: `InboxContact`, `InboxConversation`, `InboxMessage`, `InboxAudit`.
  Encrypted/secret-bearing fields are not stored; attachment metadata is kept as JSON.
- Multiple accounts per channel are supported by the unique key
  `(channel, accountId, externalThreadId)`.
- Identity matching by external ref → normalised email → normalised phone; deterministic
  `channel:id` refs; new contacts are created only when no match exists.
- Inbox APIs: list with search/status/channel filters and pagination; ingest with idempotency;
  detail with messages, contact and audit history; PATCH for status, priority, assignment,
  tags and read state; POST reply/internal note.
- Internal notes are stored with `direction: internal_note` and `deliveryStatus: suppressed`;
  they never call an external adapter.
- Global communication modes are reused at the unified send boundary: `PAUSED` blocks all
  outbound; `HUMAN_OPERATOR` blocks automation; `AI_ASSISTED` requires explicit approval;
  `AI_AUTONOMOUS` is limited to connected/permitted channels.
- Idempotency keys are unique in `InboxMessage`; duplicate ingestion/replies return the prior
  row without a second provider attempt.
- Admin UI `/admin/inbox` provides filters, pagination, conversation list, assignments/status,
  read state, audit history, human reply, internal-note composer and private attachment upload.
- Signed provider webhooks (`whatsapp`, `messenger`, `instagram`) share the same idempotent
  ingest path; invalid signatures are rejected before any database write.
- Private attachments are stored outside `public/` with random keys, validated by magic bytes
  and served only through an authenticated RBAC download route.
- Indexes cover status+recency, assignment, contact, conversation+time and delivery status.

### Website CMS — `IMPLEMENTED AND TESTED` (local/DB scope)

- `CmsEntry` and `CmsRevision` models for pages/articles/posts, categories, tags and SEO fields.
- Draft → review → approved → published workflow; invalid skips are rejected server-side.
  Publishing requires `articles.publish`, other transitions require `articles.update`.
- Public `/content/[slug]` renders **only** rows with `status = published` in the database;
  drafts/review/archived entries return 404. SEO title/description/canonical come from the
  published DB row.
- Every create/update and every restore writes an immutable revision. Restore is a server-side
  operation that returns the entry to `draft` and never auto-publishes.
- AI-created content is created as `draft`; no endpoint publishes directly from generation.
- Admin UI `/admin/cms` supports authoring, status transitions, revision list, restore and an
  authenticated `noindex` draft preview that never changes publication state.

### Persistent AI Chat — `IMPLEMENTED AND TESTED` (local/gateway scope)

- `AiChatConversation` and `AiChatMessage` persist user/assistant turns, provider/model metadata
  and truthful error markers. Conversations are strictly owned by `userId`.
- APIs: list/search, create, get, rename, archive, delete, and SSE message streaming.
- Provider/model selection is validated against the existing AI Provider Gateway registry;
  no key material is sent to the browser.
- Client abort is handled: no `done` event is emitted, and cancelled assistant rows carry an
  explicit `cancelled_by_client` marker. Provider failures emit `provider_unavailable`.
- Admin UI `/admin/ai-chat` supports search, rename, archive, delete, provider/model choice,
  streaming, stop and persisted reload.

### Integration architecture — `IMPLEMENTED BUT NOT CONNECTED`

- `src/lib/inbox/adapters.ts` defines typed adapters for email, WhatsApp, Messenger, Instagram,
  LinkedIn, website chat and approved social publishing, plus a calendar adapter.
- External adapters call official APIs only: WhatsApp Cloud API, Meta Graph Messaging/Feed,
  LinkedIn UGC Posts, the existing email provider router and Google Calendar. Required OAuth
  scopes are declared on each adapter.
- Credentials are read from existing encrypted `SocialAccount` rows or server-only email
  configuration. Missing credentials throw `ChannelNotConnectedError`; provider rejections are
  recorded as `failed` with `actuallySent: false`. No adapter fabricates a provider ID.
- Website chat is explicitly internal: local delivery is `delivered`; it is not labelled as an
  external provider.
- Official API paths and failure handling are covered with mocked provider responses. Live
  delivery is still **awaiting credentials/platform approval**; no channel is reported live.

## 2. Files changed

New stage files:

- `docs/STAGE_INBOX_CMS_CHAT_PLAN.md`, `docs/STAGE_INBOX_CMS_CHAT_STATUS.md`
- `prisma/schema.prisma`, `prisma/schema.mysql.prisma` — 9 additive models in each
- `prisma/migrations/sqlite/20261124000000_inbox_cms_chat/migration.sql`
- `prisma/migrations/mysql/20261124000000_inbox_cms_chat/migration.sql`
- `src/lib/inbox/contacts.ts`, `src/lib/inbox/outbound.ts`, `src/lib/inbox/adapters.ts`,
  `src/lib/inbox/ingest.ts`, `src/lib/inbox/attachment-storage.ts`
- `src/lib/cms/state.ts`, `src/lib/cms/revisions.ts`
- `src/lib/ai/chat-providers.ts`
- `src/app/api/v1/admin/inbox/conversations/route.ts`, `[id]/route.ts`, `[id]/messages/route.ts`
- `src/app/api/v1/admin/inbox/attachments/route.ts`, `[id]/route.ts`
- `src/app/api/v1/webhooks/inbox/[channel]/route.ts`
- `src/app/api/v1/admin/cms/entries/route.ts`, `[id]/route.ts`, `[id]/status/route.ts`,
  `[id]/revisions/[revisionId]/restore/route.ts`, `[id]/preview/route.ts`
- `src/app/api/v1/admin/ai-chat/conversations/route.ts`, `[id]/route.ts`, `[id]/messages/route.ts`
- `src/app/admin/inbox/page.tsx`, `src/app/admin/cms/page.tsx`, `src/app/admin/ai-chat/page.tsx`
- `src/app/content/[slug]/page.tsx`
- `tests/lib/stage-inbox-cms.test.ts`, `tests/lib/stage-inbox-integrations.test.ts`,
  `tests/unit/stage-inbox-cms-chat-api.test.ts`

Modified supporting files: `src/components/admin/admin-shell.tsx`, `src/lib/ai/dashboard-agents.ts`.
Existing routes/auth/data were preserved; the additions are additive.

## 3. DB migrations

- Both dialect migrations only `CREATE TABLE`/`CREATE INDEX`; no `DROP`, `TRUNCATE`, `ALTER` of
  existing tables or data deletion.
- SQLite migration was applied to a **temporary** database during verification:
  `10 recorded/applied, 0 already present, 0 failed`.
- `npm run db:generate`, `npm run db:validate` and `npm run db:validate -- mysql` all passed.
- No production database was touched.

## 4. Tests and results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors, 61 pre-existing warnings; no new warnings in stage files |
| `npx vitest run tests/lib tests/unit tests/components tests/integration` | PASS — 58 files / 648 tests |
| `npm run test:disposable -- --security` | PASS — 7 files / 41 tests; security 22/22 |
| `npm run build` (generated secrets + migrated temp SQLite DB) | PASS — all new routes/pages in build manifest |

New tests cover contact matching, outbound mode decisions, adapter failure handling, CMS
state/slug/revision helpers, CMS publish RBAC, invalid transitions, draft-only creation,
revision restore, chat ownership, streaming, provider failure, cancellation, inbox mode blocks,
approval, channel-not-connected, idempotency, signed webhook verification, official API send
paths with mocked provider responses, private attachment validation and draft preview.

## 5. Verified workflows

- Local API handlers with mocked persistence: anonymous/permission-denied publishing, invalid
  CMS transitions, draft creation, revision restore, foreign-user chat 404, streamed assistant
  metadata, provider failure and cancellation events.
- Local API handlers: paused automated reply → 409; assisted reply without approval → 403;
  approved reply with no credentials → 503; approved reply with credentials but no enabled
  provider → recorded as `failed` with `actuallySent: false`; duplicate key → prior row.
- Production build with all new admin pages, content page, webhook, preview, attachment and
  API routes present in `.next/server/app-paths-manifest.json`.
- Public live URL checks from the earlier baseline remain valid; no authenticated production
  workflow was exercised in this stage.

## 6. Blockers

1. **Live external delivery remains unverified** because no real credentials or platform
   approvals are available. Adapter code paths and failure handling are implemented and tested
   with mocked provider responses, but that is not a live connection test.
2. Real provider streaming latency/cancellation and webhook delivery need verification with
   configured credentials; local tests mock the gateway and provider signatures.

## 7. Security concerns

- RBAC is enforced server-side on every new admin endpoint; chat rows are filtered by user ID.
- `requireAuth`/`requirePermission` are re-checked inside route handlers; UI controls are not
  treated as authorization.
- Zod validation caps body/payload sizes; idempotency prevents duplicate provider attempts.
- No credential values are read into client components or API responses; adapters check env
  names server-side only.
- All state changes that matter (CMS publish/restore, inbox updates/replies) write audit rows.
- Remaining risk: external channel credentials must be encrypted at rest by the existing
  secret-management path before any live adapter is enabled; this stage does not write credentials.
- Draft preview is `noindex`, `no-store` and RBAC-gated; private attachments are never in
  `public/` and are served with `Cache-Control: no-store, private`.

## 8. Deployment readiness

- **Deployment-ready as code; not as a live-integration release.** The code builds and migrations
  are additive, but external channels are awaiting credentials/approval and must be labelled as
  such in the UI/docs.
- Deployment requires owner approval, a migrated database and explicit environment setup.
  No deploy, commit, push, production config overwrite or secret mutation was performed.

## 9. Honest completion percentage

**98% — 59 of 60 acceptance criteria fully evidenced.**

Calculation method: each criterion counts only if (a) the code path exists, (b) server-side
validation/authorization/audit is in place where relevant, (c) an automated test or build
evidence exists, and (d) the system does not claim unproven success.

| Area | Fully evidenced | Not counted |
|---|---:|---:|
| Unified Inbox | 18 | 0 |
| Website CMS | 12 | 0 |
| Persistent AI Chat | 11 | 0 |
| Integration architecture | 8 | 1 — live authenticated provider delivery |
| Security/data integrity | 10 | 0 |
| **Total** | **59** | **1** |

`59 / 60 = 98.33% → 98%`. The only uncounted criterion is a real, credentialed provider send.
Claiming 100% would be false because no external provider connection was tested.
