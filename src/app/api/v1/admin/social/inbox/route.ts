import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response;
  const u = new URL(req.url); const { skip, take, page, pageSize } = pagination(req);
  const where: Record<string, unknown> = {}; if (u.searchParams.get("status")) where.status = u.searchParams.get("status"); if (u.searchParams.get("platform")) where.platform = u.searchParams.get("platform"); if (u.searchParams.get("accountId")) where.accountId = u.searchParams.get("accountId");
  const q = u.searchParams.get("q"); if (q) where.OR = [{ participantName: { contains: q } }, { participantId: { contains: q } }];
  const [rows, total] = await Promise.all([db.socialConversation.findMany({ where, orderBy: { lastMessageAt: "desc" }, skip, take, include: { account: { select: { displayName: true, platform: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } } }), db.socialConversation.count({ where })]);
  return ok(rows, "OK", { page, pageSize, total }); }
