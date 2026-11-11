import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { detectConflicts, type FieldRecord } from "@/lib/uci/verification";

export const dynamic = "force-dynamic";

/**
 * GET /api/uci/stats — command-centre counters, all calculated from actual records.
 * Public, aggregated values only (no reviewer identities, no raw records).
 */
export async function GET() {
  const [institutions, records, programmes, sources, jobs] = await Promise.all([
    db.uciInstitution.findMany({ select: { country: true, priorityCohort: true, institutionType: true } }),
    db.uciRequirementRecord.findMany(),
    db.uciProgramme.findMany({ select: { country: true, level: true, verificationStatus: true } }),
    db.uciSource.findMany({ select: { level: true, identityStatus: true } }),
    db.uciCollectionJob.findMany({ select: { status: true } }),
  ]);

  const instName = new Map(
    (await db.uciInstitution.findMany({ select: { id: true, canonicalName: true } })).map((i) => [i.id, i.canonicalName]),
  );
  const recordsWithNames: (FieldRecord & { institutionName: string })[] = records.map((r) => ({
    ...r,
    institutionName: instName.get(r.institutionId) ?? "(unknown institution)",
  }));
  const conflictCount = detectConflicts(recordsWithNames).length;

  const byStatus: Record<string, number> = {};
  for (const r of records) byStatus[r.verificationStatus] = (byStatus[r.verificationStatus] ?? 0) + 1;

  const progByStatus: Record<string, number> = {};
  for (const p of programmes) progByStatus[p.verificationStatus] = (progByStatus[p.verificationStatus] ?? 0) + 1;

  const byCountry: Record<string, { institutions: number; programmes: number }> = {};
  for (const i of institutions) {
    byCountry[i.country] ??= { institutions: 0, programmes: 0 };
    byCountry[i.country].institutions += 1;
  }
  for (const p of programmes) {
    byCountry[p.country] ??= { institutions: 0, programmes: 0 };
    byCountry[p.country].programmes += 1;
  }

  const jobStatus: Record<string, number> = {};
  for (const j of jobs) jobStatus[j.status] = (jobStatus[j.status] ?? 0) + 1;

  return NextResponse.json({
    institutions: institutions.length,
    priorityCohort: institutions.filter((i) => i.priorityCohort).length,
    universities: institutions.filter((i) => i.institutionType === "UNIVERSITY").length,
    pathwayProviders: institutions.filter((i) => i.institutionType === "PATHWAY_PROVIDER").length,
    requirementRecords: records.length,
    programmes: programmes.length,
    recordsByStatus: byStatus,
    programmesByStatus: progByStatus,
    byCountry,
    conflictCount,
    sources: {
      total: sources.length,
      official: sources.filter((s) => s.level === "OFFICIAL").length,
      platform: sources.filter((s) => s.level === "PLATFORM").length,
      public: sources.filter((s) => s.level === "PUBLIC").length,
      internal: sources.filter((s) => s.level === "INTERNAL").length,
      pendingIdentity: sources.filter((s) => s.identityStatus === "PENDING_IDENTITY").length,
    },
    jobs: { total: jobs.length, ...jobStatus },
  });
}
