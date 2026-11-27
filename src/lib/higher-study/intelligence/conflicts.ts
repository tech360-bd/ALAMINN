/**
 * Cross-source conflict detection (module spec §3, §4, §8): when two
 * sources disagree about the same fact of the same entity, EVERY candidate
 * value is preserved in a HigherStudyConflict, the affected evidence rows
 * are flagged CONFLICTING_INFORMATION, and a human-review task is opened.
 * The system NEVER silently chooses one value.
 */
import { db } from "@/lib/db";
import type { IntelligenceStatus } from "./statuses";

export interface EvidenceCandidate {
  sourceOrgKey: string | null;
  sourceUrl: string;
  sourceLevel: string;
  originalWording: string | null;
  normalisedValue: string;
  academicYear: string | null;
  collectedAt: string;
}

/** Normalise a value for comparison (case, whitespace, currency symbols kept). */
export function normaliseForComparison(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Detect conflicts between evidence rows for the same entity+field.
 * Returns the conflicts that were created (or already open) — candidates
 * from every source are preserved in each record.
 */
export async function detectConflictsForEntity(
  entityType: string,
  entityId: string,
  field: string
): Promise<{ conflictId: string; created: boolean }[]> {
  const rows = await db.higherStudyEvidence.findMany({
    where: { entityType, entityId, field },
    orderBy: { collectedAt: "desc" },
    take: 50,
  });
  if (rows.length < 2) return [];

  // Group by normalised value; every distinct value = one candidate.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = normaliseForComparison(row.normalisedValue);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  if (groups.size < 2) {
    // All sources agree — clear any stale open conflict for this fact.
    const open = await db.higherStudyConflict.findFirst({
      where: { entityType, entityId, field, status: "open" },
    });
    if (open) {
      await db.higherStudyConflict.update({
        where: { id: open.id },
        data: {
          status: "dismissed",
          resolution: "All known sources now agree on the same value after re-collection.",
          resolvedAt: new Date(),
        },
      });
    }
    return [];
  }

  const candidates: EvidenceCandidate[] = rows.map((r) => ({
    sourceOrgKey: r.sourceOrgKey,
    sourceUrl: r.sourceUrl,
    sourceLevel: r.sourceLevel,
    originalWording: r.originalWording,
    normalisedValue: r.normalisedValue,
    academicYear: r.academicYear,
    collectedAt: r.collectedAt.toISOString(),
  }));

  const existing = await db.higherStudyConflict.findFirst({
    where: { entityType, entityId, field, status: { in: ["open"] } },
  });
  const conflictingIds = rows.map((r) => r.id);
  const conflict = existing
    ? await db.higherStudyConflict.update({
        where: { id: existing.id },
        data: { candidates: JSON.stringify(candidates), detectedAt: new Date() },
      })
    : await db.higherStudyConflict.create({
        data: {
          entityType,
          entityId,
          field,
          candidates: JSON.stringify(candidates),
          status: "open",
        },
      });

  // Flag every involved evidence row as CONFLICTING_INFORMATION (legal
  // transition from any status per the state machine; verified rows drop
  // back through review).
  await db.higherStudyEvidence.updateMany({
    where: { id: { in: conflictingIds } },
    data: { status: "CONFLICTING_INFORMATION" },
  });

  // Open (or refresh) the human-review task — never auto-resolve.
  const title = `Conflicting values for ${entityType} ${field}`;
  const detail = `Sources disagree on "${field}". ${candidates.length} evidence rows across ${groups.size} distinct values are preserved in conflict ${conflict.id}. A human must choose the correct value; the system never selects one automatically.`;
  await db.higherStudyReviewTask.upsert({
    where: {
      type_refType_refId: { type: "resolve-conflict", refType: "conflict", refId: conflict.id },
    },
    create: {
      type: "resolve-conflict",
      refType: "conflict",
      refId: conflict.id,
      title,
      detail,
      priority: "HIGH",
      status: "pending",
    },
    update: { title, detail, status: "pending" },
  });

  return [{ conflictId: conflict.id, created: !existing }];
}

/**
 * Human resolution: the reviewer picks a value (must match one of the
 * preserved candidates) and every other candidate stays on record. The
 * chosen evidence row is marked OFFICIAL_SOURCE_VERIFIED when it comes
 * from an L1 source; otherwise it stays in human review until an L1
 * source verifies it.
 */
export async function resolveConflict(
  conflictId: string,
  chosenSourceUrl: string,
  decidedById: string,
  reason: string
): Promise<{ ok: boolean; error?: string; chosenStatus?: IntelligenceStatus }> {
  const conflict = await db.higherStudyConflict.findUnique({ where: { id: conflictId } });
  if (!conflict) return { ok: false, error: "conflict not found" };
  if (conflict.status !== "open") return { ok: false, error: "conflict already resolved" };
  let candidates: EvidenceCandidate[] = [];
  try {
    candidates = JSON.parse(conflict.candidates);
  } catch {
    return { ok: false, error: "candidates unreadable" };
  }
  const chosen = candidates.find((c) => c.sourceUrl === chosenSourceUrl);
  if (!chosen) return { ok: false, error: "chosen value is not one of the preserved candidates" };

  await db.higherStudyConflict.update({
    where: { id: conflictId },
    data: {
      status: "resolved",
      resolvedValue: chosen.normalisedValue,
      resolvedById: decidedById,
      resolvedAt: new Date(),
      resolution: `Human decision by ${decidedById}: value from ${chosen.sourceUrl} (${chosen.sourceLevel}). Reason: ${reason}. All other candidate values remain preserved in this record.`,
    },
  });

  const chosenStatus: IntelligenceStatus =
    chosen.sourceLevel === "L1_OFFICIAL" ? "OFFICIAL_SOURCE_VERIFIED" : "HUMAN_REVIEW_REQUIRED";
  await db.higherStudyEvidence.updateMany({
    where: { entityType: conflict.entityType, entityId: conflict.entityId, field: conflict.field, sourceUrl: chosenSourceUrl },
    data: chosenStatus === "OFFICIAL_SOURCE_VERIFIED"
      ? { status: chosenStatus, lastVerifiedAt: new Date(), verifiedById: decidedById }
      : { status: chosenStatus },
  });
  // Non-chosen candidates stay CONFLICTING_INFORMATION on record.
  await db.higherStudyReviewTask.updateMany({
    where: { refType: "conflict", refId: conflictId, status: { in: ["pending", "in-review"] } },
    data: { status: "resolved", decidedById, decidedAt: new Date(), resolution: reason },
  });
  return { ok: true, chosenStatus };
}
