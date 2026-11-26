import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson, pagination } from "@/lib/admin-api-server";
import { generateWebhookSecret, WEBHOOK_EVENTS } from "@/lib/api-platform/webhooks";

export const dynamic = "force-dynamic";

const webhookCreateSchema = z.object({
  url: z.string().url().startsWith("https://").max(1000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
  status: z.enum(["active", "paused"]).default("active"),
});

/** GET /api/v1/admin/webhooks — list endpoints + recent delivery stats */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const [items, total] = await Promise.all([
    db.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
    db.webhookEndpoint.count(),
  ]);
  const withStats = await Promise.all(
    items.map(async (ep) => {
      const [delivered, failed] = await Promise.all([
        db.webhookDelivery.count({ where: { endpointId: ep.id, status: "success" } }),
        db.webhookDelivery.count({ where: { endpointId: ep.id, status: "failed" } }),
      ]);
      return { ...ep, secret: undefined, deliveredCount: delivered, failedCount: failed };
    })
  );
  return ok(withStats, "Webhook endpoints loaded.", {
    page, pageSize, total, totalPages: Math.ceil(total / pageSize), availableEvents: WEBHOOK_EVENTS,
  });
}

/** POST /api/v1/admin/webhooks — register an endpoint (secret shown once) */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = webhookCreateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid webhook request.", ["invalid_webhook"]);
  const secret = generateWebhookSecret();
  const created = await db.webhookEndpoint.create({
    data: {
      url: parsed.data.url,
      events: JSON.stringify(parsed.data.events),
      secret,
      status: parsed.data.status,
    },
  });
  await writeAudit(guard.session, "webhook.create", "WebhookEndpoint", created.id, { url: created.url, events: parsed.data.events });
  return ok(
    { ...created, secret: undefined, signingSecret: secret },
    "Webhook endpoint registered. Copy the signing secret now — it is shown only this once.",
    {},
    201
  );
}
