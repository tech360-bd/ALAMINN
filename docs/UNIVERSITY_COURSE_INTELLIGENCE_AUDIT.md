# ALO Education — University & Course Intelligence System: Audit + Migration & Enrichment Plan

Module: **Live University & Course Information Intelligence System** (ALO Education)
Status: pre-implementation audit (required by the module specification, §9)
Repo: `tech360-bd/ALAMINN`, branch `feat/university-course-intelligence` (additive only — based on `origin/main` @ `188a4ce`, PR #105 merge)

---

## 1. Audit of the existing university & course database

### 1.1 Data model inventory (what exists and is REUSED — nothing deleted, nothing bulk-replaced)

The Prisma dual-provider schema (SQLite + MySQL, 132 models, paired migrations) already contains a complete
higher-study entity family. All of the following are **reused as-is**:

| Area | Existing models (fields relevant to the new module) |
|---|---|
| Directory core | `HigherStudyUniversity` (official website, campuses, study levels, per-test English requirements: IELTS/IELTS UKVI/PTE/TOEFL/Duolingo/LanguageCert/Oxford ELLT, deposit info, accommodation, intl student services, career support, graduate outcomes, rankings JSON, `officialSourceUrl`, `verificationStatus`, `lastVerifiedAt/By`), `HigherStudyCourse` (28 study levels incl. MPhil/PhD/DBA/EngD, fees + currency, English reqs, deadlines, required documents, placement/research component, verification + publication status), `HigherStudySubject`, `HigherStudyIntake`, `HigherStudyCourseIntake`, `HigherStudyFaculty`, `HigherStudyScholarship`, `HigherStudyCountry`, `HigherStudyCity` |
| Research & PhD | `HigherStudyResearchArea`, `HigherStudyResearchProject`, `HigherStudySupervisor` (public profile URL, publications JSON, `acceptingStudents`, application guidance, verification + publication status) |
| Monitoring | `HigherStudySourceRecord` (per-URL registry, fail count, last status), `HigherStudySourceSnapshot` (content hash + extracted signals), `HigherStudyDataChange` (old/new value, impact, pending→approve workflow, `POSSIBLE_DATA_CONFLICT` type), `HigherStudyMonitoringRun` (DB lock, weekly), `HigherStudyOfficialDocument` |
| Bulk tools | `HigherStudyImportJob` (dry-run, per-row errors), `HigherStudyAuditLog`, `HigherStudyEvent` |
| Engagement | saved items, comparisons, referrals, alerts, student stories, resources |

### 1.2 Existing data (reuse valid records — no bulk replacement)

- Seed sources: `prisma/seed-higher-study.ts` (~137 entity entries), `prisma/seed-higher-study-more.ts` (~93 entries), `prisma/seed-verified-universities.ts` (idempotent upserts; universities seeded **with `officialSourceUrl`** and verification metadata).
- Existing production rows are untouched by this module. Enrichment happens only through the new evidence pipeline (re-check → evidence → review), never via bulk UPDATE.

### 1.3 Existing routes (all kept; module is purely additive)

- **Student-facing** (`/higher-study/*`): course finder (keyword, country, subject, specialisation, study mode, **tuition range, scholarship availability, English requirement, placement, research component, verified status** filters), course detail (`[courseSlug]`, shows verification status + last verified by/at + "always confirm with the official source" notes), destinations, global universities, research + PhD directories, proposal builder, compare, eligibility check, intakes, application guide, apply, book consultation.
- **Admin** (`/admin/higher-study/*`): 20+ CRUD sections + monitoring dashboard with a change-approval workflow ("AI detects and explains; only Super Admin approval updates production data"), import job, audit logs, overview.
- **Cron**: `/api/cron/higher-study-monitor` (weekly, DB-locked), `/api/cron/data-verification` (30-day staleness flag), `phd-deadlines`, `scholarship-deadlines`.

### 1.4 What the existing system does NOT have (gap analysis — drives this module)

1. **No documented source registry with hierarchy.** `HigherStudySourceRecord` stores URLs but not the *organisation* (ApplyBoard Assist, Edvoy, AHZ Associates, IDP Education, MARGE) nor the **source level** (Level 1 official / Level 2 discovery / Level 3 credible), terms and permission state.
2. **No robots.txt / permission awareness.** The monitor fetches registered URLs directly; no per-source permission state, no crawl-delay handling, no "skipped — permission not granted" state.
3. **No per-fact evidence layer.** Snapshots keep extracted signals, but there is no record of *original source wording*, normalised value, academic year, collected/checked/verified timestamps per displayed fact.
4. **No spec status vocabulary.** The module requires `DISCOVERED → SOURCE_CHECK_REQUIRED → OFFICIAL_SOURCE_VERIFIED → CONFLICTING_INFORMATION / OUTDATED / UNAVAILABLE → HUMAN_REVIEW_REQUIRED → APPROVED_FOR_PUBLICATION`; existing `verificationStatus` (`draft|pending-review|verified|published|needs-update|archived`) is the *publication* lifecycle of existing rows and is **not rewritten** — the new evidence layer carries the intelligence statuses and maps onto the existing one (§3.4 below).
5. **No cross-source conflict detection with preservation.** A single source's change is reviewed, but two sources disagreeing for the same fact must **preserve every candidate value** and open a human-review item — never silently choose one.
6. **No duplicate detection** across universities/courses (name-normalised similarity, same-URL collisions).
7. **No per-source collection job records** with failure visibility + retry/backoff (only aggregate run rows).
8. **No publication gate for intelligence-sourced records** (nothing may be auto-published while a displayed fact is unverified or conflicted).
9. **No Level-2 bulk import pipeline** (discover from ApplyBoard/Edvoy/AHZ/IDP exports → enter as DISCOVERED, never published until Level-1 verified) — the generic import job exists but is not status-aware.
10. **No bulk export with source attribution.**
11. **No unified human-review queue** (conflicts, duplicates, missing official URLs, outdated records, publication approvals are separate or absent).

## 2. Migration & enrichment plan (additive)

### 2.1 New models — paired SQLite + MySQL migration `20261128020000_university_intelligence`

| Model | Purpose (spec §) |
|---|---|
| `HigherStudySourceOrg` | Documented source registry: key, name, **level** (`L1_OFFICIAL`,`L2_DISCOVERY`,`L3_CREDIBLE`), base URL, docs URL, robots/permission state (`allowed|restricted|unknown`) + checked-at, terms note, API availability, active. Seeded with: ApplyBoard Assist, Edvoy, AHZ Associates, IDP Education, MARGE (URL **TBD — to be confirmed**, seeded `unknown`), ALO-curated official-university index, government/immigration bodies (§1, §3) |
| `HigherStudyEvidence` | Per-fact evidence: entity type/id + field, source org/URL/level/type, academic year, **original wording excerpt** (bounded), normalised value, intelligence status (8 values), collected/checked/verified timestamps, reviewer id, change history JSON (§4) |
| `HigherStudyConflict` | Conflicting candidates for one entity+field: every candidate value **preserved** (JSON: value, source, level, wording, collected-at), open→resolved/dismissed with reviewer + resolution (§3, §8) |
| `HigherStudyDuplicateFlag` | Duplicate candidates: entity ids, similarity score, match reason, open→merged/dismissed (§8) |
| `HigherStudyCollectionJob` | Per-source collection run: status incl. `skipped-permissions`, robots allowed, HTTP status, items seen / evidence created / conflicts detected, error, attempts, next retry (§4, §9) |
| `HigherStudyReviewTask` | Unified human-review queue: type (`verify-evidence|resolve-conflict|review-duplicate|check-missing-official-url|review-outdated|approve-publication|verify-discovery`), reference, priority, assignment, resolution, audit fields (§8) |

No existing column, row, route or module is dropped or rewritten. The only change to an existing table: none (fully additive).

### 2.2 New libraries — `src/lib/higher-study/intelligence/`

- `statuses.ts` — the 8 statuses + legal transitions + mapping to existing publication lifecycle.
- `sources.ts` — source registry definitions + level resolution (an official university domain is L1; registered discovery platforms L2; government/research DBs L3).
- `robots.ts` — robots.txt parse + cache + `canFetch()`; default-deny on `restricted`, conservative on `unknown`; crawl-delay respected; never bypasses restrictions.
- `collector.ts` — permission-gated collection: job records, evidence upserts (original wording + normalised value + academic year), failure capture + backoff.
- `conflicts.ts` — same-fact cross-source comparison → preserve candidates → `CONFLICTING_INFORMATION` + review task; never auto-choose.
- `duplicates.ts` — normalised-name + URL-collision detection → review task.
- `stale.ts` — OUTDATED (L1 weekly, L2 monthly policy), UNAVAILABLE (repeated failures), missing-official-URL sweeps.
- `publication.ts` — publication gate for intelligence-sourced records (blocks publish while any displayed fact is unverified or any conflict is open).
- `importer.ts` / `exporter.ts` — Level-2 bulk import (validation, duplicate protection, rows enter as `DISCOVERED`) and bulk export with full source attribution.
- `pipeline.ts` — weekly intelligence cycle (lock pattern reused from `monitoring/runner.ts`), called by new cron `/api/cron/university-intelligence`; the existing `/api/cron/higher-study-monitor` remains unchanged and both share the lock table so they cannot double-run.

### 2.3 New routes and UI (additive)

- Admin APIs: `/api/v1/higher-study/admin/intelligence/{sources,evidence,conflicts,duplicates,jobs,tasks,import,export}` (+ `[id]` subroutes), Super Admin / Admin role-gated, using the existing `adminFetch` + response envelope conventions.
- Admin UI: `/admin/higher-study/intelligence` — dashboard with source monitoring, discovery & verification queues, conflicts, duplicates, outdated records, missing official URLs, failed jobs, change history, publication approvals, bulk import/export.
- Student-facing: course/university detail pages gain an **evidence-aware trust strip** (verified vs awaiting-confirmation distinction + last-checked date + source link) rendered from the evidence layer where present; existing content untouched.
- Cron: `/api/cron/university-intelligence` (weekly, same auth as existing crons).

### 2.4 Enrichment sequence (no bulk replace)

1. Seed `HigherStudySourceOrg` registry (documented sources, MARGE URL `null` = TBD).
2. Existing `HigherStudySourceRecord` URLs are mapped to their source org on first cycle (official university domains → L1).
3. Weekly cycle: permission check → fetch → evidence rows (status per §3) → conflicts/duplicates/stale sweeps → review tasks. Existing catalogue rows are enriched only when an editor approves a reviewed change (unchanged behaviour from the existing monitoring workflow).
4. Level-2 imports always land as `DISCOVERED`; promotion to display requires L1 verification + explicit publication approval.

## 3. Compliance rules enforced by this module (spec §2, §5)

- Collection only from publicly accessible pages **and** only when the source's robots/permission state allows; jobs record `skipped-permissions` otherwise.
- Unknown values stored as unknown (`null` evidence / status `SOURCE_CHECK_REQUIRED`) — **never invented**.
- Original wording excerpts are bounded to the minimum needed for verification; normalised values are stored alongside; university names, course titles, requirements and figures are preserved accurately.
- No competitor descriptions, marketing paragraphs, images, logos, layouts or databases are copied; ALO Education writes its own explanations (existing content remains; the module only adds factual, attributed data).
- No endorsement claims; source links displayed with every published fact set; last-checked date shown next to intelligence data.
- Supervisors: `acceptingStudents` stays `false` unless an official public profile states otherwise — the module never infers availability.

## 4. Status vocabulary (spec §4) and mapping

`DISCOVERED` → `SOURCE_CHECK_REQUIRED` → `OFFICIAL_SOURCE_VERIFIED` → `APPROVED_FOR_PUBLICATION`; side states `CONFLICTING_INFORMATION`, `OUTDATED`, `UNAVAILABLE`; escalation `HUMAN_REVIEW_REQUIRED`. A record is never described as live/current merely because it exists: every displayed intelligence fact carries `lastCheckedAt` + source. Existing rows keep their `verificationStatus` / `publicationStatus` values; the evidence layer maps its own 8 statuses onto them at display time (`APPROVED_FOR_PUBLICATION` ⇒ treat as `verified`/`published`; anything else ⇒ `pending-review` display + awaiting-confirmation badge).
