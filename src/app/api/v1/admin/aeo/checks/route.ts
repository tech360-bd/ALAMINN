import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson, checkAdminRateLimit, pagination } from "@/lib/admin-api-server";
import { runCitationCheck } from "@/lib/aeo/tracker";

export const dynamic = "force-dynamic";

const runSchema = z.object({
  queries: z.array(z.string().trim().min(3).max(300)).min(1).max(10).optional(),
});

/** GET /api/v1/admin/aeo/checks — citation check history */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "articles.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const [items, total] = await Promise.all([
    db.aeoCheckRun.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
    db.aeoCheckRun.count(),
  ]);
  const withResults = await Promise.all(
    items.map(async (run) => ({
      ...run,
      checks: await db.aeoCitationCheck.findMany({ where: { runId: run.id }, orderBy: { createdAt: "asc" } }).catch(() => []),
    }))
  );
  return ok(withResults, "AEO citation check history loaded.", {
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    providerConfigured: !!(process.env.BRAVE_SEARCH_API_KEY),
  });
}

/** POST /api/v1/admin/aeo/checks — run a real citation check (provider required) */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "articles.update");
  if (guard.denied) return guard.response;
  if (!checkAdminRateLimit(`aeo-check:${guard.session.userId}`, 6).allowed) {
    return fail("Too many citation checks. Wait a minute.", ["rate_limited"], 429);
  }
  const body = await readJson(req);
  const parsed = runSchema.safeParse(body ?? {});
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid check request.", ["invalid_check"]);
  const result = await runCitationCheck({ queries: parsed.data.queries });
  await writeAudit(guard.session, "aeo.check.run", "AeoCheckRun", result.runId, {
    status: result.status, cited: result.citedCount, queries: result.queries,
  });
  if (result.status === "provider_unavailable") {
    return fail(
      "No answer-engine provider is configured. Set BRAVE_SEARCH_API_KEY to run real citation checks. Scores are never simulated.",
      ["provider_unavailable"],
      503
    );
  }
  return ok(result, `Citation check finished: cited in ${result.citedCount} of ${result.queries} queries (score ${result.score}).`);
}
