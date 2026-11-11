import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/uci/institutions/name?name=... — full institution detail:
 * every requirement record with provenance + programmes + verification events.
 * Unknown fields are simply absent — never fabricated.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const inst = await db.uciInstitution.findFirst({
    where: { canonicalName: name },
    include: {
      records: { orderBy: [{ context: "asc" }, { sheet: "asc" }, { rowNumber: "asc" }] },
      programmes: { orderBy: { programName: "asc" }, take: 400 },
    },
  });
  if (!inst) return NextResponse.json({ error: "not found" }, { status: 404 });

  const events = await db.uciVerificationEvent.findMany({
    where: { recordId: { in: inst.records.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    institution: {
      id: inst.id,
      canonicalName: inst.canonicalName,
      asWritten: JSON.parse(inst.asWritten || "[]"),
      country: inst.country,
      cities: JSON.parse(inst.cityNotes || "[]"),
      institutionType: inst.institutionType,
      priorityCohort: inst.priorityCohort,
      officialWebsite: inst.officialWebsite,
      status: inst.status,
    },
    records: inst.records,
    programmes: inst.programmes,
    events,
  });
}
