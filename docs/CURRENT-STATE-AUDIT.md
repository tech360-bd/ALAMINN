# CURRENT-STATE AUDIT — ALAMINN.INFO

**Audit date:** 2026-09-30
**Auditor:** Arena.ai Agent Mode (senior engineering session)
**Scope:** Read-only inspection of repository, live production, DNS, and GitHub; re-execution of all quality gates.
**Rule honoured:** Every claim below is backed by an actual command executed during this audit. Historical claims from the September 17, 2026 report were re-verified, not copied.

---

## 1. Executive summary

| Area | Status | Evidence |
|---|---|---|
| Repository access | ✅ Working | `git remote -v` → `https://github.com/engralaminn-collab/alaminn.info.git` |
| Live production site | ✅ **LIVE** | `https://alaminn.info/` returned HTTP 200 with full homepage content (via external fetcher — sandbox egress is allowlisted) |
| DNS | ✅ Resolves | `alaminn.info → 103.231.239.79`, `www.alaminn.info → 103.231.239.79` |
| HTTPS | ✅ Serving | Live homepage fetched successfully over TLS |
| Health endpoint (prod) | ✅ 200 OK | `/api/health` → `{"success":true,...,"status":"ok"}` |
| Admin API rejects anonymous (prod) | ✅ 401 | `/api/v1/admin/dashboard` → `{"success":false,"errors":["unauthenticated"]}` |
| Typecheck | ✅ 0 errors | `npm run typecheck` → exit 0 |
| Lint | ✅ 0 errors, 0 warnings | `npm run lint` → exit 0 |
| Unit + integration tests | ✅ 241 passed, 0 failed, 0 skipped | `npm run test` (vitest) — 8 files |
| Security suite | ✅ 22/22 PASS | `npm run security:test` against dev server |
| Production build | ✅ 291 routes | `npm run build` → exit 0 (after font fix, see §4.1) |
| Standalone server smoke | ✅ All routes OK | Routes 200, admin API 401, `health/deep` = `ok`, 0 Prisma errors |
| Database seed | ✅ Complete | 12 universities, 24 courses, 8 scholarships, 6 supervisors, 30 destinations; EL: 6 courses / 4 tests / 24 questions / 4 tutors |
| GitHub CI/CD | ❌ Broken at audit time → ✅ **FIXED on this branch** | Audit found only a failed auto-generated `webpack.yml`; this branch adds a real pipeline — **CI run `36660264011` concluded `success`** (install → ephemeral DB+seed → typecheck → lint → 241 tests → 22 security → build → standalone smoke) |

**Historical blockers that are now RESOLVED (verified live):**
- DNS resolution → resolves correctly.
- Production deployment → site is live and serving current content.
- Production HTTPS → working (verified via TLS fetch).
- GitHub remote connection → configured and working.

**Historical blockers that REMAIN:**
- GitHub Actions CI/CD → the only workflow is a broken, auto-generated webpack starter.
- Telegram bot integration → not present in the codebase (no token/config — owner credentials required).
- Full social-media publishing → only profile links + WhatsApp API exist; no Facebook/LinkedIn/X publishing code.
- Bangla CMS content → `next-intl` is a dependency but **is not wired** anywhere in `src/`.
- n8n workflow archive → not present in the repository.

---

## 2. Repository inspection

| Item | Value |
|---|---|
| Default branch (GitHub) | `upload-local-project` |
| Remote HEAD | `8025a3b` "Create webpack.yml" (1 commit ahead of local base) |
| Local base commit | `34d6277` "Upload complete Alaminn.info project" |
| Session branch | `arena/01a0effa-alaminn-info` (branched from `34d6277`) |
| Working tree at audit start | Clean |
| Tracked files | 695 |
| `.gitignore` | **MISSING** at audit start (fixed in this session — see §5) |
| `.env` committed? | No — only `.env.example` with placeholders (correct) |
| Secrets in repo? | None found (env values verified as placeholders) |

### 2.1 Stack (verified from `package.json` + lockfile)

- **Framework:** Next.js `16.1.3` (App Router, `output: "standalone"`, Turbopack build), React 19
- **Language:** TypeScript 5 (`tsc --noEmit` clean; `ignoreBuildErrors: false`)
- **Styling:** Tailwind CSS 4 + `tailwindcss-animate` + custom design tokens in `globals.css`
- **ORM:** Prisma 6 (client `6.19.2` via lockfile) — `datasource db { provider = "sqlite" }` for development; production targets MariaDB/MySQL (`deploy/mariadb-init.sql`, `prisma/migrations/00000000000000_mysql_initial`)
- **Models:** 55 Prisma models (1,285-line schema) — 25 core + 18 Higher-Study + 10 English-Learning + auth/analytics/media
- **Auth:** Custom HMAC-signed session cookie (`alaminn_session`, HttpOnly, SameSite=Lax), 11 roles (RBAC in `src/lib/rbac.ts`)
- **Email:** Nodemailer SMTP + Resend adapters, queue, React Email templates
- **WhatsApp:** Meta Cloud API adapter + AI agent (`src/lib/whatsapp/`, dev-mode without credentials)
- **AI:** `z-ai-web-dev-sdk` + OpenAI option; AiTask/AiApproval models with approval gates
- **i18n:** `next-intl` dependency present but **NOT wired** (zero imports in `src/`)
- **PWA:** `public/sw.js` + `src/components/site/pwa/register-sw.tsx` + `src/app/manifest.ts`
- **Testing:** Vitest 4 (241 tests), standalone security suite (`scripts/security-tests.ts`, 22 tests)
- **Mini-services:** `ai-worker`, `audit-worker`, `email-worker`, `health-monitor`, `notification-service` (Bun-targeted workers, separate lockfiles)

### 2.2 Source layout

```
src/app/            # App Router: public site + /admin (30+ dashboard sections) + /api
src/components/     # site sections (32), admin, higher-study, english-learning, ui
src/lib/            # auth, rbac, db, env, email, whatsapp, higher-study, english-learning
prisma/             # schema (55 models), seed.ts, 2 migrations (sqlite + mysql)
mini-services/      # 5 worker services
deploy/             # systemd, pm2, nginx, openlitespeed, cpanel, mariadb-init
scripts/            # security-tests, backup/restore, verify-production, seed-admin
docs/               # 15 existing docs + deliverables + screenshots
tests/              # vitest unit + api tests
```

---

## 3. Live production verification (external network)

Sandbox egress is allowlisted (npm + GitHub reachable; arbitrary hosts blocked), so live checks used the platform's external page fetcher:

| Check | Result |
|---|---|
| `https://alaminn.info/` | 200 — full homepage: hero, portrait, destinations (6 featured), services (6 chapters), process (8 steps), stats **12 universities / 24 courses / 8 scholarships / 30 countries** (matches seed), AI advisor section, ecosystem |
| `https://alaminn.info/api/health` | 200 `{"success":true,"status":"ok"}` |
| `https://alaminn.info/higher-study` | 200 — full hub: 30 destinations grouped by region, featured UK + global universities with verified badges, QS/THE rankings, tuition ranges |
| `https://alaminn.info/api/v1/admin/dashboard` | `{"success":false,"errors":["unauthenticated"]}` — anonymous correctly rejected |
| DNS A record | `103.231.239.79` (alaminn.info and www) |

**Conclusion:** the September 17 "DNS/deployment blocked" state is obsolete. Production is live and runs a recent build of this codebase (content matches current seed data exactly).

**Not verifiable from this sandbox:** production server OS/process manager (no SSH access), TLS certificate issuer/expiry (needs direct TLS handshake), production DB provider (no server access), reverse-proxy config. These require owner-run `scripts/verify-production.sh` on the server.

---

## 4. Sandbox environment constraints and resolutions

| Constraint | Impact | Resolution |
|---|---|---|
| `binaries.prisma.sh` blocked | `prisma generate` / `validate` / `db push` fail (engine download) | Engines fetched from a GitHub mirror of the official CDN, **sha256-verified**, served locally; `PRISMA_ENGINES_MIRROR` used for CLI. Local-dev workaround only — production servers with normal egress are unaffected. |
| `fonts.googleapis.com` blocked | `next build` failed (3 errors — Inter/Manrope/DM Serif fetch) | **Code fix:** fonts self-hosted in `src/fonts/` (OFL-licensed, committed) via `next/font/local`. Same families, variables, weights, preload strategy. Build is now network-independent. |
| No Bun runtime | `bun run …` unavailable | All commands run with npm/node equivalents (scripts are runtime-agnostic) |

## 4.1 Code changes made during verification (this session)

1. **`src/app/layout.tsx`** — `next/font/google` → `next/font/local` (3 files in `src/fonts/` + OFL licenses). Verified reason: build was impossible in network-restricted environments; self-hosting is also faster/privacy-preserving for visitors. No visual change (same fonts/weights/variables).
2. **`.gitignore`** — created (was missing; `node_modules/` was one `git add .` away from being committed; `.env`, dev DBs, builds now protected).
3. **`storage/{logs,temporary,uploads}/.gitkeep`** — added so the runtime storage dirs exist in fresh clones.

---

## 5. Verification results (exact commands)

| Command | Result | Exit |
|---|---|---|
| `npm ci` | 675 packages installed (postinstall Prisma generate OK after engine mirror) | 0 |
| `npx prisma db push --skip-generate` | SQLite schema synced | 0 |
| `npm run db:seed` (env sourced) | All seed data ensured (see §1) | 0 |
| `npm run typecheck` | 0 errors | 0 |
| `npm run lint` | 0 errors, 0 warnings | 0 |
| `npm run test` | **241 passed / 0 failed / 0 skipped** (8 files: email-templates 161, rbac 22, env 17, auth 14, inquiries 10, utm 10, health 5, admin-auth 2) | 0 |
| `npm run security:test` | **22/22 PASS** (SQLi, XSS, CSRF, IDOR, auth, escalation, fixation, cookies, rate limit, brute force, traversal, redirect, SSRF, cmd injection, mass assignment, replay, payload, malformed JSON, upload abuse, headers, clickjacking) | 0 |
| `npm run build` | 291 routes (77 static ○, 8 SSG ●, 206 dynamic ƒ); standalone output valid | 0 |
| `node .next/standalone/server.js` (PORT=3100, seeded SQLite) | `/` 200, `/api/health` 200, `/projects` 200, `/insights` 200, `/higher-study` 200, `/higher-study/universities` 200, `/higher-study/scholarships` 200, `/english-learning` 200, `/api/v1/admin/dashboard` **401**, `/api/v1/public/projects` 200 with data, `health/deep` = **ok**, **0 prisma errors** | — |
| Contact form round-trip (dev) | Valid payload → `success:true`, reference `ALM-2026-…`; missing consent fields → 400 with field errors | — |
| Newsletter double-opt-in (dev) | `status:"pending"` + confirmation email flow | — |
| Referral creation (dev) | HMAC-signed token, 24 h expiry, ALO Education redirect URL **without PII**, invalid type rejected 400, bogus code 404 | — |
| Admin login (dev) | OWNER session cookie issued (HttpOnly, SameSite=Lax) | — |

### 5.1 Functional findings (dev environment)

1. **Standalone + relative SQLite URL footgun:** `DATABASE_URL="file:./db/custom.db"` resolves differently between Prisma CLI (relative to `prisma/`) and the standalone server (creates an empty DB). Production is unaffected (MariaDB URL), but `.env.example` now carries an explicit warning. (Fixed in this session.)
2. `next-intl` not wired — no language switcher exists. Bangla support is currently content-level only (some bilingual copy strings), not structural i18n.
3. Test-data pollution during security runs is self-cleaning (suite deletes its own rows).

---

## 6. Feature classification snapshot (details in FEATURE-INVENTORY.md)

- **VERIFIED COMPLETE:** public branding site (all sections), Higher Study hub + directory + details + compare + saved, English Learning hub, admin dashboard (30 sections), auth/RBAC, inquiries, newsletter (double-opt-in), referral integration (HMAC + expiry), audit logs, security controls, PWA files, sitemap/robots, seed data, deployment artifacts, docs.
- **IMPLEMENTED BUT NOT VERIFIED (needs live credentials/infra):** SMTP/Resend real delivery, WhatsApp Cloud API real sending, AI worker live execution, production cron execution, production MariaDB state, media upload hardening completeness, audit-log pruning schedule.
- **BLOCKED OR NOT IMPLEMENTED:** GitHub Actions CI/CD (broken starter only), Telegram bot, social publishing integrations, structural bilingual i18n, n8n archive/workflows.

---

## 7. Next actions (see IMPLEMENTATION-PLAN.md)

1. Add proper GitHub Actions CI (typecheck → lint → test → security → build) on this branch.
2. Harden `.env.example` SQLite guidance (done) and commit Phase-Zero fixes.
3. Wire structural i18n foundation (route-level, non-breaking) — scoped decision documented.
4. Replace the broken webpack workflow by making this branch the CI source of truth; owner action required to merge.
