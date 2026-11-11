import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/uci/programmes — searchable programme directory.
 * Query: q, country, level, institution, page, pageSize
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const country = sp.get("country")?.trim() ?? "";
  const level = sp.get("level")?.trim() ?? "";
  const institution = sp.get("institution")?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(sp.get("pageSize") ?? "25", 10) || 25));

  const where: Prisma.UciProgrammeWhereInput = {};
  if (q) where.programName = { contains: q };
  if (country) where.country = country;
  if (level) where.level = level;
  if (institution) where.institutionName = { contains: institution };

  const [total, items, levels, countries] = await Promise.all([
    db.uciProgramme.count({ where }),
    db.uciProgramme.findMany({
      where,
      orderBy: [{ institutionName: "asc" }, { programName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { institution: { select: { canonicalName: true, officialWebsite: true, priorityCohort: true } } },
    }),
    db.uciProgramme.findMany({ select: { level: true }, distinct: ["level"] }),
    db.uciProgramme.findMany({ select: { country: true }, distinct: ["country"], orderBy: { country: "asc" } }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    items,
    levels: levels.map((l) => l.level).filter(Boolean).sort(),
    countries: countries.map((c) => c.country),
  });
}
