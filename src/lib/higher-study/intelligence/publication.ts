/**
 * Publication gate for intelligence-sourced records (module spec §8, §9):
 * a fact set may be approved for publication ONLY when every displayed
 * fact is verified by a Level 1 official source (or explicitly approved
 * after human review) and no open conflict remains. Unverified or
 * conflicting records NEVER auto-publish.
 */
import { db } from "@/lib/db";

export interface PublicationCheck {
  canPublish: boolean;
  blockers: string[];
  verifiedCount: number;
  pendingCount: number;
  conflictCount: number;
}

/** The facts shown on a public course/university page. */
export const DISPLAYED_FIELDS: readonly string[] = [
  "tuitionFee",
  "applicationDeadline",
  "academicEntryRequirements",
  "englishRequirements",
  "ieltsRequirement",
  "pteRequirement",
  "toeflRequirement",
  "duration",
  "studyMode",
  "intakes",
  "scholarships",
  "requiredDocuments",
  "applicationProcess",
];

const BLOCKING_STATUSES = new Set([
  "DISCOVERED",
  "SOURCE_CHECK_REQUIRED",
  "CONFLICTING_INFORMATION",
  "OUTDATED",
  "UNAVAILABLE",
  "HUMAN_REVIEW_REQUIRED",
]);

export async function checkPublicationReadiness(
  entityType: string,
  entityId: string
): Promise<PublicationCheck> {
  const evidence = await db.higherStudyEvidence.findMany({
    where: { entityType, entityId, field: { in: [...DISPLAYED_FIELDS, "existence"] } },
    select: { field: true, status: true, sourceLevel: true },
  });
  const conflicts = await db.higherStudyConflict.count({
    where: { entityType, entityId, status: "open" },
  });
  const blockers: string[] = [];
  let verifiedCount = 0;
  const pending = new Map<string, string>();
  for (const e of evidence) {
    if (e.status === "OFFICIAL_SOURCE_VERIFIED" || e.status === "APPROVED_FOR_PUBLICATION") {
      verifiedCount++;
      continue;
    }
    if (BLOCKING_STATUSES.has(e.status)) pending.set(e.field, e.status);
  }
  for (const [field, status] of pending) {
    blockers.push(`${field}: ${status}`);
  }
  if (conflicts > 0) blockers.push(`${conflicts} open conflict(s)`);
  return {
    canPublish: blockers.length === 0,
    blockers,
    verifiedCount,
    pendingCount: pending.size,
    conflictCount: conflicts,
  };
}

/**
 * Human-driven publication approval. The gate is enforced even here: an
 * approval is only recorded when no blocking evidence remains; otherwise
 * the caller receives the blockers and nothing changes.
 */
export async function approvePublication(
  entityType: string,
  entityId: string,
  approvedById: string,
  note?: string
): Promise<{ ok: boolean; error?: string; blockers?: string[] }> {
  const check = await checkPublicationReadiness(entityType, entityId);
  if (!check.canPublish) {
    return { ok: false, error: "publication blocked", blockers: check.blockers };
  }
  await db.higherStudyEvidence.updateMany({
    where: { entityType, entityId, status: "OFFICIAL_SOURCE_VERIFIED" },
    data: { status: "APPROVED_FOR_PUBLICATION", verifiedById: approvedById, lastVerifiedAt: new Date() },
  });
  const task = await db.higherStudyReviewTask.findFirst({
    where: { type: "approve-publication", refType: entityType, refId: entityId, status: { in: ["pending", "in-review"] } },
  });
  if (task) {
    await db.higherStudyReviewTask.update({
      where: { id: task.id },
      data: { status: "resolved", decidedById: approvedById, decidedAt: new Date(), resolution: note ?? "Approved for publication after gate check." },
    });
  }
  return { ok: true };
}
