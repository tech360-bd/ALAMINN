import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson } from "@/lib/admin-api-server";
import { WEBHOOK_EVENTS } from "@/lib/api-platform/webhooks";

export const dynamic = "force-dynamic";

const webhookUpdateSchema = z.object({
  url: z.string().url().startsWith("https://").max(1000).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

/** PUT /api/v1/admin/webhooks/[id] — update an endpoint */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!existing) return fail("Webhook endpoint not found.", ["not_found"], 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = webhookUpdateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid webhook update.", ["invalid_webhook"]);
  const updated = await db.webhookEndpoint.update({
    where: { id },
    data: {
      ...(parsed.data.url ? { url: parsed.data.url } : {}),
      ...(parsed.data.events ? { events: JSON.stringify(parsed.data.events) } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });
  await writeAudit(guard.session, "webhook.update", "WebhookEndpoint", id, { url: updated.url });
  return ok({ ...updated, secret: undefined }, "Webhook endpoint updated.");
}

/** DELETE /api/v1/admin/webhooks/[id] — remove an endpoint (deliveries kept) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.webhookEndpoint.findUnique({ where: { id } });
  if (!existing) return fail("Webhook endpoint not found.", ["not_found"], 404);
  await db.webhookEndpoint.delete({ where: { id } });
  await writeAudit(guard.session, "webhook.delete", "WebhookEndpoint", id, { url: existing.url });
  return ok({ id }, "Webhook endpoint deleted. Delivery history is retained.");
}
