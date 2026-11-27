/**
 * Level-2 bulk import for discovery data (module spec §3, §4, §8):
 * universities/courses discovered via ApplyBoard Assist, Edvoy, AHZ
 * Associates, IDP Education, MARGE (once confirmed) are imported as
 * DISCOVERED records with full source attribution. Rows entering through
 * this importer are NEVER published automatically: publication requires
 * Level-1 verification through the evidence pipeline + human approval.
 *
 * Validation, duplicate protection and audit logs included. Missing
 * values stay null (unknown), never invented.
 */
import { db } from "@/lib/db";
import { SOURCE_ORG_DEFINITIONS } from "./sources";
import { normaliseName, similarity } from "./duplicates";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export interface UniversityImportRow {
  universityName: string;
  countrySlug?: string | null;
  city?: string | null;
  officialWebsite?: string | null;
  sourceUrl?: string | null;
  sourceOrgKey?: string | null;
  notes?: string | null;
}

export interface CourseImportRow {
  courseTitle: string;
  universitySlug?: string | null;
  studyLevel?: string | null;
  durationMonths?: number | null;
  tuitionFee?: number | null;
  tuitionCurrency?: string | null;
  intake?: string | null;
  ieltsRequirement?: string | null;
  applicationDeadline?: string | null;
  officialCourseUrl?: string | null;
  sourceOrgKey?: string | null;
}

export interface ImportReport {
  totalRows: number;
  created: number;
  skippedDuplicates: number;
  errors: { row: number; error: string }[];
  dryRun: boolean;
  reviewTaskIds: string[];
}

function requireL2Org(sourceOrgKey: string | null | undefined): { ok: boolean; error?: string } {
  if (!sourceOrgKey) return { ok: true };
  const def = SOURCE_ORG_DEFINITIONS.find((d) => d.key === sourceOrgKey);
  if (!def) return { ok: false, error: `unknown sourceOrgKey ${sourceOrgKey}` };
  if (def.level !== "L2_DISCOVERY") return { ok: false, error: `sourceOrgKey ${sourceOrgKey} is not a Level 2 discovery source` };
  return { ok: true };
}

export async function importDiscoveredUniversities(
  rows: UniversityImportRow[],
  options: { dryRun?: boolean; createdBy?: string } = {}
): Promise<ImportReport> {
  const report: ImportReport = { totalRows: rows.length, created: 0, skippedDuplicates: 0, errors: [], dryRun: !!options.dryRun, reviewTaskIds: [] };
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`too many rows (${rows.length} > ${MAX_IMPORT_ROWS})`);

  const existing = await db.higherStudyUniversity.findMany({
    select: { id: true, officialName: true, countryId: true, slug: true },
    take: 2000,
  });
  const countries = await db.higherStudyCountry.findMany({ select: { id: true, slug: true }, take: 300 });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = row.universityName?.trim();
      if (!name) throw new Error("universityName is required");
      const orgCheck = requireL2Org(row.sourceOrgKey);
      if (!orgCheck.ok) throw new Error(orgCheck.error!);
      const dup = existing.find((u) => similarity(normaliseName(u.officialName), normaliseName(name)) >= 0.82);
      if (dup) {
        report.skippedDuplicates++;
        continue;
      }
      if (options.dryRun) {
        report.created++;
        continue;
      }
      const country = row.countrySlug ? countries.find((c) => c.slug === row.countrySlug) : null;
      if (!country) throw new Error(`country not found for slug "${row.countrySlug ?? "(none)"}" — country is required, never guessed`);
      const slugBase = normaliseName(name).replace(/\s+/g, "-").slice(0, 60) || `university-${Date.now()}`;
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;
      const created = await db.higherStudyUniversity.create({
        data: {
          slug,
          officialName: name,
          countryId: country.id,
          officialWebsite: row.officialWebsite?.trim() || null,
          verificationStatus: "draft", // DISCOVERED, not yet reviewed
          publicationStatus: "draft", // never auto-published from Level 2 import
        },
      });
      await db.higherStudyEvidence.create({
        data: {
          entityType: "university",
          entityId: created.id,
          field: "existence",
          sourceOrgKey: row.sourceOrgKey ?? null,
          sourceLevel: "L2_DISCOVERY",
          sourceType: "discovery-import",
          sourceUrl: row.sourceUrl?.trim() || (SOURCE_ORG_DEFINITIONS.find((d) => d.key === row.sourceOrgKey)?.baseUrl ?? "unknown"),
          normalisedValue: name,
          originalWording: null,
          status: "DISCOVERED",
        },
      });
      const task = await db.higherStudyReviewTask.upsert({
        where: { type_refType_refId: { type: "verify-discovery", refType: "university", refId: created.id } },
        create: {
          type: "verify-discovery",
          refType: "university",
          refId: created.id,
          title: `Verify discovered university: ${name}`,
          detail: `Discovered via ${row.sourceOrgKey ?? "a Level 2 source"}${row.sourceUrl ? ` (${row.sourceUrl})` : ""}. Verify against the official university website (Level 1) before any publication. Record is draft + unpublished; nothing is displayed until verified and approved.`,
          priority: "HIGH",
        },
        update: {},
      });
      if (task) report.reviewTaskIds.push(task.id);
      report.created++;
    } catch (e) {
      if (report.errors.length < 200) report.errors.push({ row: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}

export async function importDiscoveredCourses(
  rows: CourseImportRow[],
  options: { dryRun?: boolean; createdBy?: string } = {}
): Promise<ImportReport> {
  const report: ImportReport = { totalRows: rows.length, created: 0, skippedDuplicates: 0, errors: [], dryRun: !!options.dryRun, reviewTaskIds: [] };
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`too many rows (${rows.length} > ${MAX_IMPORT_ROWS})`);
  const unis = await db.higherStudyUniversity.findMany({ select: { id: true, officialName: true, slug: true }, take: 2000 });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const title = row.courseTitle?.trim();
      if (!title) throw new Error("courseTitle is required");
      const orgCheck = requireL2Org(row.sourceOrgKey);
      if (!orgCheck.ok) throw new Error(orgCheck.error!);
      const uni = row.universitySlug
        ? unis.find((u) => u.slug === row.universitySlug)
        : unis.find((u) => similarity(normaliseName(u.officialName), normaliseName(row.universitySlug ?? "")) >= 0.8);
      if (!uni) throw new Error(`university not found for "${row.universitySlug ?? "(none)"}"`);
      const level = row.studyLevel?.trim() || "bachelors";
      const siblings = await db.higherStudyCourse.findMany({
        where: { universityId: uni.id, studyLevel: level },
        select: { id: true, title: true },
        take: 500,
      });
      const dup = siblings.find((c) => similarity(normaliseName(c.title), normaliseName(title)) >= 0.82) ?? null;
      if (dup) {
        report.skippedDuplicates++;
        continue;
      }
      if (options.dryRun) {
        report.created++;
        continue;
      }
      const slug = `${normaliseName(title).replace(/\s+/g, "-").slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`;
      const created = await db.higherStudyCourse.create({
        data: {
          slug,
          title,
          universityId: uni.id,
          studyLevel: level,
          duration: row.durationMonths ? `${row.durationMonths} months` : null,
          tuitionFee: typeof row.tuitionFee === "number" && Number.isFinite(row.tuitionFee) ? Math.round(row.tuitionFee) : null,
          tuitionCurrency: row.tuitionCurrency?.trim() || "USD",
          applicationDeadline: row.applicationDeadline?.trim() || null,
          englishRequirements: row.ieltsRequirement?.trim() || null,
          intakeId: null,
          officialSourceUrl: row.officialCourseUrl?.trim() || null,
          verificationStatus: "draft", // DISCOVERED
          publicationStatus: "draft", // never auto-published from Level 2 import
        },
      });
      await db.higherStudyEvidence.create({
        data: {
          entityType: "course",
          entityId: created.id,
          field: "existence",
          sourceOrgKey: row.sourceOrgKey ?? null,
          sourceLevel: "L2_DISCOVERY",
          sourceType: "discovery-import",
          sourceUrl: row.officialCourseUrl?.trim() || (SOURCE_ORG_DEFINITIONS.find((d) => d.key === row.sourceOrgKey)?.baseUrl ?? "unknown"),
          normalisedValue: title,
          status: "DISCOVERED",
        },
      });
      const task = await db.higherStudyReviewTask.upsert({
        where: { type_refType_refId: { type: "verify-discovery", refType: "course", refId: created.id } },
        create: {
          type: "verify-discovery",
          refType: "course",
          refId: created.id,
          title: `Verify discovered course: ${title}`,
          detail: `Discovered via ${row.sourceOrgKey ?? "a Level 2 source"}. Verify title, fees, deadlines and requirements against the official course page (Level 1) before publication. Record is draft + unpublished.`,
          priority: "HIGH",
        },
        update: {},
      });
      if (task) report.reviewTaskIds.push(task.id);
      report.created++;
    } catch (e) {
      if (report.errors.length < 200) report.errors.push({ row: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
