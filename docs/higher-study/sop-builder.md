# SOP Builder

## Purpose

A guided tool to help applicants draft a Statement of Purpose (SOP) /
personal statement for university and scholarship applications. The
tool was scoped to:

1. Collect structured inputs from the applicant: target programme,
   target university, academic background, work experience, research
   interests, career goals.
2. Generate an SOP draft using the free AI router with a strict
   system prompt that forbids fabrication and requires the applicant
   to verify every factual claim.
3. Provide section-by-section guidance (intro, academic background,
   research interest fit, career goals, conclusion) with reference to
   the verified Higher Study catalogue.
4. Allow the applicant to iterate on drafts and export the final SOP
   as PDF / DOCX.

## Current status

**NOT YET IMPLEMENTED.** This feature is documented as a planned item
only — no route, component, or Prisma model exists yet. When
implemented, it will likely introduce a `HigherStudySopDraft` model
with `applicantNotes`, `generatedDraft`, `applicantEdits`, and a
`status` field (`draft` / `finalised` / `exported`).

The SOP builder depends on:

- The free AI router (`src/lib/ai/free-router.ts`) — already
  implemented; the SOP builder would call it with a SOP-specific
  system prompt.
- The verified Higher Study catalogue — for grounding the
  programme-specific sections.
- The existing PDF / DOCX export helpers (if any) — to be added.

A key design constraint: the SOP builder must NOT auto-submit the SOP
to any institution. The applicant downloads the finalised SOP and
submits it themselves as part of their application.

## Related files (planned, not yet created)

- `src/app/higher-study/sop-builder/page.tsx` — wizard UI.
- `src/app/api/v1/higher-study/sop-drafts/route.ts` — CRUD API.
- `prisma/schema.prisma` — proposed `HigherStudySopDraft` model.
- `src/lib/higher-study/sop-engine.ts` — section-by-section drafting
  helper.

## Spec reference

Planned in `MASTER-SPECIFICATION.md` §42.8 (SOP builder). Not yet
scoped on the public roadmap.
