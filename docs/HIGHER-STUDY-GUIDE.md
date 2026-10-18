# HIGHER STUDY PLATFORM GUIDE

Status 2026-09-30: **live in production** (verified) and locally verified end-to-end. This guide documents architecture, data, the referral flow, and how to operate/extend the platform.

## 1. What it is

A dedicated higher-study discovery experience at `/higher-study` with its own compact header/navigation (logo returns to the main site). Covers 30 study destinations with verified universities, courses, scholarships, PhD/research projects, supervisors, resources, intakes, student stories and events.

## 2. Data model (Prisma, `HigherStudy*` models)

18 models: Country, City, University, Subject, Intake, Course, Scholarship, ResearchArea, ResearchProject, Supervisor, Resource, StudentStory, Event, SavedItem, Comparison, Referral, Alert, AuditLog, ImportJob. Every content change is recorded in the module's audit log with before/after data.

**Seed baseline (matches production):** 12 universities · 24 courses · 8 scholarships · 6 research areas · 6 research projects · 6 supervisors · 8 subjects · 4 intakes · 8 resources · 4 student stories · 4 events · 10 cities · 30 destinations (6 detailed + 24 extended).

Seed command (dev): `npm run db:push && npm run db:seed` (requires `ADMIN_BOOTSTRAP_PASSWORD`, ≥12 chars).

## 3. Key routes

- Directory/search: `/higher-study/{destinations,universities,courses,scholarships,research,supervisors,subjects,intakes,resources}`
- Detail pages (SSG where possible): `/higher-study/universities/[universitySlug]` (+ `/courses`, `/research`, `/scholarships`), `/destinations/[countrySlug]`, `/courses/[courseSlug]`, `/scholarships/[scholarshipSlug]`, `/research/[researchSlug]`, `/supervisors/[supervisorSlug]`
- Tools: `/compare/{universities,courses,scholarships}`, `/saved`, `/eligibility-check`, `/course-finder`, `/application-guide`, `/apply`, `/book-consultation`
- API: `/api/v1/higher-study/*` (public reads rate-limited; admin CRUD under `/api/v1/higher-study/admin/*` requiring session + RBAC)
- Health: `/api/v1/higher-study/health`

## 4. ALO Education referral flow (verified)

1. User clicks *Apply* on any entity → `POST /api/v1/higher-study/referral` with `{referralType, entitySlug…, consentGiven:true}` (consent REQUIRED; 12 valid referral types in `src/lib/higher-study/constants.ts`; 20 req/min/IP).
2. Server creates a `HigherStudyReferral` audit record and returns `{referralCode, referralToken, targetUrl, expiresAt}`.
3. `referralToken` = HMAC-signed payload `{referralCode, referralType, iat, exp}` — **24-hour expiry**, secret = `HIGHER_STUDY_REFERRAL_SECRET` (≥32 chars, set in production).
4. `targetUrl` points at ALO Education (`aloeducation.com/student/register?source=ALAMINN_HIGHER_STUDY&referralType=…&referralCode=…`) — **no PII in the URL**.
5. Browser redirects the student; ALO Education validates the token server-side; duplicate-account prevention and webhook confirmation live on the ALO side (`/api/cron/referral-retry` retries unconfirmed referrals).
6. Unknown referral codes are rejected (404); invalid/expired tokens fail signature/expiry checks.

**Do not claim a referral succeeded until the ALO Education side confirms via webhook/retry confirmation.**

## 5. Admin operations

- Content managers: `/admin/higher-study/{countries,cities,universities,courses,scholarships,research-areas,research-projects,supervisors,subjects,intakes,resources,student-stories,events}` (session + role required).
- Deadlines automation: `/api/cron/phd-deadlines`, `/api/cron/scholarship-deadlines` (CRON_SECRET-guarded).
- Verification: entities carry verification status shown as badges on public pages.

## 6. Regression checklist (all verified 2026-09-30)

- [x] Directory pages return 200 with data (universities, scholarships verified locally + in production)
- [x] Referral creation with consent; invalid type → 400; unknown code → 404
- [x] Token contains no PII and expires in 24 h
- [x] Rate limiting active (20/min)
- [x] Compare/saved routes build and render
- [x] Admin API rejects anonymous access (401) — dev + production
- [x] Seed idempotent (upserts, safe to re-run)
