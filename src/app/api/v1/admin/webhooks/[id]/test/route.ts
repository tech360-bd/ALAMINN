import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, checkAdminRateLimit } from "@/lib/admin-api-server";
import { emitWebhookEvent, WEBHOOK_EVENTS } from "@/lib/api-platform/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/webhooks/[id]/test — send a test event to the
 * endpoint and record the delivery attempt (same retry policy as
 * production events).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;
  if (!checkAdminRateLimit(`webhook-test:${guard.session.userId}`, 10).allowed) {
    return fail("Too many test deliveries. Wait a minute.", ["rate_limited"], 429);
  }
  const { id } = await ctx.params;
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) return fail("Webhook endpoint not found.", ["not_found"], 404);
  const testEvent = WEBHOOK_EVENTS[0];
  const result = await emitWebhookEvent(testEvent, {
    test: true,
    endpointId: id,
    message: "This is a test delivery from the ALAMINN webhook platform.",
  });
  await writeAudit(guard.session, "webhook.test", "WebhookEndpoint", id, { ok: result.delivered > 0 });
  const delivery = await db.webhookDelivery.findFirst({
    where: { endpointId: id },
    orderBy: { createdAt: "desc" },
  });
  return ok(
    { ...result, lastDelivery: delivery },
    result.endpoints === 0
      ? "This endpoint is not subscribed to any emittable event, or the endpoint is paused."
      : result.delivered > 0
        ? "Test event delivered successfully."
        : "Test delivery failed — check the recorded lastError and the endpoint URL.",
    {},
    result.delivered > 0 ? 200 : 200
  );
}
