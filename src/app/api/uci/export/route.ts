import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { csvCell, fieldsOf } from "@/lib/uci/verification";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/uci/export?entity=institutions|programmes|records
 * RBAC: export.run (ADMIN, EDITOR). Bulk export with full provenance columns.
 * Always includes verification status and last-checked/verified timestamps so
 * exported data can never be mistaken for live verified data.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "content-type": "application/json" } });
  if (!can(session.role, "export.run")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "content-type": "application/json" } });

  const entity = req.nextUrl.searchParams.get("entity") ?? "institutions";
  let csv = "";
  if (entity === "records") {
    const rows = await db.uciRequirementRecord.findMany({
      orderBy: { collectedAt: "asc" },
      include: { institution: { select: { canonicalName: true, country: true } } },
    });
    const header = [
      "institution", "country", "context", "field", "value", "verification_status",
      "source_file", "sheet", "row", "source_url", "academic_year",
      "collected_at", "last_checked_at", "last_verified_at", "reviewed_by",
    ];
    csv = header.join(",") + "\n";
    for (const r of rows) {
      const fields = fieldsOf(r);
      for (const [k, v] of Object.entries(fields)) {
        csv += [
          r.institution.canonicalName, r.institution.country, r.context ?? "", k, v,
          r.verificationStatus, r.sourceFile, r.sheet, r.rowNumber, r.sourceUrl ?? "",
          r.academicYear ?? "", r.collectedAt.toISOString(), r.lastCheckedAt?.toISOString() ?? "",
          r.lastVerifiedAt?.toISOString() ?? "", r.reviewedBy ?? "",
        ].map(csvCell).join(",") + "\n";
      }
    }
  } else if (entity === "programmes") {
    const rows = await db.uciProgramme.findMany({ orderBy: { institutionName: "asc" } });
    const header = ["institution", "country", "level", "program_name", "duration", "tuition", "verification_status", "source_file", "sheet", "row"];
    csv = header.join(",") + "\n";
    for (const p of rows) {
      csv += [p.institutionName, p.country, p.level ?? "", p.programName, p.duration ?? "", p.tuition ?? "",
        p.verificationStatus, p.sourceFile, p.sheet, p.rowNumber].map(csvCell).join(",") + "\n";
    }
  } else {
    const rows = await db.uciInstitution.findMany({
      orderBy: { canonicalName: "asc" },
      include: { _count: { select: { records: true, programmes: true } } },
    });
    const header = ["canonical_name", "as_written", "country", "institution_type", "priority_cohort", "official_website", "status", "record_count", "programme_count"];
    csv = header.join(",") + "\n";
    for (const i of rows) {
      csv += [i.canonicalName, JSON.parse(i.asWritten || "[]").join(" | "), i.country, i.institutionType,
        i.priorityCohort ? "YES" : "NO", i.officialWebsite ?? "", i.status, i._count.records, i._count.programmes]
        .map(csvCell).join(",") + "\n";
    }
  }
  await db.uciAuditLog.create({
    data: { actor: session.email, action: "EXPORT", entity: entity, entityId: "csv", detail: `${csv.split("\n").length - 1} rows` },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alo_uci_${entity}_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
