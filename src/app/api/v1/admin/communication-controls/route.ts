/**
 * GET/PUT /api/v1/admin/communication-controls
 *
 * Global human/AI communication mode and external-send switch. Values are
 * persisted in `Setting`; enforcement happens in the final-send boundary.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import {
  COMMUNICATION_MODE_KEY,
  SEND_THROUGH_PLATFORM_KEY,
  parseCommunicationMode,
  parseSendThroughPlatform,
} from "@/lib/social/communication-controls";
import { getGlobalState } from "@/lib/social/policy-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UpdateSchema = z.object({
  mode: z.enum(["HUMAN_OPERATOR", "AI_ASSISTED", "AI_AUTONOMOUS", "PAUSED"]).optional(),
  sendThroughPlatform: z.boolean().optional(),
});

async function loadControls() {
  const [modeRow, sendRow, automation, accounts] = await Promise.all([
    db.setting.findUnique({ where: { key: COMMUNICATION_MODE_KEY } }),
    db.setting.findUnique({ where: { key: SEND_THROUGH_PLATFORM_KEY } }),
    getGlobalState(),
    db.socialAccount.findMany({
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        platform: true,
        displayName: true,
        status: true,
        automationEnabled: true,
        responseMode: true,
        tokenExpiresAt: true,
      },
    }),
  ]);

  return {
    mode: parseCommunicationMode(modeRow?.value),
    sendThroughPlatform: parseSendThroughPlatform(sendRow?.value),
    effective: {
      globalEngagementEnabled: automation?.engagementEnabled ?? false,
      globalPublishingEnabled: automation?.publishingEnabled ?? false,
      automationVersion: automation?.version ?? 0,
    },
    accounts,
    enforcement:
      "The global mode overrides account and rule automation. PAUSED, HUMAN_OPERATOR and AI_ASSISTED never auto-send; AI_AUTONOMOUS defers to existing per-account policy.",
  };
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "social.view");
  if (guard.denied) return guard.response;
  return ok(await loadControls());
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "social.automation.manage");
  if (guard.denied) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  const parsed = UpdateSchema.safeParse(body ?? {});
  if (!parsed.success || (!parsed.data.mode && parsed.data.sendThroughPlatform === undefined)) {
    return fail("Provide mode and/or sendThroughPlatform.", ["invalid_request"], 400);
  }

  const updates: Promise<unknown>[] = [];
  if (parsed.data.mode) {
    updates.push(
      db.setting.upsert({
        where: { key: COMMUNICATION_MODE_KEY },
        update: { value: parsed.data.mode },
        create: { key: COMMUNICATION_MODE_KEY, value: parsed.data.mode },
      })
    );
  }
  if (parsed.data.sendThroughPlatform !== undefined) {
    updates.push(
      db.setting.upsert({
        where: { key: SEND_THROUGH_PLATFORM_KEY },
        update: { value: String(parsed.data.sendThroughPlatform) },
        create: {
          key: SEND_THROUGH_PLATFORM_KEY,
          value: String(parsed.data.sendThroughPlatform),
        },
      })
    );
  }
  await Promise.all(updates);

  await writeAudit(guard.session, "communication_controls_changed", "Setting", "global", {
    mode: parsed.data.mode ?? null,
    sendThroughPlatform: parsed.data.sendThroughPlatform ?? null,
  });

  return ok(await loadControls(), "Communication controls saved.");
}
