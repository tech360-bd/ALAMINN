import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonResponse } from "@/lib/higher-study/api-helpers";
export const dynamic = "force-dynamic";
/** Staff Knowledge Center search — APPROVED + VERIFIED + PUBLISHED only, with source links. */
export async function GET(req: NextRequest) { const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return jsonResponse(false, "q required", null, {}, ["q_required"], 400);
  const where = { verificationStatus: "verified", publicationStatus: "published" } as const;
  const [courses, unis, schols] = await Promise.all([
    db.higherStudyCourse.findMany({ where: { ...where, OR: [{ title: { contains: q } }, { studyLevel: { contains: q.toLowerCase() } }] }, take: 10, include: { university: { select: { officialName: true, slug: true } } } }),
    db.higherStudyUniversity.findMany({ where: { ...where, OR: [{ officialName: { contains: q } }, { overview: { contains: q } }] }, take: 10 }),
    db.higherStudyScholarship.findMany({ where: { ...where, name: { contains: q } }, take: 10 }),
  ]);
  return jsonResponse(true, "OK", { courses: courses.map((c) => ({ title: c.title, university: c.university.officialName, level: c.studyLevel, tuition: c.tuitionFee ? `${c.tuitionFee} ${c.tuitionCurrency}` : "NOT_PUBLISHED", deadline: c.applicationDeadline || "NOT_PUBLISHED", source: c.officialSourceUrl, lastVerifiedAt: c.lastVerifiedAt, status: "VERIFIED" })), universities: unis.map((u) => ({ name: u.officialName, source: u.officialSourceUrl || u.officialWebsite, lastVerifiedAt: u.lastVerifiedAt, status: "VERIFIED" })), scholarships: schols.map((s) => ({ name: s.name, amount: s.fundingAmount || "NOT_PUBLISHED", deadline: s.deadline, source: s.officialSourceUrl, status: "VERIFIED" })) }); }
