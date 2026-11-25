/** Owner-initiated WhatsApp send. Requires an explicit connected SocialAccount; never uses global credentials. */
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/social/adapters";
import { normalizeWhatsappNumber } from "@/lib/whatsapp";
import { isWhatsappCustomerServiceWindowOpen } from "@/lib/whatsapp/policy";
import { sendWhatsappAccountTemplate, type WhatsappTemplateComponent } from "@/lib/whatsapp/sender";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TemplatePayload = { name?: string; language?: string; components?: unknown[] };

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "ai_tasks.update");
  if (guard.denied) return guard.response;

  const body = await readJson<{ accountId?: string; to?: string; text?: string; template?: TemplatePayload }>(req);
  if (!body) return fail("Invalid JSON body.", ["invalid_json"], 400);
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const template = body.template && typeof body.template === "object" ? body.template : null;
  const templateName = typeof template?.name === "string" ? template.name.trim() : "";
  const templateLanguage = typeof template?.language === "string" ? template.language.trim() : "";
  const templateComponents = Array.isArray(template?.components) ? template!.components : [];

  if (!accountId) return fail("Select a WhatsApp sending account.", ["account_required"], 400);
  if (!to) return fail("`to` is required.", ["to_required"], 400);
  if (!text && !templateName) return fail("Provide `text` for a free-form message or `template` for an approved template send.", ["message_required"], 400);
  if (text && text.length > 4096) return fail("Text too long (max 4096 chars).", ["text_too_long"], 400);
  if (templateName && !templateLanguage) return fail("Template `language` is required.", ["template_language_required"], 400);
  const normalized = normalizeWhatsappNumber(to);
  if (!normalized) return fail("Invalid recipient number.", ["invalid_to"], 400);

  const account = await db.socialAccount.findFirst({ where: { id: accountId, platform: "whatsapp" } });
  if (!account) return fail("Selected WhatsApp account was not found.", ["account_not_found"], 404);
  if (account.status !== "connected" || !account.tokenEncrypted) {
    return fail("Selected WhatsApp account is not connected with its own credentials.", ["account_not_connected"], 409);
  }

  let conversation = await db.socialConversation.findUnique({
    where: { accountId_externalThreadId: { accountId: account.id, externalThreadId: normalized } },
    select: { id: true },
  });

  if (!templateName) {
    const latestInbound = conversation ? await db.socialMessage.findFirst({
      where: { conversationId: conversation.id, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }) : null;
    const windowOpen = isWhatsappCustomerServiceWindowOpen(latestInbound?.createdAt);
    if (!windowOpen) {
      return fail(
        "Free-form WhatsApp messages are allowed only within 24 hours of the customer's last message. Use an approved template message outside the customer service window.",
        ["customer_service_window_closed"],
        409
      );
    }
  }

  if (!conversation) {
    conversation = await db.socialConversation.create({
      data: {
        accountId: account.id,
        platform: "whatsapp",
        externalThreadId: normalized,
        participantId: normalized,
        participantName: normalized,
        status: "open",
        lastMessageAt: new Date(),
      },
      select: { id: true },
    });
  }

  const isTemplate = Boolean(templateName);
  const outboundBody = isTemplate ? `[Template:${templateName}/${templateLanguage}] ${text || ""}`.trim() : text;
  const outbound = await db.socialMessage.create({
    data: { conversationId: conversation.id, direction: "outbound", kind: isTemplate ? "template" : "message", body: outboundBody, isOwn: true, deliveryStatus: "sending" },
  });
  await db.socialConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

  const result = isTemplate
    ? await sendWhatsappAccountTemplate(account, normalized, { name: templateName, language: templateLanguage, components: templateComponents as WhatsappTemplateComponent[] })
    : await getAdapter("whatsapp").sendReply(account, normalized, text);

  const providerMessageId = "messageId" in result ? result.messageId : result.providerId;
  await db.socialMessage.update({
    where: { id: outbound.id },
    data: { providerMessageId, deliveryStatus: result.actuallySent ? "sent" : "failed" },
  });
  await writeAudit(guard.session, isTemplate ? "whatsapp_template_send" : "whatsapp_manual_send", "WhatsApp", providerMessageId || outbound.id, {
    accountId: account.id,
    accountLabel: account.displayName,
    toSuffix: normalized.slice(-4),
    status: result.status,
    actuallySent: result.actuallySent,
    error: result.error,
    templateName: isTemplate ? templateName : undefined,
  });
  if (!result.actuallySent) return fail("WhatsApp message was not sent. Check the selected account connection and provider response.", [isTemplate ? "template_send_failed" : "send_failed"], 502, { status: result.status, actuallySent: false, error: result.error });
  return ok({ messageId: providerMessageId, status: result.status, actuallySent: true, accountId: account.id, accountLabel: account.displayName, template: isTemplate }, `Message accepted by WhatsApp via ${account.displayName}.`, { toSuffix: normalized.slice(-4) });
}
