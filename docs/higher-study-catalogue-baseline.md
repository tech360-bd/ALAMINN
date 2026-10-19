# Higher Study Catalogue — Baseline & Gap Report (evidence-labelled)

Repo: tech360-bd/ALAMINN · branch arena/45bcaac3-alaminn · commit ea6a99e (+ uncommitted Social Command work from previous session — untouched).

## VERIFIED in code (not live DB — Prisma engines cannot download in this sandbox, so record COUNTS are NOT VERIFIED here)
- Models: HigherStudyCountry/City/University/Subject/Intake/Course/Scholarship/ResearchArea/ResearchProject/Supervisor/Resource/StudentStory/Event/SavedItem/Comparison/Referral/Alert/AuditLog/ImportJob.
- Public: Course Finder, universities/courses/scholarships/subjects/intakes/research pages, compare (universities/courses/scholarships), eligibility check, apply/book-consultation (referral-signed), saved items.
- Admin: CRUD for all entities + CSV import (dry-run preview, slug dedup, error rows, job record) + audit logs + referrals.
- Course fields cover: level (incl. bachelors-topup, mres, mphil, phd), duration, mode, tuition+currency, entry/English requirements (free text), deadlines, documents, officialSourceUrl, lastVerifiedAt/By, verification+publication status.

## Gaps found → built this session (code-complete, NOT RUN against live DB)
1. `verificationStatus` defaulted to "verified" → changed to "pending-review" for all HigherStudy models (existing rows untouched; new unverified data can no longer self-publish).
2. No source registry → `HigherStudySourceRecord` + snapshots (content hash + extracted fee/deadline/IELTS signals). Official URLs already on catalogue rows auto-register each run; government/immigration sources registered manually in admin. No URL is ever invented.
3. No change detection/approval → `HigherStudyDataChange` queue: AI detects/explains, Super Admin approves/rejects/rechecks. Approval applies ONLY allow-listed fields, preserves old value in change record + audit (`COURSE_DATA_APPROVED`/`UNIVERSITY_DATA_APPROVED`). Non-allow-listed → NEEDS_MANUAL_REVIEW.
4. No 7-day agent → `runMonitoringCycle` (DB lock, bounded 50 sources/run, duplicate-run + duplicate-change suppression, SOURCE_UNAVAILABLE never deletes data) + cron `GET /api/cron/higher-study-monitor` (weekly `0 4 * * 1`, CRON_SECRET auth). Next-run persisted on the run row.
5. No faculty/department/campus entities → `HigherStudyFaculty` (faculty/school/department/college/institute + parent). No per-course intakes → `HigherStudyCourseIntake` (per-intake deadlines, intl confirmation). Official documents → `HigherStudyOfficialDocument` (versioned, approval-gated).
6. No staff Knowledge Center → `GET /api/v1/higher-study/knowledge-search?q=` returns verified+published only, with source + lastVerifiedAt; missing fee/deadline = `NOT_PUBLISHED`, never guessed.
7. Admin UI: /admin/higher-study/monitoring (widget: last/next check, counts, pending, critical, failed; verification queue with View Source/Compare/Approve/Reject/Recheck/Mark Verified).

## NOT DONE / BLOCKED (needs owner approval + live access, per spec §18 gates)
- Bulk research of 140 UK / all AU / 8 NZ / IE / targeted US-CA universities: NOT STARTED. No records were created. This requires live source access, agreed selection register (Phase 1), and explicit import approval (Phase 6) — fabricating it would violate the anti-fabrication rule.
- Production DB counts, live fetch test, migration deploy: BLOCKED in sandbox (Prisma engine host unreachable; no production credentials — and none should be pasted in chat).
- ALO CRM (Base44) / aloeducation.com integration: separate systems, no API credentials available here; this repo is the alaminn.info platform. Integration map: public pages + signed referrals already flow here; catalogue remains single source in this DB.

## Selection methodology (Phase 1 proposal, awaiting approval)
UK 140 target (mixed ranking bands, official UCAS/Discover Uni discovery), AU full TEQSA/CRICOS university universe, NZ 8 (Universities NZ), IE official HEA list (universities vs technological universities kept distinct), US/CA targeted by BD-demand evidence + DLI/accreditation checks. Every institution gets inclusion/exclusion reason + selection-score evidence in the source register before any course collection.
