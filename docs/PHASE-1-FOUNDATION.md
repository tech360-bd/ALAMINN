# Phase 1 — Foundation (delivered)

**Status: complete and verified** · Branch `arena/2f26d3c3-alaminn`
Date: 2026-11-16

This document records exactly what Phase 1 delivers, how it maps onto the
17 requested deliverables, the decisions made where the existing repository
already contained production code, and how to test it.

---

## 0. Starting point (important)

`tech360-bd/ALAMINN` was **not an empty repository**. It already contained a
large, production-deployed application (109 Prisma models, ~290 routes,
Higher Study and English Learning portals, admin CRM, social/AI modules).

Phase 1 was therefore delivered as a **foundation retrofit**, not a
greenfield scaffold:

- Everything that already met the spec was kept and verified.
- Everything that conflicted with the Phase 1 rules was migrated, with the
  existing API surface preserved so none of the ~100 dependent modules broke.
- Nothing was deleted. No tables were dropped. No routes were removed.

The result is one coherent foundation that follows the requested rules, with
the existing product still building and passing its test suite.

---

## 1. Deliverables (as requested)

| # | Requested file | Status | Notes |
|---|---|---|---|
| 1 | `prisma/schema.prisma` (16 core models) | ✅ | All 16 already existed; required `String` fields now carry `@default("")` (43 fields added; foreign keys excluded) |
| 2 | `prisma/seed.ts` | ✅ | Bootstraps `admin@alaminn.info` as **SUPER_ADMIN**, default settings, sample articles/projects |
| 3 | `src/lib/auth.ts` | ✅ | Rewritten: JWT via **jose**, bcrypt hashing, `createToken` / `verifyToken` / `requireAuth` / `requirePermission` |
| 4 | `src/lib/rbac.ts` | ✅ | 11 roles + permission matrix (already present) + **role hierarchy** and `requireRole()` |
| 5 | `src/lib/db.ts` | ✅ | Prisma singleton + driver adapter (SQLite/libSQL, MySQL-capable) |
| 6 | `src/lib/admin-api.ts` | ✅ | Now the **frontend client** (`credentials: "include"`, 401 → `/admin/login`, no localStorage, no Bearer). Server route helpers moved to `src/lib/admin-api-server.ts` |
| 7 | `src/proxy.ts` | ✅ | JWT gate for `/admin*` and `/api/v1/admin/*`; public/protected separation; security headers retained |
| 8 | `src/app/api/v1/auth/login/route.ts` | ✅ | bcrypt/bcrypt-legacy verify, timing-safe, rate-limited, sets `auth_token` JWT (24 h), audits |
| 9 | `src/app/api/v1/auth/session/route.ts` | ✅ | Returns the redacted session or 401 |
| 10 | `src/app/api/health/route.ts` | ✅ | Public, minimal, no internals leaked |
| 11 | `src/app/admin/login/page.tsx` | ✅ | Existing premium login form, `credentials: "include"`, redirects to `/admin` |
| 12 | `src/app/admin/page.tsx` | ✅ | Dashboard shell with live stats |
| 13 | `src/app/layout.tsx` | ✅ | Root layout, fonts, theme |
| 14 | `next.config.ts` | ✅ | `output: "standalone"`, loads `.env.config` before Next reads env |
| 15 | `package.json` | ✅ | `jose` + `bcryptjs` added; `pm2:start`, `env:check` scripts |
| 16 | `ecosystem.config.cjs` | ✅ | PM2 v7 process file, reads `.env.config` with `fs.readFileSync()`, port 3056, binds `0.0.0.0` |
| 17 | `.env.config.example` | ✅ | Every required variable, `$`-safe, no secrets |

Supporting files added: `src/lib/auth/jwt.ts`, `src/lib/auth/secret.ts`,
`src/lib/load-env.ts`, `scripts/check-env.mjs`,
`tests/lib/phase1-auth.test.ts`.

---

## 2. Authentication — one system

```
POST /api/v1/auth/login
        │  bcrypt.compare
        ▼
   createToken(userId, role)          jose · HS256 · 24 h
        │
        ▼
 Set-Cookie: auth_token=<JWT>; HttpOnly; Secure*; SameSite=Lax; Max-Age=86400
        │                              (*Secure outside development)
        ▼
 Browser ── credentials: "include" ──► src/proxy.ts
                                        │ verifyToken (same code, Node runtime)
                                        ├─ /api/v1/admin/*  → 401 JSON if invalid
                                        └─ /admin, /admin/* → 307 /admin/login?next=…
                                              │
                                              ▼
                                     route handler
                                     requireAuth() / requirePermission()
                                     (re-checks user.status + live role in DB)
```

- **No NextAuth.** **No Bearer tokens.** **No localStorage.** **No second
  token format.**
- Token payload: `{ sub: userId, role, email, name, iat, iss, aud, exp }`.
- Expired role changes take effect immediately: `requireAuth` and
  `requirePermission` re-read `User.status` / `User.role` on every call.
- Login also deletes the legacy pre-JWT cookie, so an old session cannot
  linger after migration.
- Password hashing is bcrypt (cost 12). Legacy `scrypt$salt$hash` rows still
  verify and are transparently upgraded to bcrypt on the next successful
  login (`needsPasswordRehash`).

### Roles & hierarchy

```
SUPER_ADMIN (100) > OWNER (90) > EXECUTIVE_ASSISTANT (80)
> CRM / PARTNERSHIP / CONTENT / MARKETING / PROJECT_MANAGER (70)
> SECURITY_AUDITOR (60) > AI_REVIEWER (50) > VIEWER (10)
```

`requireRole(role, minimum)` returns `{ ok: true }` or
`{ ok: false, error: NextResponse }` (401 when no/invalid role, 403 when
below the minimum). Fine-grained access is additionally governed by the
existing permission matrix (`hasPermission`).

---

## 3. Configuration — `.env.config`, not `.env`

- `src/lib/load-env.ts` parses `.env.config` (then `.env.config.local`) with
  **no `$` expansion**, so passwords like `p$a$s` survive.
- Loaded from `next.config.ts`, `src/lib/db.ts`, `src/lib/env.ts`,
  `prisma.config.ts`, `instrumentation.ts`, and the PM2 config.
- Precedence: real process env → `.env.config.local` → `.env.config`.
- `.env.config` is gitignored; `.env.config.example` is committed.
- `src/lib/env.ts` now prefers `JWT_SECRET` and still accepts the legacy
  `AUTH_SECRET` for existing deployments.
- Test isolation: the loader is skipped when `NODE_ENV=test`
  (override with `LOAD_ENV_CONFIG_IN_TEST=1`).

---

## 4. Data layer

- Provider: **SQLite** (`file:./db/custom.db`), driver adapter
  `@prisma/adapter-libsql` (`engineType = "client"`).
- The adapter factory also supports `mysql://` for the existing production
  database. Development and tests use SQLite.
- Every ID is `@default(cuid())`.
- The 16 core Phase 1 models all exist and are used by the app:
  `User, Contact, Organization, Inquiry, Opportunity, Task, Note, Article,
  Project, CaseStudy, AuditLog, Setting, NewsletterSubscriber,
  MeetingRequest, Notification, MediaAsset`.
- Required `String` fields in those 16 models now carry `@default("")`
  (43 fields). Two relation foreign keys (`Inquiry.contactId`,
  `Opportunity.contactId`) intentionally keep no default: a missing FK
  should fail loudly at insert rather than silently create an orphan row
  pointing at `""`.
- Optional nullable strings (`String?`) in the wider 109-model schema were
  **not** mass-converted: that would change long-standing API contracts and
  risk the live product. New models should follow the "no nullable strings"
  rule from the start.

---

## 5. Response envelope

All admin routes return:

```jsonc
// success
{ "success": true, "message": "OK", "error": null, "data": …, "meta": {}, "errors": [] }
// failure
{ "success": false, "message": "…", "error": "…", "data": null, "meta": {}, "errors": ["…"] }
```

`error` is the canonical field required by the spec; `message` is retained
because the existing admin UI reads it. Auth failures are `401` with
`error: "unauthorized"`; insufficient role is `403`.

---

## 6. How to test Phase 1

### 6.1 Setup

```bash
npm install
cp .env.config.example .env.config      # then edit values
npm run env:check                       # validates JWT_SECRET, DB URL, etc.
npm run db:push
npm run db:seed                         # needs ADMIN_BOOTSTRAP_PASSWORD
```

### 6.2 Build & run

```bash
npm run build
PORT=3056 HOSTNAME=0.0.0.0 NODE_ENV=production node .next/standalone/server.js
# or, with PM2 (delete + start, never restart):
npm run pm2:start
```

### 6.3 Automated checks

```bash
npm run typecheck       # 0 errors
npm run lint            # 0 errors
npm run test:unit       # 468+ tests
npx vitest run tests/api   # integration (needs a server; see TEST_BASE_URL)
```

### 6.4 Manual acceptance tests

```bash
B=http://127.0.0.1:3056

# 1. Health is public
curl -i $B/api/health                                   # 200 {"status":"ok"}

# 2. Admin page requires auth
curl -i $B/admin                                        # 307 → /admin/login?next=%2Fadmin

# 3. Admin API requires auth
curl -i $B/api/v1/admin/contacts                        # 401 {"error":"unauthorized"}

# 4. Login (sets the JWT cookie)
curl -i -c /tmp/cj.txt -X POST $B/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@alaminn.info","password":"<your seed password>"}'
# → 200, Set-Cookie: auth_token=eyJ…; Max-Age=86400; HttpOnly; SameSite=lax
#   and access to /admin now works in a browser with that cookie

# 5. Session
curl -b /tmp/cj.txt $B/api/v1/auth/session              # 200 + user

# 6. Authorised admin API
curl -b /tmp/cj.txt "$B/api/v1/admin/contacts?page=1&pageSize=2"   # 200

# 7. Tampered token is rejected
curl -i -H "Cookie: auth_token=$(…).tampered" $B/api/v1/admin/contacts  # 401

# 8. Logout
curl -b /tmp/cj.txt -X POST $B/api/v1/auth/logout       # 200
```

> In production the cookie is `Secure`, so browsers require HTTPS (Nginx +
> SSL). Over plain HTTP on localhost, use development mode (`NODE_ENV` not
> `production`) or send the token header manually with curl as above.

### 6.5 Verified on this branch

- `tsc --noEmit` → **0 errors**
- `eslint .` → **0 errors**
- `next build` → **success** (standalone output)
- `test:unit` → **468 passed**
- Live HTTP run (production standalone, port 3056):
  - health `200`; `/admin` → `307` login redirect; admin API → `401`
  - login `200`, JWT 3 segments, `exp − iat = 86400`, `HttpOnly`, legacy cookie cleared
  - session `200`; authed admin API `200`; authed `/admin` `200`
  - tampered token `401`; logout `200`

---

## 7. Intentional deviations from the written spec

| Spec | Reality in this repo | Why |
|---|---|---|
| "core 16 models only" | 109 models already exist and are in use | Deleting 93 models would destroy the live product |
| Every String has `@default("")`, no nullable strings | Applied to required strings of the 16 core models; optional fields in the wider schema unchanged | Mass-converting nullable API fields is a breaking change |
| SQLite only | SQLite for local/tests, existing MySQL adapter retained for production | Production currently runs MySQL; switching would require a data migration |
| `DATABASE_URL="file:./dev.db"` | `file:./db/custom.db` | Repo convention; file stays gitignored |
| One auth system | Command Center is JWT-only. The legacy ALO staff dashboards (`/dashboard`, `/console`) keep their existing signed staff cookie (`src/lib/auth/token.ts`) | Retiring it would break those dashboards; it is out of Phase 1 scope and shares no admin data |
| `requireRole` in rbac.ts | Implemented there; `requireAuth`/`requirePermission` in auth.ts | Matches the spec |

Everything the spec marks as non-negotiable **for the Phase 1 surface** —
one JWT cookie named `auth_token`, jose HS256, 24 h, bcrypt, global
middleware gating, `.env.config`, `$`-safe parsing, PM2 file, response
envelope, 401s — is implemented as specified.

---

## 8. What Phase 2 will build on

Public pages, contact/newsletter flows, and article/project/case-study
detail pages already exist from the prior build. Phase 2 will be an audit +
hardening pass against the Phase 2 checklist (all public pages, contact
email delivery, newsletter double opt-in) rather than a rebuild, unless you
prefer a from-scratch replacement of those pages.
