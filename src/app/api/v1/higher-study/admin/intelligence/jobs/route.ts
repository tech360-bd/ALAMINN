import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { collectFromSource } from "@/lib/higher-study/intelligence/collector";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Collection jobs: GET with status filter (failed jobs visible + recoverable); POST retries a failed job's source once. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const take = Math.min(Number(sp.get("take") ?? 50) || 50, 200);
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  const [total, failed, skipped, jobs] = await Promise.all([
    db.higherStudyCollectionJob.count({ where }),
    db.higherStudyCollectionJob.count({ where: { status: "failed" } }),
    db.higherStudyCollectionJob.count({ where: { status: "skipped-permissions" } }),
    db.higherStudyCollectionJob.findMany({ where, orderBy: { startedAt: "desc" }, take }),
  ]);
  return ok({ total, failed, skippedPermissions: skipped, jobs, note: "Failed jobs are retried with a backoff (nextRetryAt). Permission-skipped jobs are never retried until the source's robots/terms state changes — restrictions are never bypassed." });
}
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const b = await readJson<{ jobId?: string; sourceRecordId?: string }>(req);
  if (!b?.jobId && !b?.sourceRecordId) return fail("jobId or sourceRecordId is required", ["missing_ref"], 400);
  let sourceRecordId = b.sourceRecordId ?? null;
  if (!sourceRecordId) {
    const job = await db.higherStudyCollectionJob.findUnique({ where: { id: b.jobId! } });
    if (!job) return fail("job not found", ["not_found"], 404);
    sourceRecordId = (await db.higherStudySourceRecord.findFirst({ where: { url: job.sourceUrl } }))?.id ?? null;
  }
  if (!sourceRecordId) return fail("source record not found for job", ["not_found"], 404);
  const result = await collectFromSource(sourceRecordId);
  await writeAudit(g.session, "higher_study_collection_retry", "HigherStudyCollectionJob", result.jobId, { status: result.status });
  if (result.status === "failed") return fail(`retry failed: ${result.error ?? "unknown error"}`, ["retry_failed"], 502);
  return ok(result);
}
