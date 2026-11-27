/**
 * Duplicate detection for universities and courses (module spec §8):
 * normalised-name matching (university name + country; course title +
 * university + level) and official-URL collisions. Detected candidates
 * are preserved in HigherStudyDuplicateFlag with a human-review task —
 * merging is always a human decision.
 */
import { db } from "@/lib/db";

/** Aggressive normalisation for name comparison. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(university|the|of)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard similarity over character trigrams — cheap and good enough to FLAG (human decides). */
export function similarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const padded = `  ${s} `;
    const out = new Set<string>();
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;

interface UniCandidate {
  id: string;
  officialName: string;
  countryId: string;
  officialWebsite: string | null;
}

interface CourseCandidate {
  id: string;
  title: string;
  universityId: string;
  studyLevel: string;
}

/** Detect duplicate universities within the same country. */
export async function detectDuplicateUniversities(
  threshold: number = DUPLICATE_SIMILARITY_THRESHOLD,
  limit = 200
): Promise<{ created: number; open: number }> {
  const unis: UniCandidate[] = await db.higherStudyUniversity.findMany({
    select: { id: true, officialName: true, countryId: true, officialWebsite: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let created = 0;
  let open = 0;
  for (let i = 0; i < unis.length; i++) {
    for (let j = i + 1; j < unis.length; j++) {
      const a = unis[i];
      const b = unis[j];
      if (a.countryId !== b.countryId) continue;
      const nameSim = similarity(normaliseName(a.officialName), normaliseName(b.officialName));
      const urlCollision =
        !!a.officialWebsite &&
        !!b.officialWebsite &&
        a.officialWebsite.replace(/\/$/, "") === b.officialWebsite.replace(/\/$/, "");
      if (nameSim < threshold && !urlCollision) continue;

      const reason = urlCollision
        ? "official-url-collision"
        : `normalised-name+country (similarity ${nameSim.toFixed(2)})`;
      const entityIds = JSON.stringify([a.id, b.id]);
      const existing = await db.higherStudyDuplicateFlag.findFirst({
        where: { entityType: "university", entityIds, status: { in: ["open", "merged"] } },
      });
      if (existing) {
        if (existing.status === "open") open++;
        continue;
      }
      const flag = await db.higherStudyDuplicateFlag.create({
        data: {
          entityType: "university",
          entityIds,
          similarityScore: urlCollision ? 1 : nameSim,
          matchReason: reason,
          status: "open",
        },
      });
      await db.higherStudyReviewTask.upsert({
        where: {
          type_refType_refId: { type: "review-duplicate", refType: "duplicate", refId: flag.id },
        },
        create: {
          type: "review-duplicate",
          refType: "duplicate",
          refId: flag.id,
          title: `Possible duplicate universities: ${a.officialName} / ${b.officialName}`,
          detail: `Match: ${reason}. Both records are preserved; a human decides whether to merge. The system never merges automatically.`,
          priority: "MEDIUM",
        },
        update: {},
      });
      created++;
    }
  }
  return { created, open };
}

/** Detect duplicate courses within the same university and study level. */
export async function detectDuplicateCourses(
  threshold: number = DUPLICATE_SIMILARITY_THRESHOLD,
  limit = 300
): Promise<{ created: number; open: number }> {
  const courses: CourseCandidate[] = await db.higherStudyCourse.findMany({
    select: { id: true, title: true, universityId: true, studyLevel: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let created = 0;
  let open = 0;
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i];
      const b = courses[j];
      if (a.universityId !== b.universityId || a.studyLevel !== b.studyLevel) continue;
      const sim = similarity(normaliseName(a.title), normaliseName(b.title));
      if (sim < threshold) continue;
      const entityIds = JSON.stringify([a.id, b.id]);
      const existing = await db.higherStudyDuplicateFlag.findFirst({
        where: { entityType: "course", entityIds, status: { in: ["open", "merged"] } },
      });
      if (existing) {
        if (existing.status === "open") open++;
        continue;
      }
      const flag = await db.higherStudyDuplicateFlag.create({
        data: {
          entityType: "course",
          entityIds,
          similarityScore: sim,
          matchReason: `normalised-title+university+level (similarity ${sim.toFixed(2)})`,
          status: "open",
        },
      });
      await db.higherStudyReviewTask.upsert({
        where: {
          type_refType_refId: { type: "review-duplicate", refType: "duplicate", refId: flag.id },
        },
        create: {
          type: "review-duplicate",
          refType: "duplicate",
          refId: flag.id,
          title: `Possible duplicate courses: ${a.title} / ${b.title}`,
          detail: `Match: similarity ${sim.toFixed(2)} within the same university and study level. Both records preserved; human merge decision required.`,
          priority: "MEDIUM",
        },
        update: {},
      });
      created++;
    }
  }
  return { created, open };
}

/** Human decision on a duplicate flag: merged / dismissed / false-positive. */
export async function decideDuplicate(
  flagId: string,
  decision: "merged" | "dismissed" | "false-positive",
  decidedById: string
): Promise<{ ok: boolean; error?: string }> {
  const flag = await db.higherStudyDuplicateFlag.findUnique({ where: { id: flagId } });
  if (!flag) return { ok: false, error: "flag not found" };
  if (flag.status !== "open") return { ok: false, error: "flag already decided" };
  await db.higherStudyDuplicateFlag.update({
    where: { id: flagId },
    data: { status: decision, decidedById, decidedAt: new Date() },
  });
  await db.higherStudyReviewTask.updateMany({
    where: { refType: "duplicate", refId: flagId, status: { in: ["pending", "in-review"] } },
    data: { status: "resolved", decidedById, decidedAt: new Date() },
  });
  // Note: an actual merge (surviving record + retired record) is performed
  // by the admin merge endpoint, never automatically here.
  return { ok: true };
}
