import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, pagination } from "@/lib/admin-api-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/usage — API platform usage metrics:
 * totals, per-key breakdown, top routes and status distribution over
 * the last N days (default 7, max 30). Real ApiUsageLog rows only.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7") || 7, 1), 30);
  const since = new Date(Date.now() - days * 24 * 3600_000);

  const [total, sinceCount, logs, keys] = await Promise.all([
    db.apiUsageLog.count(),
    db.apiUsageLog.count({ where: { createdAt: { gte: since } } }),
    db.apiUsageLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, skip, take }),
    db.apiKey.findMany({ select: { id: true, name: true, prefix: true, status: true } }),
  ]);

  // Aggregate in-process over the window (bounded by window size).
  const [recent] = await Promise.all([
    db.apiUsageLog.findMany({ where: { createdAt: { gte: since } }, select: { keyId: true, route: true, method: true, status: true } }),
  ]);
  const byKey = new Map<string, { total: number; errors: number }>();
  const byRoute = new Map<string, number>();
  const byStatus = new Map<number, number>();
  for (const row of recent) {
    const key = row.keyId ?? "session";
    const entry = byKey.get(key) ?? { total: 0, errors: 0 };
    entry.total++;
    if (row.status >= 400) entry.errors++;
    byKey.set(key, entry);
    byRoute.set(row.route, (byRoute.get(row.route) ?? 0) + 1);
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  }
  const keyName = new Map(keys.map((k) => [k.id, `${k.name} (${k.prefix}…)`]));
  keyName.set("env:ecosystem", "Ecosystem bootstrap key (env)");
  keyName.set("session", "Admin sessions (no key)");

  return ok(
    {
      totals: { allTime: total, windowDays: days, inWindow: sinceCount },
      perKey: [...byKey.entries()].map(([id, v]) => ({ keyId: id, name: keyName.get(id) ?? id, total: v.total, errors: v.errors })).sort((a, b) => b.total - a.total),
      topRoutes: [...byRoute.entries()].map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 15),
      statusDistribution: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => a.status - b.status),
      recent: logs,
    },
    "API usage metrics loaded.",
    { page, pageSize, windowDays: days, sampled: recent.length }
  );
}
