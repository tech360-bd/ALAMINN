# Existing feature inventory (partial)

This inventory is source-based; existence is not acceptance verification.

| Domain | Discovered paths | Assessment |
|---|---|---|
| Executive admin auth/RBAC | `src/lib/auth.ts`, `src/lib/auth/jwt.ts`, `src/lib/rbac.ts` | JWT plus database-backed session and account/role checks; further verification pending |
| Staff auth/RBAC | `src/lib/auth/session.ts`, `src/lib/auth/rbac.ts`, `src/app/api/auth` | Database-backed staff sessions and reset revocation; detailed role coverage not exhaustively audited |
| CRM/inquiries | `src/lib/crm`, `src/app/api/v1/inquiries`, `prisma/schema.prisma` | Existing contact, inquiry, opportunity and task models; contact has no account ownership field |
| WhatsApp | `src/lib/whatsapp`, `src/app/api/v1/whatsapp` | Sending, webhook, consent and lead code; actual provider access unverified |
| Study/UCI | `src/app/higher-study`, `src/app/api/uci`, `src/components/uci` | Existing catalogue and administration; filtered pagination changed, broader validation pending |
| AI/agents | `src/lib/ai`, `src/lib/agentos`, `mini-services/ai-worker` | Existing provider/agent infrastructure; not established as MAYA or Jara |
| Messaging | `mini-services/messaging-channel`, `src/app/api/umc` | Existing staff messaging; no verified Jara identity, calls or avatar |
| Operations | `.github/workflows`, `deploy/`, `tests/` | CI, deployment configurations and tests exist; live service not inspected |
