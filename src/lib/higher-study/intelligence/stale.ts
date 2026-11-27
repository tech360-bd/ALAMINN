/**
 * Staleness, unavailability and missing-source sweeps (module spec §4, §8):
 *  - evidence whose lastCheckedAt exceeds the per-level re-check policy →
 *    OUTDATED + re-check task
 *  - sources failing repeatedly → UNAVAILABLE evidence + failed-job review
 *  - catalogue records without an official source URL → review task
 * A record is never described as current merely because it exists.
 */
import { db } from "@/lib/db";

/** Level 1 facts are re-checked weekly; Level 2/3 monthly. */
export const STALE_POLICY_DAYS: Record<string, number> = {
  L1_OFFICIAL: 7,
  L2_DISCOVERY: 30,
  L3_CREDIBLE: 30,
};

export function isStale(lastCheckedAt: Date | null, sourceLevel: string, now = new Date()): boolean {
  if (!lastCheckedAt) return false; // never checked → collection pipeline handles it
  const days = STALE_POLICY_DAYS[sourceLevel] ?? 30;
  return now.getTime() - lastCheckedAt.getTime() > days * 24 * 60 * 60 * 1000;
}

export interface SweepResult {
  outdated: number;
  unavailable: number;
  missingOfficialUrl: number;
  reviewTasks: number;
}

export async function runStalenessSweep(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { outdated: 0, unavailable: 0, missingOfficialUrl: 0, reviewTasks: 0 };

  // 1) Mark evidence whose source level's re-check window has passed.
  const evidence = await db.higherStudyEvidence.findMany({
    where: {
      status: { in: ["DISCOVERED", "SOURCE_CHECK_REQUIRED", "OFFICIAL_SOURCE_VERIFIED", "APPROVED_FOR_PUBLICATION"] },
    },
    select: { id: true, entityType: true, entityId: true, field: true, lastCheckedAt: true, sourceLevel: true, status: true },
    take: 500,
  });
  for (const e of evidence) {
    if (!isStale(e.lastCheckedAt, e.sourceLevel, now)) continue;
    const updated = await db.higherStudyEvidence.updateMany({
      where: { id: e.id, status: { in: ["DISCOVERED", "SOURCE_CHECK_REQUIRED", "OFFICIAL_SOURCE_VERIFIED", "APPROVED_FOR_PUBLICATION"] } },
      data: { status: "OUTDATED" },
    });
    if (updated.count > 0) {
      result.outdated++;
      const task = await db.higherStudyReviewTask.upsert({
        where: { type_refType_refId: { type: "review-outdated", refType: "evidence", refId: e.id } },
        create: {
          type: "review-outdated",
          refType: "evidence",
          refId: e.id,
          title: `Outdated ${e.field} evidence (${e.sourceLevel})`,
          detail: `Evidence for ${e.entityType} ${e.entityId} field "${e.field}" was last checked more than ${STALE_POLICY_DAYS[e.sourceLevel] ?? 30} days ago and is marked OUTDATED. Re-run collection from ${e.sourceLevel === "L1_OFFICIAL" ? "the official source" : "an official source"} to restore it.`,
          priority: "LOW",
        },
        update: { status: "pending" },
      });
      if (task) result.reviewTasks++;
    }
  }

  // 2) Sources with repeated failures → evidence UNAVAILABLE + review.
  const failing = await db.higherStudySourceRecord.findMany({
    where: { active: true, failCount: { gte: 3 } },
    take: 100,
  });
  for (const src of failing) {
    const updated = await db.higherStudyEvidence.updateMany({
      where: { sourceUrl: src.url, status: { notIn: ["UNAVAILABLE", "CONFLICTING_INFORMATION", "HUMAN_REVIEW_REQUIRED"] } },
      data: { status: "UNAVAILABLE" },
    });
    if (updated.count > 0) {
      result.unavailable += updated.count;
      await db.higherStudyReviewTask.upsert({
        where: { type_refType_refId: { type: "review-outdated", refType: "source-record", refId: src.id } },
        create: {
          type: "review-outdated",
          refType: "source-record",
          refId: src.id,
          title: "Source repeatedly unavailable",
          detail: `Source ${src.url} failed ${src.failCount} times. Related evidence is marked UNAVAILABLE (never deleted). Decide: retry later, retire the source, or find an alternative official source.`,
          priority: "HIGH",
        },
        update: { status: "pending" },
      });
      result.reviewTasks++;
    }
  }

  // 3) Catalogue records without an official source URL → review task (gap list).
  const [unis, courses] = await Promise.all([
    db.higherStudyUniversity.findMany({ where: { officialSourceUrl: null }, select: { id: true, officialName: true }, take: 200 }),
    db.higherStudyCourse.findMany({ where: { officialSourceUrl: null }, select: { id: true, title: true }, take: 300 }),
  ]);
  for (const u of unis) {
    await db.higherStudyReviewTask.upsert({
      where: { type_refType_refId: { type: "check-missing-official-url", refType: "university", refId: u.id } },
      create: {
        type: "check-missing-official-url",
        refType: "university",
        refId: u.id,
        title: `University missing official source URL: ${u.officialName}`,
        detail: "No official university URL on record, so its facts cannot be verified against a Level 1 source. Add the official URL before treating any fact as verified.",
        priority: "MEDIUM",
      },
      update: {},
    });
    result.missingOfficialUrl++;
    result.reviewTasks++;
  }
  for (const c of courses) {
    await db.higherStudyReviewTask.upsert({
      where: { type_refType_refId: { type: "check-missing-official-url", refType: "course", refId: c.id } },
      create: {
        type: "check-missing-official-url",
        refType: "course",
        refId: c.id,
        title: `Course missing official source URL: ${c.title}`,
        detail: "No official course URL on record, so its facts cannot be verified against a Level 1 source. Add the official URL before treating any fact as verified.",
        priority: "MEDIUM",
      },
      update: {},
    });
    result.missingOfficialUrl++;
    result.reviewTasks++;
  }
  return result;
}
