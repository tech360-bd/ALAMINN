/** Owner-initiated WhatsApp send. Requires an explicit connected SocialAccount; never uses global credentials. */
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/social/adapters";
import { normalizeWhatsappNumber } from "@/lib/whatsapp";
import { isWhatsappCustomerServiceWindowOpen } from "@/lib/whatsapp/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "ai_tasks.update");
  if (guard.denied) return guard.response;

  const body = await readJson<{ accountId?: string; to?: string; text?: string }>(req);
  if (!body) return fail("Invalid JSON body.", ["invalid_json"], 400);
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!accountId) return fail("Select a WhatsApp sending account.", ["account_required"], 400);
  if (!to) return fail("`to` is required.", ["to_required"], 400);
  if (!text) return fail("`text` is required.", ["text_required"], 400);
  if (text.length > 4096) return fail("Text too long (max 4096 chars).", ["text_too_long"], 400);
  const normalized = normalizeWhatsappNumber(to);
  if (!normalized) return fail("Invalid recipient number.", ["invalid_to"], 400);

  const account = await db.socialAccount.findFirst({ where: { id: accountId, platform: "whatsapp" } });
  if (!account) return fail("Selected WhatsApp account was not found.", ["account_not_found"], 404);
  if (account.status !== "connected" || !account.tokenEncrypted) {
    return fail("Selected WhatsApp account is not connected with its own credentials.", ["account_not_connected"], 409);
  }
  const conversation = await db.socialConversation.findUnique({
    where: { accountId_externalThreadId: { accountId: account.id, externalThreadId: normalized } },
    select: { id: true },
  });
  const latestInbound = conversation ? await db.socialMessage.findFirst({
    where: { conversationId: conversation.id, direction: "inbound" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  }) : null;
  const windowOpen = isWhatsappCustomerServiceWindowOpen(latestInbound?.createdAt);
  if (!windowOpen) {
    return fail("Free-form WhatsApp messages are allowed only within 24 hours of the customer's last message. Approved template sending is not implemented here.", ["customer_service_window_closed"], 409);
  }

  const outbound = await db.socialMessage.create({
    data: { conversationId: conversation!.id, direction: "outbound", kind: "message", body: text, isOwn: true, deliveryStatus: "sending" },
  });
  await db.socialConversation.update({ where: { id: conversation!.id }, data: { lastMessageAt: new Date() } });
  const result = await getAdapter("whatsapp").sendReply(account, normalized, text);
  await db.socialMessage.update({
    where: { id: outbound.id },
    data: { providerMessageId: result.providerId, deliveryStatus: result.actuallySent ? "sent" : "failed" },
  });
  await writeAudit(guard.session, "whatsapp_manual_send", "WhatsApp", result.providerId || outbound.id, {
    accountId: account.id,
    accountLabel: account.displayName,
    toSuffix: normalized.slice(-4),
    status: result.status,
    actuallySent: result.actuallySent,
    error: result.error,
  });
  if (!result.actuallySent) return fail("WhatsApp message was not sent. Check the selected account connection and provider response.", ["send_failed"], 502, { status: result.status, actuallySent: false, error: result.error });
  return ok({ messageId: result.providerId, status: result.status, actuallySent: true, accountId: account.id, accountLabel: account.displayName }, `Message accepted by WhatsApp via ${account.displayName}.`, { toSuffix: normalized.slice(-4) });
}
