import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response; const s = await db.socialAutomationState.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} }); return ok(s); }
export async function PUT(req: NextRequest) {
  const g = await requirePermission(req, "social.automation.manage"); if (g.denied) return g.response;
  const b = await readJson<{ engagementEnabled?: boolean; publishingEnabled?: boolean; generationEnabled?: boolean }>(req); if (!b) return fail("Invalid JSON", ["invalid_json"], 400);
  const turningOff = b.engagementEnabled === false;
  const s = await db.$transaction(async (tx) => {
    const cur = await tx.socialAutomationState.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} });
    const next = await tx.socialAutomationState.update({ where: { id: "global" }, data: { engagementEnabled: b.engagementEnabled ?? cur.engagementEnabled, publishingEnabled: b.publishingEnabled ?? cur.publishingEnabled, generationEnabled: b.generationEnabled ?? cur.generationEnabled, version: { increment: 1 }, changedById: g.session.userId, changedByName: g.session.name || g.session.email } });
    if (turningOff && cur.engagementEnabled) {
      await tx.socialMessage.updateMany({ where: { deliveryStatus: "queued", isOwn: true }, data: { deliveryStatus: "suppressed" } });
      await tx.socialReplyDecision.updateMany({ where: { decision: "held" }, data: { decision: "suppressed_off", reason: "global_switched_off" } });
    }
    return next;
  });
  await writeAudit(g.session, "social_automation_changed", "SocialAutomation", "global", { engagementEnabled: s.engagementEnabled, publishingEnabled: s.publishingEnabled, version: s.version });
  return ok(s, turningOff ? "Automation OFF — queued unsent replies suppressed. Already-delivered messages cannot be recalled." : "Automation settings saved.");
}
