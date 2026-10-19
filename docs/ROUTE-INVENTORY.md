# ROUTE INVENTORY — ALAMINN.INFO

Generated from the actual production build output (`npm run build`, 2026-09-30).

**Total: 291 routes** — 77 static (○ prerendered), 8 SSG (● `generateStaticParams`), 206 dynamic (ƒ server-rendered on demand), plus the Next.js 16 proxy (middleware).

Render legend: ○ Static · ● SSG · ƒ Dynamic

## Public site

| Route | Render |
|---|---|
| `/` | ○ |
| `/about` | ○ |
| `/work-with-me` | ○ |
| `/expertise` | ○ |
| `/impact` | ○ |
| `/projects` | ○ |
| `/projects/[slug]` | ƒ |
| `/case-studies` | ○ |
| `/case-studies/[slug]` | ƒ |
| `/insights` | ƒ |
| `/articles` | ○ |
| `/articles/[slug]` | ƒ |
| `/media` | ○ |
| `/ecosystem` | ○ |
| `/ecosystem/alo-education` | ○ |
| `/ecosystem/alo-labs` | ○ |
| `/ecosystem/tech360` | ○ |
| `/contact` | ○ |
| `/legal/privacy` | ○ |
| `/legal/terms` | ○ |

## Higher Study platform (`/higher-study/*`, compact header)

| Route | Render |
|---|---|
| `/higher-study` | ƒ |
| `/higher-study/destinations` | ƒ |
| `/higher-study/destinations/[countrySlug]` | ● (SSG per country) |
| `/higher-study/universities` | ƒ |
| `/higher-study/universities/uk` | ƒ |
| `/higher-study/universities/[universitySlug]` | ● (SSG per university) |
| `/higher-study/universities/[universitySlug]/courses` | ƒ |
| `/higher-study/universities/[universitySlug]/research` | ƒ |
| `/higher-study/universities/[universitySlug]/scholarships` | ƒ |
| `/higher-study/uk-universities` | ƒ |
| `/higher-study/global-universities` | ƒ |
| `/higher-study/courses` | ƒ |
| `/higher-study/courses/[courseSlug]` | ƒ |
| `/higher-study/course-finder` | ƒ |
| `/higher-study/subjects` | ○ |
| `/higher-study/subjects/[subjectSlug]` | ƒ |
| `/higher-study/scholarships` | ƒ |
| `/higher-study/scholarships/[scholarshipSlug]` | ● (SSG per scholarship) |
| `/higher-study/phd-research` | ƒ |
| `/higher-study/research` | ƒ |
| `/higher-study/research/[researchSlug]` | ƒ |
| `/higher-study/supervisors` | ƒ |
| `/higher-study/supervisors/[supervisorSlug]` | ● (SSG per supervisor) |
| `/higher-study/intakes` | ○ |
| `/higher-study/intakes/[intakeSlug]` | ƒ |
| `/higher-study/resources` | ƒ |
| `/higher-study/resources/[resourceSlug]` | ƒ |
| `/higher-study/study-resources` | ƒ |
| `/higher-study/application-guide` | ƒ |
| `/higher-study/compare` (+ `/universities`, `/courses`, `/scholarships`) | ƒ |
| `/higher-study/saved` | ƒ |
| `/higher-study/apply` | ƒ |
| `/higher-study/book-consultation` | ƒ |
| `/higher-study/eligibility-check` | ƒ |

## English Learning (`/english-learning/*`)

| Route | Render |
|---|---|
| `/english-learning` | ƒ |
| `/english-learning/courses` | ƒ |
| `/english-learning/courses/[slug]` | ƒ |
| `/english-learning/practice-tests` | ƒ |
| `/english-learning/practice-tests/[slug]` | ƒ |
| `/english-learning/tutors` | ƒ |
| `/english-learning/tutors/[slug]` | ƒ |
| `/english-learning/resources` | ƒ |
| `/english-learning/resources/[slug]` | ƒ |
| `/english-learning/apply` | ƒ |
| `/english-learning/book-consultation` | ƒ |
| `/english-learning/book-tutor` | ƒ |
| `/english-learning/eligibility-check` | ƒ |
| `/english-learning/progress` | ƒ |

## Admin dashboard (`/admin/*`, session-protected)

Overview, login, forgot/reset password, ai-assistant, analytics, approvals, articles, audit-logs, case-studies, companies, contacts, documents, inquiries, media, meetings, newsletter, notes, notifications, opportunities, projects, roles, seo, settings, tasks, users, whatsapp-ai, plus Higher-Study content managers (cities, countries, courses, events, intakes, research-areas, research-projects, resources, scholarships, student-stories, subjects, supervisors, universities) and English-Learning content managers (courses, lessons, practice-tests, questions, resources, tutors).

## API surface (`/api/*`)

| Group | Endpoints |
|---|---|
| Health | `/api/health`, `/api/health/deep` (3 tiers: public/auth/admin), `/api/readiness` |
| Auth | `/api/v1/auth/{login,logout,session,forgot-password,reset-password}` |
| Public content | `/api/v1/public/{projects,articles}` |
| Inquiries | `/api/v1/inquiries` (rate-limited, consent-validated) |
| Meetings | `/api/v1/meetings` |
| Newsletter | `/api/v1/newsletter` (double-opt-in) |
| Analytics | `/api/v1/analytics` |
| AI | `/api/v1/ai/{tasks,approvals}` (approval-gated) |
| Admin API | `/api/v1/admin/*` — dashboard, users, roles, contacts, inquiries, opportunities, projects, articles, case-studies, companies, documents, notes, tasks, meetings, newsletter, notifications, approvals, ai-tasks, audit-logs, analytics, media, uploads, seo, settings (all require session + RBAC) |
| Higher Study | `/api/v1/higher-study/{universities,courses,scholarships,research,supervisors,subjects,destinations,intakes,resources,events,student-stories,alerts,compare,saved,eligibility-check,consultation,referral,referral/[code],health,admin/*}` |
| English Learning | `/api/v1/english-learning/*` |
| WhatsApp | `/api/v1/whatsapp/{webhook,send,status,chat,admin}` (Cloud API signature validation) |
| Cron (secret-guarded) | `/api/cron/{backup,data-verification,email-queue,health-monitor,notification-queue,phd-deadlines,referral-retry,scholarship-deadlines,session-cleanup,sitemap-generate,temp-cleanup}` |

## SEO/PWA infrastructure

| Route | Purpose |
|---|---|
| `/sitemap.xml` | ○ dynamic sitemap (static + all DB entities) |
| `/robots.txt` | ○ |
| `/manifest.webmanifest` | ○ PWA manifest |
| `/icon`, `/apple-icon` | ○ generated icons |
| `public/sw.js` | Service worker (offline cache) |
