import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fieldsOf } from "@/lib/uci/verification";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const ENGLISH_TEST_KEYS = [
  "ug_ielts", "pg_ielts", "ug_pte", "pg_pte", "ug_oietc", "pg_oietc",
  "ug_duolingo", "pg_duolingo", "toefl", "duolingo", "oietc", "pte", "ieltc", "ellt", "moi",
];

/**
 * GET /api/uci/institutions — searchable, filterable directory.
 * Query: q, country, type, priority, englishTest, scholarship, hasOfficialUrl, page, pageSize
 * Filtering runs on captured fields only; no value is inferred.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const country = sp.get("country")?.trim() ?? "";
  const type = sp.get("type")?.trim() ?? "";
  const priority = sp.get("priority") === "1";
  const englishTest = sp.get("englishTest")?.trim() ?? "";
  const scholarship = sp.get("scholarship") === "1";
  const hasOfficialUrl = sp.get("hasOfficialUrl") === "1";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(60, Math.max(6, parseInt(sp.get("pageSize") ?? "12", 10) || 12));

  const instWhere: Prisma.UciInstitutionWhereInput = {};
  if (q) instWhere.canonicalName = { contains: q };
  if (country) instWhere.country = country;
  if (type) instWhere.institutionType = type;
  if (priority) instWhere.priorityCohort = true;
  if (hasOfficialUrl) instWhere.officialWebsite = { not: null };

  const [total, institutions] = await Promise.all([
    db.uciInstitution.count({ where: instWhere }),
    db.uciInstitution.findMany({
      where: instWhere,
      orderBy: [{ priorityCohort: "desc" }, { canonicalName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { records: true, programmes: true } },
        records: { select: { id: true, fieldsJson: true, verificationStatus: true, context: true } },
      },
    }),
  ]);

  let items = institutions.map((i) => {
    const statuses: Record<string, number> = {};
    let hasScholarship = false;
    const englishSeen = new Set<string>();
    for (const r of i.records) {
      statuses[r.verificationStatus] = (statuses[r.verificationStatus] ?? 0) + 1;
      const f = fieldsOf(r);
      if (Object.keys(f).some((k) => k.includes("scholarship"))) hasScholarship = true;
      for (const k of Object.keys(f)) {
        if (ENGLISH_TEST_KEYS.includes(k) && f[k]) englishSeen.add(k.split("_")[1]?.toUpperCase() ?? k.toUpperCase());
      }
    }
    return {
      id: i.id,
      canonicalName: i.canonicalName,
      country: i.country,
      institutionType: i.institutionType,
      priorityCohort: i.priorityCohort,
      officialWebsite: i.officialWebsite,
      recordCount: i._count.records,
      programmeCount: i._count.programmes,
      statuses,
      hasScholarship,
      englishTests: [...englishSeen].sort(),
    };
  });

  if (englishTest) {
    items = items.filter((i) => i.englishTests.some((t) => t.toLowerCase().includes(englishTest.toLowerCase())));
  }
  if (scholarship) {
    items = items.filter((i) => i.hasScholarship);
  }

  const countries = await db.uciInstitution.findMany({
    select: { country: true },
    distinct: ["country"],
    orderBy: { country: "asc" },
  });

  return NextResponse.json({
    total: englishTest || scholarship ? items.length : total,
    page,
    pageSize,
    items,
    countries: countries.map((c) => c.country),
  });
}
