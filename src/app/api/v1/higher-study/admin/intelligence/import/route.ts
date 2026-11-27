import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import {
  importDiscoveredUniversities,
  importDiscoveredCourses,
  type UniversityImportRow,
  type CourseImportRow,
} from "@/lib/higher-study/intelligence/importer";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/**
 * Level-2 bulk import (discovery data): universities and courses
 * discovered via ApplyBoard Assist, Edvoy, AHZ Associates, IDP Education,
 * MARGE (once confirmed). Rows enter as DISCOVERED + draft + unpublished —
 * never auto-published. Validation + duplicate protection + audit.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.import");
  if (g.denied) return g.response;
  const b = await readJson<{ type?: "universities" | "courses"; rows?: unknown[]; dryRun?: boolean }>(req);
  if (!b?.type || !["universities", "courses"].includes(b.type)) return fail("type must be universities or courses", ["invalid_type"], 400);
  if (!Array.isArray(b.rows)) return fail("rows array is required", ["rows_required"], 400);
  let report;
  if (b.type === "universities") {
    report = await importDiscoveredUniversities(b.rows as UniversityImportRow[], { dryRun: b.dryRun, createdBy: g.session.userId });
  } else {
    report = await importDiscoveredCourses(b.rows as CourseImportRow[], { dryRun: b.dryRun, createdBy: g.session.userId });
  }
  const job = await db.higherStudyImportJob.create({
    data: {
      fileName: `intelligence-import:${b.type}`,
      fileType: "json",
      entityType: b.type === "universities" ? "university" : "course",
      totalRows: report.totalRows,
      processedRows: report.errors.length === 0 ? report.totalRows : report.totalRows - report.errors.length,
      successRows: report.created,
      errorRows: report.errors.length + report.skippedDuplicates,
      status: "completed",
      dryRun: !!b.dryRun,
      errors: JSON.stringify(report.errors),
    },
  });
  await writeAudit(g.session, "higher_study_intelligence_import", "HigherStudyImportJob", job.id, { type: b.type, dryRun: !!b.dryRun, created: report.created, duplicates: report.skippedDuplicates });
  return ok({ report, jobId: job.id }, "", {}, 201);
}
