/**
 * Intelligence status vocabulary for the live university & course
 * intelligence system (module spec §4).
 *
 * A record is never described as live/current merely because it exists in
 * the database — every displayed intelligence fact carries lastCheckedAt
 * and its source, and the status below describes how far the fact has
 * travelled through verification.
 */

export const INTELLIGENCE_STATUSES = [
  "DISCOVERED",
  "SOURCE_CHECK_REQUIRED",
  "OFFICIAL_SOURCE_VERIFIED",
  "CONFLICTING_INFORMATION",
  "OUTDATED",
  "UNAVAILABLE",
  "HUMAN_REVIEW_REQUIRED",
  "APPROVED_FOR_PUBLICATION",
] as const;

export type IntelligenceStatus = (typeof INTELLIGENCE_STATUSES)[number];

/** Legal forward transitions. Anything not listed is rejected. */
const TRANSITIONS: Record<IntelligenceStatus, IntelligenceStatus[]> = {
  DISCOVERED: ["SOURCE_CHECK_REQUIRED", "OUTDATED", "UNAVAILABLE", "HUMAN_REVIEW_REQUIRED"],
  SOURCE_CHECK_REQUIRED: [
    "OFFICIAL_SOURCE_VERIFIED",
    "CONFLICTING_INFORMATION",
    "UNAVAILABLE",
    "HUMAN_REVIEW_REQUIRED",
    "OUTDATED",
  ],
  OFFICIAL_SOURCE_VERIFIED: ["APPROVED_FOR_PUBLICATION", "OUTDATED", "CONFLICTING_INFORMATION", "HUMAN_REVIEW_REQUIRED"],
  CONFLICTING_INFORMATION: ["HUMAN_REVIEW_REQUIRED", "OFFICIAL_SOURCE_VERIFIED", "OUTDATED"],
  OUTDATED: ["SOURCE_CHECK_REQUIRED", "HUMAN_REVIEW_REQUIRED", "UNAVAILABLE"],
  UNAVAILABLE: ["SOURCE_CHECK_REQUIRED", "OUTDATED", "HUMAN_REVIEW_REQUIRED"],
  HUMAN_REVIEW_REQUIRED: [
    "OFFICIAL_SOURCE_VERIFIED",
    "SOURCE_CHECK_REQUIRED",
    "APPROVED_FOR_PUBLICATION",
    "UNAVAILABLE",
  ],
  APPROVED_FOR_PUBLICATION: ["OUTDATED", "CONFLICTING_INFORMATION", "HUMAN_REVIEW_REQUIRED"],
};

export function canTransition(from: string, to: string): boolean {
  if (!isIntelligenceStatus(from) || !isIntelligenceStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function isIntelligenceStatus(value: string): value is IntelligenceStatus {
  return (INTELLIGENCE_STATUSES as readonly string[]).includes(value);
}

/** Statuses that may be shown on the public directory at all. */
export const DISPLAYABLE_STATUSES: readonly IntelligenceStatus[] = [
  "OFFICIAL_SOURCE_VERIFIED",
  "APPROVED_FOR_PUBLICATION",
];

/** Statuses that may be shown but must carry an "awaiting confirmation" badge. */
export const PENDING_DISPLAY_STATUSES: readonly IntelligenceStatus[] = [
  "DISCOVERED",
  "SOURCE_CHECK_REQUIRED",
  "CONFLICTING_INFORMATION",
  "HUMAN_REVIEW_REQUIRED",
];

/**
 * Map an intelligence status onto the existing catalogue lifecycle
 * (verificationStatus / publicationStatus on HigherStudy* models) without
 * rewriting existing values: existing rows keep their lifecycle; the
 * mapping is applied at display time for intelligence-sourced facts.
 */
export function toCatalogueVerificationStatus(status: IntelligenceStatus): string {
  if (status === "APPROVED_FOR_PUBLICATION") return "verified";
  if (status === "OFFICIAL_SOURCE_VERIFIED") return "pending-review";
  return "needs-update";
}

/** True when a fact is considered verified (official source checked). */
export function isVerified(status: IntelligenceStatus): boolean {
  return status === "OFFICIAL_SOURCE_VERIFIED" || status === "APPROVED_FOR_PUBLICATION";
}

/** True when a fact needs human attention before any publication. */
export function needsHumanReview(status: IntelligenceStatus): boolean {
  return status === "CONFLICTING_INFORMATION" || status === "HUMAN_REVIEW_REQUIRED";
}

/** Source levels (module spec §3). */
export const SOURCE_LEVELS = ["L1_OFFICIAL", "L2_DISCOVERY", "L3_CREDIBLE"] as const;
export type SourceLevel = (typeof SOURCE_LEVELS)[number];

export function isSourceLevel(value: string): value is SourceLevel {
  return (SOURCE_LEVELS as readonly string[]).includes(value);
}

/**
 * A Level-1 source outranks every other level for verification: Level 2
 * platforms discover; Level 1 official university pages confirm.
 */
export function outranks(a: SourceLevel, b: SourceLevel): boolean {
  const rank: Record<SourceLevel, number> = { L1_OFFICIAL: 3, L2_DISCOVERY: 1, L3_CREDIBLE: 2 };
  return rank[a] > rank[b];
}
