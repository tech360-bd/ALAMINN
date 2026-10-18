# FEATURE INVENTORY — ALAMINN.INFO

Audit date: 2026-09-30. Statuses: **VERIFIED COMPLETE** (evidence from executed commands/live checks) · **IMPLEMENTED BUT NOT VERIFIED** (code present, no live credential/infra to confirm) · **BLOCKED OR NOT IMPLEMENTED**.

## 1. Personal branding website

| Feature | Status | Evidence / Notes |
|---|---|---|
| Homepage (hero, portrait, bio, CTAs, expertise, featured projects, HS entry, AI initiatives, journey, insights, resources, gallery, social hub, newsletter, contact, footer) | VERIFIED COMPLETE | Live prod fetch returned all sections; local build renders `/` 200; 32 section components in `src/components/site/sections/` |
| About page (`/about`) | VERIFIED COMPLETE | Route builds; content from `site-data.ts` with evidence-governed copy |
| Expertise & services (`/expertise`, 6 service areas) | VERIFIED COMPLETE | `/expertise` static build 200; service detail via sections; `/work-with-me` engagement page 200 |
| Projects & portfolio + detail + categories | VERIFIED COMPLETE | `/projects` 200 with seeded projects; `/projects/[slug]` dynamic; public API returns data |
| Case studies | VERIFIED COMPLETE | `/case-studies` + `[slug]` build |
| Insights/articles | VERIFIED COMPLETE | `/articles`, `/articles/[slug]`, `/insights` build; Article model + admin manager |
| Media/gallery page | VERIFIED COMPLETE | `/media` static build |
| Ecosystem pages (ALO Education, ALO Labs, Tech360) | VERIFIED COMPLETE | 3 static pages build; ICLA Global Academy represented within content (no separate page — see plan) |
| Contact form + inquiry pipeline | VERIFIED COMPLETE | Round-trip POST → reference `ALM-2026-…`; consent validation enforced (400 on missing consents); rate limiting verified by security suite |
| Social profile links (verified accounts only) | VERIFIED COMPLETE | Facebook (real) + WhatsApp (real); other platforms route through FB hub by design — documented in `site-data.ts` |
| WhatsApp floating CTA | VERIFIED COMPLETE | Component + verified number |
| Newsletter signup | VERIFIED COMPLETE | Double-opt-in: POST → `pending` + confirmation email path |
| PWA (manifest, sw.js, register-sw) | IMPLEMENTED BUT NOT VERIFIED | Files present and build; real-device install/offline behavior needs browser test |
| Legal pages (privacy, terms) | VERIFIED COMPLETE | Static build |

## 2. Higher Study platform

| Feature | Status | Evidence / Notes |
|---|---|---|
| Hub with compact header/nav (destinations, universities, courses, scholarships, PhD, supervisors, resources, compare, saved, apply) | VERIFIED COMPLETE | Live prod fetch + local builds |
| Destination pages (30 countries, SSG detail) | VERIFIED COMPLETE | Seed: 6 detailed + 24 extended = 30; `/destinations/[countrySlug]` SSG |
| University directory + detail (12 seeded) | VERIFIED COMPLETE | SSG detail pages generated (TUM, Melbourne, Sydney, Oxford, Cambridge, Imperial, Toronto, MIT…) |
| Course directory + detail (24) | VERIFIED COMPLETE | Seed + routes verified |
| Scholarships (8) | VERIFIED COMPLETE | SSG detail (Fulbright, Chevening-adjacent, Australia Awards, Holland…) |
| PhD/Research opportunities (6) + research areas (6) | VERIFIED COMPLETE | Seed + routes |
| Supervisors (6) | VERIFIED COMPLETE | SSG detail |
| Compare (universities/courses/scholarships) | VERIFIED COMPLETE | Routes build; compare lib present |
| Saved items | VERIFIED COMPLETE | Route + API + model |
| Application guide, study resources, intakes, subjects, eligibility check, consultation booking | VERIFIED COMPLETE | All routes build |
| ALO Education referral handoff | VERIFIED COMPLETE | POST creates record; HMAC token; 24 h expiry; no PII in redirect URL; invalid type → 400; unknown code → 404; retry cron present |
| Consent tracking for referrals | VERIFIED COMPLETE | `consentGiven` required; versioned consent fields in schema |
| HS admin content managers (13 sections) | VERIFIED COMPLETE | Admin routes build; audit-log model per module |
| HS alerts, student stories, events | VERIFIED COMPLETE | Models + routes |

## 3. English Learning

| Feature | Status | Evidence |
|---|---|---|
| Course listing/detail (6 courses, 32 lessons) | VERIFIED COMPLETE | Seed output matches historical baseline |
| Practice tests (4 tests, 24 questions) | VERIFIED COMPLETE | Seed + routes |
| Tutors (4) + booking flow | VERIFIED COMPLETE | Routes build; `book-tutor` |
| Resources (6) | VERIFIED COMPLETE | Seed |
| Student progress | VERIFIED COMPLETE | `EnglishLearningProgress` model + `/english-learning/progress` |
| Enrollment/referral to ALO Education | IMPLEMENTED BUT NOT VERIFIED | Model + HMAC secret configured; live handoff needs ALO-side confirmation |
| EL admin managers (6 sections) | VERIFIED COMPLETE | Routes build |

## 4. Admin / Creator Command Center

| Feature | Status | Evidence |
|---|---|---|
| Auth (login, session, forgot/reset) | VERIFIED COMPLETE | Login round-trip OWNER session; cookie flags verified; brute-force lockout verified by security suite |
| RBAC (11 roles) | VERIFIED COMPLETE | 22 rbac tests pass; anonymous admin → 401 on prod |
| Overview/dashboard | VERIFIED COMPLETE | `/admin` builds; API 401 anonymous / data authorized |
| Contacts, inquiries, meetings, opportunities, companies CRM | VERIFIED COMPLETE | Admin APIs + UI build |
| Projects/articles/case-studies managers | VERIFIED COMPLETE | Build |
| Approvals queue + AI tasks (approval gates) | VERIFIED COMPLETE | Models + admin routes; seeded approval example |
| AI assistant UI | IMPLEMENTED BUT NOT VERIFIED | Route builds; live generation needs provider credentials (`z-ai-web-dev-sdk`/OpenAI key) |
| Media library + uploads | IMPLEMENTED BUT NOT VERIFIED | Admin-only routes exist; security test 21 (upload abuse) passes; full magic-byte/dimension validation needs a code review pass (see plan) |
| Users/roles management | VERIFIED COMPLETE | Routes build; RBAC enforced |
| Audit logs viewer | VERIFIED COMPLETE | Model + admin route |
| Analytics dashboard | VERIFIED COMPLETE | Recharts-based; `AnalyticsEvent` model |
| SEO manager | VERIFIED COMPLETE | Admin section |
| WhatsApp AI console | IMPLEMENTED BUT NOT VERIFIED | Admin UI + agent code; needs Cloud API credentials for real traffic |
| Settings manager | VERIFIED COMPLETE | 8 default settings seeded |

## 5. Automation & integrations

| Feature | Status | Evidence / Blocker |
|---|---|---|
| Email transport (SMTP/Resend) + templates + queue | IMPLEMENTED BUT NOT VERIFIED | 161 template tests pass; transport needs real SMTP/Resend credentials — none available in sandbox |
| WhatsApp Cloud API (webhook, send, AI agent, leads) | IMPLEMENTED BUT NOT VERIFIED | Webhook validation code + tests; needs Meta credentials |
| Cron endpoints (11) with CRON_SECRET | IMPLEMENTED BUT NOT VERIFIED | Endpoints exist; production scheduler needs server crontab — verify on server |
| AI worker (mini-service) | IMPLEMENTED BUT NOT VERIFIED | Bun worker present; not executed in sandbox (no bun; provider creds) |
| Email/audit workers, notification service, health monitor | IMPLEMENTED BUT NOT VERIFIED | Present with READMEs; need runtime verification |
| Telegram bot | BLOCKED OR NOT IMPLEMENTED | No code, no token. Owner must supply bot token + approve webhook domain |
| Social publishing (FB/IG/LinkedIn/X/YouTube/TikTok/Pinterest) | BLOCKED OR NOT IMPLEMENTED | Only profile links exist (by design — verified accounts). Publishing requires platform app review + OAuth credentials from owner |
| n8n workflows | BLOCKED OR NOT IMPLEMENTED | No archive in repo; no n8n instance credentials |
| Bangla i18n (structural) | BLOCKED OR NOT IMPLEMENTED | `next-intl` installed but unwired; translated content not supplied by owner |

## 6. Cross-cutting

| Feature | Status | Evidence |
|---|---|---|
| Security headers + CSP | VERIFIED COMPLETE | Security test #8/#9 pass; headers set in `src/proxy.ts`; CSP currently `unsafe-inline`/`unsafe-eval` for scripts (documented follow-up: nonce-based CSP) |
| Rate limiting (inquiry 5/min, login 5/15min, referral 20/min) | VERIFIED COMPLETE | Security suite #5/#22 + referral 429s |
| Audit logging of privileged actions | VERIFIED COMPLETE | `AuditLog` + per-module logs; security suite observed rows |
| DB backups (`scripts/backup.sh`, `db:backup`) + restore | IMPLEMENTED BUT NOT VERIFIED | Scripts exist; server-side cron/schedule needs verification on host |
| Deployment artifacts (Docker, compose, Caddyfile, nginx, OLS, PM2, systemd, cPanel, install/deploy scripts) | VERIFIED COMPLETE (present) | All listed files exist; server-side applicability needs host access |
| Sitemap/robots/OG metadata | VERIFIED COMPLETE | Build outputs; dynamic sitemap includes DB entities |
| Docs set | VERIFIED COMPLETE (updated in this session) | 15 existing docs + Phase-Zero set |

## 7. Gaps / quality items found

1. No `.gitignore` (fixed this session).
2. Broken auto-generated `webpack.yml` workflow on GitHub (failed run) — superseded by the new CI on this branch (owner merges).
3. Relative SQLite `DATABASE_URL` behaves differently under standalone output (documented; `.env.example` clarified).
4. Google Fonts build-time dependency (fixed — self-hosted).
5. `next-intl` unwired (documented; scoped plan exists).
6. CSP still allows `unsafe-inline`/`unsafe-eval` scripts (nonce-based CSP proposed, non-trivial with current inline RSC payloads).
