import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { UCI_STATUSES } from "@/lib/uci/verification";
import type { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/uci/admin/queue?status=...&page=&pageSize= — verification queue.
 * RBAC: uci.verify (ADMIN, EDITOR). Only real records with their provenance;
 * unverified never auto-publishes.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "uci.verify")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim() ?? "SOURCE_CHECK_REQUIRED";
  const _q = sp.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(sp.get("pageSize") ?? "15", 10) || 15));
  const statusFilter = UCI_STATUSES.includes(status as never) ? status : undefined;

  const where: Prisma.UciRequirementRecordWhereInput = {
    ...(statusFilter ? { verificationStatus: statusFilter } : {}),
  };

  const [total, items, statusCounts] = await Promise.all([
    db.uciRequirementRecord.count({ where }),
    db.uciRequirementRecord.findMany({
      where,
      orderBy: { collectedAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { institution: { select: { canonicalName: true, country: true, priorityCohort: true } } },
    }),
    db.uciRequirementRecord.groupBy({
      by: ["verificationStatus"],
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    items,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.verificationStatus, s._count._all])),
    statuses: UCI_STATUSES,
  });
}
