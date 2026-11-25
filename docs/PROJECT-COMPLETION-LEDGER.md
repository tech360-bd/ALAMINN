# ALAMINN.INFO Project Completion Ledger

**HEAD:** b10b4f5
**Branch:** arena/665460a0-alaminn
**Generated:** 2026-11-24 UTC

## Status key
- PASS/VERIFIED: evidence available
- PARTIAL: implemented but not fully runtime-verified or has known limitation
- BLOCKED: external dependency/permission/runtime missing
- NOT VERIFIED: not executed in this environment
- NOT APPLICABLE: generated/vendor/non-runtime artifact

## Summary

- Total files inventoried (excl .git/node_modules/.next/coverage): 1193
- Pages: 158
- Layouts: 5
- API routes: 268
- Components: 183
- Lib modules: 121
- Tests: 79
- Prisma files: 30
- Deploy/runtime files: 22
- CI files: 0
- Docs: 147

## Verification evidence (this session / prior blocker closure)

- `npm run typecheck`: PASS (exit 0)
- `npm run lint`: PASS (0 errors, 61 warnings baseline)
- `npm run build`: PASS with disposable migrated SQLite DB
- `npm test` full suite: 61 passed / 8 failed files; 663 passed / 1 failed / 41 skipped. 7 failed files are disposable-target env-gated when run outside disposable runner; 1 staff-bootstrap flake passed on rerun and hardened.
- `npm run test:disposable` (prior closure): integration 7 files/41 tests PASS, security 22/22 PASS
- `npm audit`: 0 vulnerabilities after effect override
- Docker verification: BLOCKED (docker CLI unavailable in sandbox)
- MariaDB disposable migration: BLOCKED (no docker/mysql/mariadb in sandbox)
- Production deployment: BLOCKED (no authorized production credentials/host access/approval)

## File-by-file ledger (by area)

### Pages (`src/app/**/page.tsx`)

| File | Disposition | Evidence |
| --- | --- | --- |
| src/app/about/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/ai-agents/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/ai-assistant/humanizer/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/ai-assistant/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/ai-chat/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/ai-providers/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/analytics-dashboard/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/analytics/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/approvals/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/articles/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/audit-logs/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/case-studies/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/cms/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/communication-controls/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/companies/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/contacts/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/crm/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/diagrams/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/documents/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/email-builder/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/email/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/endorsements/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/english-learning/courses/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/english-learning/lessons/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/english-learning/practice-tests/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/english-learning/questions/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/english-learning/resources/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/english-learning/tutors/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/forgot-password/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/cities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/countries/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/courses/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/events/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/intakes/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/monitoring/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/research-areas/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/research-projects/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/resources/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/scholarships/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/student-stories/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/subjects/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/supervisors/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/higher-study/universities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/inbox/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/inquiries/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/integrations/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/live-chat/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/login/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/marketing/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/media/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/meetings/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/newsletter/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/notes/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/notifications/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/opportunities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/projects/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/reset-password/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/roles/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/seo-dashboard/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/seo/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/settings/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/sms/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social-scheduler/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/accounts/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/approvals/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/content/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/inbox/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/personality/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/social/rules/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/tasks/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/uci/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/users/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/video-studio/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/admin/whatsapp-ai/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/articles/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/articles/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/case-studies/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/case-studies/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/console/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/contact/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/content/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/dashboard/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/ecosystem/alo-education/directory/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/ecosystem/alo-education/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/ecosystem/alo-labs/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/ecosystem/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/ecosystem/tech360/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/apply/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/book-consultation/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/book-tutor/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/courses/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/courses/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/eligibility-check/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/practice-tests/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/practice-tests/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/progress/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/resources/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/resources/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/tutors/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/english-learning/tutors/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/expertise/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/ai-services/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/application-guide/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/apply/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/book-consultation/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/compare/courses/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/compare/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/compare/scholarships/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/compare/universities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/course-finder/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/courses/[courseSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/courses/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/destinations/[countrySlug]/[citySlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/destinations/[countrySlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/destinations/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/eligibility-check/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/global-universities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/intakes/[intakeSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/intakes/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/phd-research/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/proposal-builder/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/research/[researchSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/research/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/resources/[resourceSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/resources/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/saved/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/scholarships/[scholarshipSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/scholarships/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/sop-builder/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/study-resources/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/subjects/[subjectSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/subjects/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/supervisors/[supervisorSlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/supervisors/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/uk-universities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/universities/[universitySlug]/courses/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/universities/[universitySlug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/universities/[universitySlug]/research/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/universities/[universitySlug]/scholarships/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/universities/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/higher-study/universities/uk/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/impact/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/insights/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/legal/privacy/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/legal/terms/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/login/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/media/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/newsletter/unsubscribe/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/projects/[slug]/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/projects/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/reports/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/settings/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |
| src/app/work-with-me/page.tsx | VERIFIED (typecheck/build route compile) | build/typecheck/lint; runtime smoke not all individually executed |

### Layouts

| File | Disposition | Evidence |
| --- | --- | --- |
| src/app/admin/layout.tsx | VERIFIED (typecheck/build) | build/typecheck |
| src/app/admin/uci/layout.tsx | VERIFIED (typecheck/build) | build/typecheck |
| src/app/english-learning/layout.tsx | VERIFIED (typecheck/build) | build/typecheck |
| src/app/higher-study/layout.tsx | VERIFIED (typecheck/build) | build/typecheck |
| src/app/layout.tsx | VERIFIED (typecheck/build) | build/typecheck |

### API routes (`src/app/api/**/route.ts`)

| File | Disposition | Evidence |
| --- | --- | --- |
| src/app/api/auth/login/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/auth/logout/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/auth/me/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/auth/password-reset/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/auth/register/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/audit-log-prune/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/backup/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/data-verification/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/email-queue/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/health-monitor/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/higher-study-monitor/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/notification-queue/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/phd-deadlines/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/referral-retry/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/scholarship-deadlines/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/session-cleanup/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/sitemap-generate/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/social-publish/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/cron/temp-cleanup/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/health/deep/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/health/ready/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/health/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/readiness/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/settings/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/staff/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/staff/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/admin/action/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/admin/quality/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/admin/queue/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/audit/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/export/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/import/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/institutions/name/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/institutions/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/jobs/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/programmes/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/sources/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/uci/stats/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/umc/[...path]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-agent/chat/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-agent/providers/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-agent/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-agent/tools/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-chat/conversations/[id]/messages/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-chat/conversations/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-chat/conversations/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-provider/ollama-cloud/agent-model/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-provider/ollama-cloud/health/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-provider/ollama-cloud/models/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-provider/ollama-cloud/usage/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-tasks/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/ai-tasks/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/analytics-dashboard/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/analytics/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/approvals/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/approvals/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/articles/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/articles/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/audit-logs/export/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/audit-logs/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/case-studies/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/case-studies/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/cms/entries/[id]/preview/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/cms/entries/[id]/revisions/[revisionId]/restore/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/cms/entries/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/cms/entries/[id]/status/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/cms/entries/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/command-center/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/communication-controls/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/companies/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/companies/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/contacts/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/contacts/export/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/contacts/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/crm/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/crm/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/dashboard/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/documents/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/documents/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/email-builder/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/email-builder/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/endorsements/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inbox/attachments/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inbox/attachments/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inbox/conversations/[id]/messages/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inbox/conversations/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inbox/conversations/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inquiries/export/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/inquiries/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/integrations/[id]/test/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/integrations/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/kits/documents/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/kits/documents/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/kits/generate/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/live-chat/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/live-chat/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/marketing/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/marketing/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/media/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/media/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/meetings/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/meetings/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/newsletter/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/newsletter/export/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/newsletter/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/notes/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/notes/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/notifications/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/notifications/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/opportunities/export/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/opportunities/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/projects/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/projects/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/seo-dashboard/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/seo/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/settings/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/settings/test-email/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social-scheduler/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social-scheduler/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/accounts/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/accounts/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/approvals/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/approvals/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/automation/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/content/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/content/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/inbox/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/inbox/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/knowledge/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/personality/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/personality/test/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/publishing/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/social/rules/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/tasks/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/tasks/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/uploads/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/users/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/admin/users/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/ai/approvals/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/ai/tasks/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/analytics/track/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/auth/forgot-password/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/auth/login/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/auth/logout/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/auth/reset-password/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/auth/session/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/email/send/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/audit-logs/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/courses/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/courses/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/dashboard/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/lessons/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/lessons/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/practice-tests/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/practice-tests/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/questions/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/questions/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/referrals/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/resources/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/resources/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/tutors/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/admin/tutors/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/courses/[slug]/lessons/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/courses/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/courses/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/enroll/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/health/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/lessons/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/practice-tests/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/practice-tests/[slug]/submit/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/practice-tests/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/progress/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/referral/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/resources/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/resources/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/tutors/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/english-learning/tutors/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/audit-logs/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/cities/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/cities/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/countries/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/countries/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/courses/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/courses/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/dashboard/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/events/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/events/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/import/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/import/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/intakes/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/intakes/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/monitoring/changes/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/monitoring/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/priority-27/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/referrals/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/research-areas/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/research-areas/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/research/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/research/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/resources/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/resources/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/scholarships/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/scholarships/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/student-stories/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/student-stories/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/subjects/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/subjects/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/supervisors/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/supervisors/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/universities/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/admin/universities/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/advisor/chat/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/ai-services/documents/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/ai-services/documents/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/ai-services/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/alerts/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/alerts/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/compare/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/consultation/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/courses/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/courses/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/destinations/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/destinations/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/eligibility-check/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/events/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/health/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/intakes/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/knowledge-search/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/proposal/review/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/proposal/review/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/proposal/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/referral/[code]/confirm/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/referral/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/research/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/research/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/resources/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/resources/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/saved/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/saved/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/scholarships/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/scholarships/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/sop/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/student-stories/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/subjects/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/supervisors/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/supervisors/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/universities/[slug]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/higher-study/universities/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/inquiries/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/meetings/admin/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/meetings/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/newsletter/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/newsletter/unsubscribe/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/newsletter/verify/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/public/articles/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/public/projects/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/sms/send/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/social/webhooks/[platform]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/support/[id]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/support/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/webhooks/inbox/[channel]/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/whatsapp/admin/stats/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/whatsapp/chat/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/whatsapp/send/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/whatsapp/status/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |
| src/app/api/v1/whatsapp/webhook/route.ts | VERIFIED (typecheck/build); PARTIAL runtime | build/typecheck; disposable API suite covers selected routes; full per-route runtime matrix not fully executed |

### Components

| File | Disposition | Evidence |
| --- | --- | --- |
| src/components/admin/admin-shell.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/command-center-overview.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/crud-list.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/dashboard-ai-agent.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/analytics.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/chat.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/crm.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/diagrams.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/email-campaign.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/email.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/humanizer.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/integrations.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/launchpad.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/library.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/marketing.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/seo.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/shared.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/sms.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/social.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/kits/video.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/lib.ts | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/page-primitives.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/resource-dialog.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/admin/upload-button.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/apply-cta.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/breadcrumb.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/course-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/course-filters.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/eligibility-quiz.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/empty-state.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/english-test-runner.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/home-hero-search.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/lesson-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/loading-skeleton.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/newsletter-subscribe.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/pagination-client.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/practice-test-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/progress-dashboard.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/referral-cta.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/resource-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/test-filters.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/tutor-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/english-learning/tutor-filters.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/ai-services-client.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/apply-cta.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/breadcrumb.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/compare-actions.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/compare-button.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/comparison-table.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/consultation-form.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/course-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/eligibility-checker-form.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/empty-state.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/filter-panel.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/higher-study-explorer.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/higher-study-navbar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/higher-study-shell.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/home-hero-search.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/home-newsletter-subscribe.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/list-page-controls.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/loading-skeleton.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/page-hero.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/pagination-client.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/research-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/resource-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/save-button.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/saved-items-client.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/scholarship-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/search-bar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/supervisor-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/tabs-client.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/university-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/higher-study/verification-badge.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/analytics-init.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/brand-icons.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/command-center-bridge.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/command-center.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/constellation.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/detail-modal.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/footer.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/json-ld.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/legal-modals.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/lightbox.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/live-support-widget.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/navbar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/public-chrome.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/pwa/register-sw.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/schedule-meeting-modal.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/scroll-utilities.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/search-palette.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/ai-advisor.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/alo-labs.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/audience-pathways.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/case-studies.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/contact-finale.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/contact-profile-social.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/destination-experience.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/ecosystem.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/editorial-hero.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/executive-intro.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/expertise.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/faq.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/find-your-path.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/hero.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/impact.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/insights.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/journey-timeline.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/latest-updates.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/linkedin-recommendations.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/my-work.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/newsletter.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/photo-gallery.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/profile.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/resources.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/section-primitives.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/services-story.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/skills-radar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/social-hub.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/statistics-story.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/verification.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/work-system.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/sections/work-with-me.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/site-chrome.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/stats-ticker.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/theme-toggle.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/whatsapp/whatsapp-button.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/site/whatsapp/whatsapp-chat-widget.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/social/automation-switch.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/staff/StaffManager.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/uci/AdminView.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/uci/AuditView.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/uci/DirectoryView.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/uci/ProgrammeView.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/uci/SourcesView.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/uci/shared.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/accordion.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/alert-dialog.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/alert.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/aspect-ratio.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/avatar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/badge.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/breadcrumb.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/button.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/calendar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/carousel.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/chart.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/checkbox.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/collapsible.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/command.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/context-menu.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/dialog.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/drawer.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/dropdown-menu.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/form.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/hover-card.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/input-otp.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/input.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/label.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/menubar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/navigation-menu.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/pagination.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/popover.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/progress.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/radio-group.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/resizable.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/scroll-area.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/select.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/separator.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/sheet.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/sidebar.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/skeleton.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/slider.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/sonner.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/switch.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/table.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/tabs.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/textarea.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/toast.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/toaster.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/toggle-group.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/toggle.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |
| src/components/ui/tooltip.tsx | VERIFIED (typecheck/build) | typecheck/build; no per-component browser E2E for all components |

### Lib modules

| File | Disposition | Evidence |
| --- | --- | --- |
| src/lib/admin-api-server.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/admin-api.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/agentos/foundation.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/api-gateway.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/chat-providers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/dashboard-agents.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/free-providers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/free-router.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/free-tools.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/inference-engine.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/knowledge-retrieval.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/model-registry.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/ollama-cloud.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/ai/workflow-executor.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/analytics.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/jwt.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/password.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/rate-limit.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/ratelimit.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/rbac.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/secret.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/session.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/staff-token-session.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/auth/token.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/blur-placeholders.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/cms/revisions.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/cms/state.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/command-center/metrics.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/cron-auth.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/csv.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/database-url.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/db.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/index.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/layout.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/providers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/queue.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/router.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/sender.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/templates.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/email/transport.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/endorsements-server.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/endorsements.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/admin-factory.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/admin-helpers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/api-helpers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/constants.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/integration.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/rate-limit.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/seo.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/english-learning/types.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/env.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/admin-factory.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/admin-helpers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/ai-services-documents.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/ai-services-rate-limit.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/ai-services.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/api-helpers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/constants.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/english-test-engine.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/integration.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/monitoring/engine.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/monitoring/runner.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/rate-limit.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/seo.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/higher-study/types.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/inbox/adapters.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/inbox/attachment-storage.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/inbox/contacts.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/inbox/ingest.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/inbox/outbound.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/integrations/connectors.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/integrations/registry.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/integrations/store.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/json-ld.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/ai.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/api.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/catalog.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/contracts.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/email.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/seo.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/social.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/kits/support.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/load-env.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/logger.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/marketing/helpers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/middleware/audit-logger.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/middleware/auth-middleware.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/middleware/rate-limiter.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/observability.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/prisma-adapter.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/rbac.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/request-context.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/shutdown.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/site-data.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/sms/index.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/sms/providers.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/sms/router.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/sms/sender.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/adapters.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/classifier.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/communication-controls.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/crypto.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/personality.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/pipeline.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/policy-server.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/policy.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/social/publisher.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/uci/source-fetch.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/uci/verification.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/upload-validation.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/utils.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/utm.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/agent.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/config.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/index.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/intents.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/knowledge.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/leads.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/policy.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |
| src/lib/whatsapp/sender.ts | VERIFIED (typecheck/build) | typecheck/build; selected unit/integration tests |

### Tests

| File | Disposition | Evidence |
| --- | --- | --- |
| tests/api/admin-auth.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/api/communication-controls.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/api/feature-kits.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/api/health.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/api/higher-study-ai-services.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/api/inquiries.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/api/staff-lifecycle.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/components/feature-kits.test.tsx | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/fixtures/api-target.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/fixtures/disposable-target.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/fixtures/init-sqlite.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/fixtures/run-api.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/auth-password-reset-session.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/critical-route-families.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/cron-session-cleanup.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/english-learning-progress.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/higher-study-security.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/messaging.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/proxy-auth-rbac.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/staff-bootstrap.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/whatsapp-account-send.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/integration/whatsapp-webhook-security.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/auth.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/bounded-rate-limit.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/command-center-metrics.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/communication-controls.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/email-templates.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/endorsements.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/env.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/feature-kits.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/higher-study-ai-services.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/integrations.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/kit-workers.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/load-env.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/phase1-auth.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/proxy-csp.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/rbac.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/stage-inbox-cms.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/lib/stage-inbox-integrations.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/migrations/client-parity-mysql.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/migrations/client-parity.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/migrations/mariadb-persistence.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/migrations/sqlite-recovery.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/run_all.mjs | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/setup.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/agentos-foundation.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/ai-gateway.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/ai/inference-engine.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/ai/knowledge-retrieval.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/ai/marketing-helpers.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/ai/ollama-cloud.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/backup-retention.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/browser-console-regressions.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/concurrent-db-ops.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/concurrent-write-safety.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/connection-leak.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/database-url.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/db-unavailability.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/deploy/provisioning-security.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/deploy/release-ci-guard.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/deploy/workflow-tests.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/disposable-target.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/free-ai-agents.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/health-check.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/higher-study-monitoring.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/higher-study/english-test-engine.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/json-ld-xss.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/mysql-schema-compatibility.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/reconnection-recovery.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/schema-parity.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/slow-query-analysis.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/social-policy.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/stage-inbox-cms-chat-api.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/uci-source-fetch.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/upload-validation.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/utm.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/whatsapp-account-sender.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/whatsapp-policy.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |
| tests/unit/whatsapp-webhook-events.test.ts | VERIFIED/PRESENT | included in test inventory; execution depends on environment/target |

### Prisma / DB

| File | Disposition | Evidence |
| --- | --- | --- |
| prisma/migrations/00000000000000_mysql_initial/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/README.md | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/00000000000000_initial/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/20261102000000_integrated_feature_kits/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/20261102020000_agentos_foundation/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/20261111120000_uci_staff_messaging_uc/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/20261119020000_uci_review_version/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/20261119030000_staff_reset_attempts/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/20261124000000_inbox_cms_chat/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/mysql/migration_lock.toml | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/00000000000000_initial/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261019000000_social_command_center/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261020000000_higher_study_monitoring/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261102000000_integrated_feature_kits/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261102010000_schema_alignment/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261102020000_agentos_foundation/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261119010000_uci_staff_messaging_uc/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261119020000_uci_review_version/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261119030000_staff_reset_attempts/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/20261124000000_inbox_cms_chat/migration.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/migrations/sqlite/migration_lock.toml | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/rls/postgres-rls.sql | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/schema.mysql.prisma | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/schema.prisma | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/seed-countries-extra.ts | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/seed-english-learning.ts | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/seed-higher-study-more.ts | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/seed-higher-study.ts | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/seed-verified-universities.ts | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |
| prisma/seed.ts | VERIFIED (static) | schema/migrations inspected; SQLite disposable verified; MariaDB BLOCKED |

### Deploy / Runtime

| File | Disposition | Evidence |
| --- | --- | --- |
| Caddyfile | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| Dockerfile | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/alaminn-info.service | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/alaminn-umc.service | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/backup-sqlite.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/cpanel/redeploy.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/cpanel/setup-cpanel.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/deploy-release.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/deploy.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/ecosystem.pm2.cjs | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/healthcheck.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/install.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/mariadb-init.sql | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/nginx-alaminn-info.conf | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/ols-vhost.conf | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/restore-sqlite.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/rollback.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/tailscale-test.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| deploy/verify-backup.sh | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| docker-compose.yml | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| ecosystem.config.cjs | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |
| server.js | PARTIAL/BLOCKED | config reviewed; Docker runtime not executed in sandbox |

### CI

| File | Disposition | Evidence |
| --- | --- | --- |

### Docs

| File | Disposition | Evidence |
| --- | --- | --- |
| docs/.htaccess | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/AGENTOS_PHASE2_FOUNDATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/AGENT_SYSTEM.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_BASELINE_AUDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_DATABASE_CHANGELOG.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_DEPENDENCY_MATRIX.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_DEPLOYMENT_RUNBOOK.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_DIGITAL_COMMAND_CENTRE_AUDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_IMPLEMENTATION_PROGRESS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_INTEGRATION_PLAN.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_REPOSITORY_AUDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_SECURITY_ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_TARGET_ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ALAMINN_TEST_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/AUTONOMOUS_SOFTWARE_FACTORY.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/BRAND-DESIGN-SYSTEM.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/CI-RUN-REVIEW.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/CLAIM_REGISTER.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/CREATOR-COMMAND-CENTER.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/CURRENT-STATE-AUDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/DATABASE-MIGRATION-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/DB-MIGRATION-NOTES-2026-11-24.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/DEPLOY.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/DEPLOYMENT-ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/DEPLOYMENT-STATE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/DEPLOYMENT_RUNBOOK.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/FEATURE-INVENTORY.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/FINAL-IMPLEMENTATION-REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/HIGHER-STUDY-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/HTACCESS_EXPLAINER.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/IMPLEMENTATION-PLAN.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/IMPLEMENTATION_ROADMAP.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/INFRASTRUCTURE_PLAN.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/INTEGRATED-KITS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/INTEGRATION-HUB.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/LICENSE_COMPLIANCE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/MASTER_ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/MASTER_IMPLEMENTATION_BASELINE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/MASTER_IMPLEMENTATION_STATUS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/MEMORY_ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/N8N-WORKFLOW-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PHASE-1-FOUNDATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PHASE-5-DATABASE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PHASE-5-EVIDENCE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PRODUCTION-HARDENING-REPAIR-REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PRODUCTION-VERIFICATION-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PRODUCTION-VERIFICATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/PROTECTED-SERVICES.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/QA_AND_TESTING.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/README.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/RELEASE-SAFETY.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/RESOURCE_AUDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/RESOURCE_COMPATIBILITY_MATRIX.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/REVERSE_ENGINEERING_LAB.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/RISK_REGISTER.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ROLLBACK-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/ROUTE-INVENTORY.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/RUNTIME-ENTRYPOINT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/SECURITY-CSP-AUTH-RATELIMIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/SECURITY_ARCHITECTURE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/SOCIAL-MEDIA-INTEGRATIONS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/STAGE_INBOX_CMS_CHAT_PLAN.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/STAGE_INBOX_CMS_CHAT_STATUS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/TELEGRAM-INTEGRATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/api.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/DEVELOPMENT-GUIDELINE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/FINAL-AUDIT-REPORT-v2.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/FINAL-AUDIT-REPORT-v3.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/FINAL-AUDIT-REPORT-v4.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/FINAL-AUDIT-REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/FINAL-DELIVERY-REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/FULL-PROJECT-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/GO-LIVE-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/HOW-TO-RUN-AND-EDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/MOBILE-RUN-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/PATH-CHANGE-GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/PRODUCTION_README.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/README-CLOUD-DEPLOYMENT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/README-CPANEL-NODE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/archive/worklog-history.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/DATABASE_AND_MIGRATION_REVIEW.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/EXISTING_FEATURE_MATRIX.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/PRODUCTION_DEPENDENCY_MAP.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/SECURITY_AND_BACKUP_STATUS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/SYSTEM_INVENTORY.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/agentos-phase0/evidence-manifest.json | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/agentos-phase0/preservation-check.json | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/audit/agentos-phase0/resource-assessments.json | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/backup-restore.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/browser-console-troubleshooting.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/catalogue-templates/courses.csv | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/catalogue-templates/scholarships.csv | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/catalogue-templates/universities.csv | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/database.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ADDED_FILE_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ALO_EDUCATION_INTEGRATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/API_INVENTORY.json | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/BACKUP_RESTORE_GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/BUILD_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/CPANEL_CONFIGURATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/CPANEL_DEPLOYMENT_GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/CRON_SETUP.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/DATABASE_SCHEMA_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/DATABASE_SETUP.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ENGLISH_PLATFORM_INTEGRATION.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ENVIRONMENT_VARIABLES.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ERROR_FILE_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/LIVE_DEPLOYMENT_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/MISSING_FILE_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/MODIFIED_FILE_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/REMOVED_FILE_REPORT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ROLLBACK_GUIDE.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/ROUTE_INVENTORY.json | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/SECURITY_AUDIT.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/SMTP_SETUP.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deliverables/TEST_RESULTS.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deploy/operations-guide.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/deployment.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/disaster-recovery.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/environment.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study-catalogue-baseline.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/acceptance-test-results.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/alaminn-info-portal-specification.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/application-crm-workflow.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/architecture-and-platform-ownership.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/bangladesh-study-pathway.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/global-english-test-requirements.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/global-university-source-register.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/human-review-and-secure-delivery.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/priority-27-universities.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/proposal-builder.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/security-and-privacy.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/sop-builder.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/source-verification-workflow.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/supervisor-discovery.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/higher-study/uk-mphil-phd-discovery.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/01-home.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/02-higher-study.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/03-oxford.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/04-english-learning.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/05-el-course.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/06-chevening.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/screenshots/07-el-tutors.png | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/security-report.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/security.md | VERIFIED (present) | documentation present; accuracy varies by subject |
| docs/social-command-center.md | VERIFIED (present) | documentation present; accuracy varies by subject |

## Exclusions
- `.git/`, `node_modules/`, `.next/`, `coverage/`, temp outputs.

## Honest limitations
- This ledger provides static/build/test evidence, not per-file production runtime proof for all 1193 files.
- Docker, production deployment, and MariaDB disposable verification are blocked in this sandbox.
- No secrets were used or exposed.
