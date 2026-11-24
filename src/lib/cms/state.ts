/** CMS workflow state machine and revision helpers (pure). */
export const CMS_STATES = ["draft", "review", "approved", "published", "archived"] as const;
export type CmsStatus = (typeof CMS_STATES)[number];

const ALLOWED_TRANSITIONS: Record<CmsStatus, readonly CmsStatus[]> = {
  draft: ["review", "archived"],
  review: ["draft", "approved", "archived"],
  approved: ["review", "published", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export function canTransition(from: string, to: string): boolean {
  const source = CMS_STATES.includes(from as CmsStatus) ? (from as CmsStatus) : null;
  const target = CMS_STATES.includes(to as CmsStatus) ? (to as CmsStatus) : null;
  if (!source || !target) return false;
  return ALLOWED_TRANSITIONS[source].includes(target);
}

export function nextRevisionNumber(revisions: { revisionNumber: number }[]): number {
  return revisions.reduce((max, revision) => Math.max(max, revision.revisionNumber), 0) + 1;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+){1,80}$/.test(slug) && slug.length <= 96;
}

/** A restored revision always returns to draft; it never auto-publishes. */
export function restoredStatus(): CmsStatus {
  return "draft";
}
