# Stage plan — Unified Inbox + Website CMS + AI Chat persistence

> Written before stage code changes. Branch is fixed by the session to
> `arena/ed00ead1-alaminn` (base `7dd1bae2dfc841fa3803044a0a3f420d6b8f8666`);
> creating or switching branches is not permitted in this environment. The branch
> itself is the safe isolation boundary. Working tree already contains the
> previous, verified implementation tranche.

## Mandatory inspection performed

- Confirmed branch/commit/working tree and project structure.
- Confirmed stack: Next.js 16 App Router, npm, Prisma 7 dual schema (SQLite + MySQL).
- Confirmed auth/RBAC: `requireAuth`, `requirePermission`, `src/proxy.ts`.
- Confirmed existing route/API/test layout and additive migration conventions.
- Verified prior tranche files exist: Command Center metrics, 18-service AI Services catalogue,
  communication controls, AI Providers admin registry. Their tests were green at the previous
  handoff and will be re-run at this stage's completion.

## Scope and design decisions

1. **Unified Inbox**: new channel-agnostic `InboxContact`, `InboxConversation`, `InboxMessage`
   and `InboxAudit` models (additive, no FK to existing tables, explicit indexes). Reuse existing
   `SocialAccount` identities, RBAC, `writeAudit`, and the global communication mode enforcement
   in `src/lib/social/communication-controls.ts` and `policy-server.ts`. Channel adapters use a
   typed interface; missing credentials mean `not_connected`, never a simulated success.
2. **Website CMS**: new `CmsEntry` + `CmsRevision` models with draft → review → approved →
   published states, SEO metadata, revision history and restore. Existing `Article`, homepage
   and Higher Study rendering are untouched. Public `/content/[slug]` renders only published
   rows from the database. All new/AI-assisted entries start as drafts.
3. **AI Chat persistence**: `AiChatConversation` + `AiChatMessage` models owned by `User.id`;
   persistent history, search, rename/archive/delete, provider/model selection via the existing
   free-first router, SSE streaming of generated content with client cancellation, and truthful
   provider-unavailable errors.
4. **Security**: all admin APIs are permission-checked; ownership is checked in every query;
   idempotency keys prevent duplicate message writes; input is zod-validated; no credentials
   reach the browser; external delivery only through official adapters and only when connected.
5. **Database**: additive SQLite and MySQL migrations with matching Prisma schemas; no data
   deletion, no destructive SQL, no production access.

## Execution order

1. Add schemas + migrations; regenerate Prisma client.
2. Implement pure domain helpers (contact matching, outbound authorization, CMS state machine,
   revision diff/restore inputs) with unit tests.
3. Implement APIs with RBAC/ownership/validation/audit.
4. Implement admin UI using existing design primitives and navigation.
5. Implement public CMS rendering route.
6. Add adapter architecture documentation and failure tests.
7. Re-run typecheck, lint, unit/integration/API/security suites and production build.
8. Produce an evidence-based final report with honest completion percentage.

## Explicit non-goals in this stage

No production deployment, no commit/push/merge, no destructive operation, no invented external
integration, and no claim of full project completion while other master-prompt stages remain open.
