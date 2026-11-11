import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/uci/sources — documented source registry with collection status. */
export async function GET() {
  const [sources, jobs] = await Promise.all([
    db.uciSource.findMany({ orderBy: [{ level: "asc" }, { key: "asc" }] }),
    db.uciCollectionJob.findMany({ orderBy: { scheduledAt: "desc" }, take: 200 }),
  ]);
  const jobsBySource = new Map<string, { total: number; success: number; failed: number; blocked: number; last: Date | null }>();
  for (const j of jobs) {
    const e = jobsBySource.get(j.sourceKey) ?? { total: 0, success: 0, failed: 0, blocked: 0, last: null };
    e.total += 1;
    if (j.status === "SUCCESS") e.success += 1;
    if (j.status === "FAILED") e.failed += 1;
    if (j.status === "ROBOTS_BLOCKED") e.blocked += 1;
    if (!e.last || (j.finishedAt && j.finishedAt > e.last)) e.last = j.finishedAt;
    jobsBySource.set(j.sourceKey, e);
  }
  return NextResponse.json({
    sources: sources.map((s) => ({ ...s, jobStats: jobsBySource.get(s.key) ?? null })),
  });
}
