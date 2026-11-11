# Source Verification Workflow

## Purpose

Documents the lifecycle every `HigherStudyUniversity`,
`HigherStudyCourse`, `HigherStudyScholarship`, `HigherStudyResearchProject`,
and `HigherStudySupervisor` row goes through before it can be presented
as verified on the public portal. The workflow is the operational
embodiment of the project's no-fabrication rule: nothing is published
as fact until a human has sighted the official source.

## Lifecycle states

```
                 ┌──────────────────────────────────────┐
                 │                                      │
   draft ──▶ pending-review ──▶ verified ──▶ published
                 │                     │                  │
                 │                     ▼                  │
                 │                 needs-update ◀─────────┘
                 ▼                                      │
              archived ◀────────────────────────────────┘
```

- `draft` — row created but not yet ready for review.
- `pending-review` — initial seed state. Row is visible in admin but
  not surfaced as "verified" on the public site.
- `verified` — a human editor has confirmed the row against its
  `officialSourceUrl`.
- `published` — visible on the public site. Requires `verified` AND
  `publicationStatus="published"`.
- `needs-update` — the monitoring runner detected a diff between the
  stored snapshot and the live official source. Pulled from public view
  until re-verified.
- `archived` — withdrawn (e.g. programme closed, institution merged).

## Monitoring runner

`src/lib/higher-study/monitoring/runner.ts` runs on a cron schedule
(`/api/cron/higher-study-monitor/route.ts`). For each row whose
`lastVerifiedAt` is older than the configured re-verification window,
it:

1. Fetches the `officialSourceUrl`.
2. Diffs the fetched HTML/text against the last-seen snapshot.
3. If material fields changed → sets `verificationStatus="needs-update"`
   and writes a row to the Higher Study audit log.
4. If fetch failed (network/HTTP error) → flags for human retry but
   does NOT downgrade the row.

## Human approval

A human editor (role: `higher-study-editor` or higher) reviews the
`needs-update` queue in the admin UI
(`/admin/higher-study/universities` etc.) and either re-confirms the
row (sets `verified` + `lastVerifiedAt` + `lastVerifiedBy`) or
corrects it. The action is audit-logged.

## Current status

**Implemented:** lifecycle states, monitoring runner + cron, admin
re-verification UI, audit logging of every state transition. **Active
work:** the priority-27 verification pass is in progress (see
`priority-27-universities.md`).

## Related files

- `src/lib/higher-study/monitoring/engine.ts` + `runner.ts`.
- `src/app/api/cron/higher-study-monitor/route.ts`.
- `src/app/admin/higher-study/monitoring/page.tsx` — admin monitoring UI.
- `prisma/schema.prisma` — `HigherStudyAuditLog` model.

## Spec reference

`docs/higher-study/source-verification-workflow.md` (this file) and
`docs/audit/SECURITY_AND_BACKUP_STATUS.md`.
