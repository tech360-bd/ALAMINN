import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response;
  const u = new URL(req.url); const status = u.searchParams.get("status") || "pending";
  const rows = await db.socialApproval.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 50 });
  const out = await Promise.all(rows.map(async (a) => { const d = await db.socialReplyDecision.findUnique({ where: { id: a.decisionId } }); const c = d ? await db.socialConversation.findUnique({ where: { id: d.conversationId }, include: { account: { select: { displayName: true, platform: true } } } }) : null; return { ...a, decision: d, conversation: c }; }));
  return ok(out); }
