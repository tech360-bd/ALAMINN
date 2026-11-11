import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { detectConflicts, detectOutdated, groupDuplicates, fieldsOf, type FieldRecord } from "@/lib/uci/verification";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/uci/admin/quality — combined live quality report:
 * conflicts, cross-sheet duplicates and outdated candidates.
 * RBAC: uci.verify (ADMIN, EDITOR). Computed from actual DB records on every
 * request (never stale).
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "uci.verify")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [institutions, records, programmes] = await Promise.all([
    db.uciInstitution.findMany({ select: { id: true, canonicalName: true, country: true } }),
    db.uciRequirementRecord.findMany(),
    db.uciProgramme.findMany({ select: { institutionId: true } }),
  ]);

  const instName = new Map(institutions.map((i) => [i.id, i.canonicalName]));
  const recordsWithNames: (FieldRecord & { institutionName: string })[] = records.map((r) => ({
    ...r,
    institutionName: instName.get(r.institutionId) ?? "(unknown institution)",
  }));

  const programmeCounts = new Map<string, number>();
  for (const p of programmes) {
    if (p.institutionId) programmeCounts.set(p.institutionId, (programmeCounts.get(p.institutionId) ?? 0) + 1);
  }

  const conflicts = detectConflicts(recordsWithNames);
  const duplicates = groupDuplicates(institutions, records, programmeCounts);
  const outdated = detectOutdated(recordsWithNames);

  // institutions where a record carries an official (non-Google-Drive) URL
  const officialUrls = new Map<string, string[]>();
  for (const i of institutions) {
    const urls = records
      .filter((r) => r.institutionId === i.id)
      .flatMap((r) => Object.values(fieldsOf(r)).filter((v) => /^https?:\/\/(?!.*google\.)/.test(v)));
    if (urls.length) officialUrls.set(i.id, [...new Set(urls)]);
  }

  return NextResponse.json({
    conflicts,
    duplicates,
    outdated,
    officialUrlMap: Object.fromEntries(officialUrls),
    summary: {
      conflictCount: conflicts.length,
      duplicateCount: duplicates.length,
      outdatedCount: outdated.length,
      institutionsWithOfficialUrl: officialUrls.size,
    },
  });
}
