# Proposal Builder

## Purpose

A guided tool to help PhD/MPhil applicants draft a research proposal
that meets the standards expected by UK research councils (EPSRC,
ESRC, AHRC) and Russell-Group graduate schools. The tool was scoped to
walk the applicant through:

1. Identifying a research area + supervisor (linked to the existing
   supervisor discovery flow).
2. Structuring the proposal: literature review, research question,
   methodology, timeline, ethical considerations, references.
3. AI-assisted drafting with grounding in the verified Higher Study
   catalogue (no fabrication, citation required).
4. Human review by an Alaminn.info editor before the proposal is
   handed to the supervisor via the secure ALO Education referral.

## Current status

**NOT YET IMPLEMENTED.** This feature is documented as a planned item
only — no route, component, or Prisma model exists yet. When
implemented, it will likely introduce a `HigherStudyProposalDraft`
model with status (`draft` / `in_review` / `approved` / `handed_off`)
and an admin review queue.

The proposal builder depends on:

- The supervisor discovery flow (already implemented) — to pick the
  target supervisor.
- The AI advisor grounding pattern (already implemented at
  `/api/v1/higher-study/advisor/chat`) — to draft proposal sections
  against the verified catalogue.
- The HMAC referral handoff (already implemented in
  `src/lib/higher-study/api-helpers.ts`) — to send the approved
  proposal to ALO Education for supervisor delivery.

## Related files (planned, not yet created)

- `src/app/higher-study/proposal-builder/page.tsx` — wizard UI.
- `src/app/api/v1/higher-study/proposals/route.ts` — CRUD API.
- `prisma/schema.prisma` — proposed `HigherStudyProposalDraft` model.
- `src/lib/higher-study/proposal-engine.ts` — section-by-section
  drafting + grounding helper.

## Spec reference

Planned in `MASTER-SPECIFICATION.md` §42.7 (research proposal
builder). Not yet scoped on the public roadmap.
