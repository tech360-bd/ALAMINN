/** Unified reply/note endpoint with idempotency and global mode enforcement. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { COMMUNICATION_MODE_KEY, parseCommunicationMode } from "@/lib/social/communication-controls";
import { authorizeOutbound } from "@/lib/inbox/outbound";
import { getInboxAdapter, INBOX_ADAPTERS, ChannelNotConnectedError } from "@/lib/inbox/adapters";
import type { CommunicationMode } from "@/lib/social/communication-controls";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const ReplySchema = z.object({
  kind: z.enum(["reply", "note"]).default("reply"),
  body: z.string().trim().min(1).max(8000),
  automated: z.boolean().default(false),
  approvalGiven: z.boolean().default(false),
  idempotencyKey: z.string().trim().max(200).optional(),
  attachmentIds: z.array(z.string().trim().max(120)).max(10).default([]),
});

function error(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, message, data: null, meta: {}, errors: [code] }, { status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "inquiries.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const conversation = await db.inboxConversation.findUnique({ where: { id } });
  if (!conversation) return error("Conversation not found.", "not_found", 404);

  let raw: unknown;
  try { raw = await req.json(); } catch { return error("Invalid JSON.", "invalid_json", 400); }
  const parsed = ReplySchema.safeParse(raw);
  if (!parsed.success) return error("Invalid reply.", "invalid_request", 400);
  const input = parsed.data;

  const attachments = input.attachmentIds.length
    ? await db.inboxAttachment.findMany({
        where: { id: { in: input.attachmentIds }, conversationId: id },
        select: { id: true, filename: true, mimeType: true, size: true },
      })
    : [];
  const attachmentMetadata = attachments.map((attachment) => ({
    name: attachment.filename,
    url: `/api/v1/admin/inbox/attachments/${attachment.id}`,
    mimeType: attachment.mimeType,
    size: attachment.size,
  }));

  if (input.idempotencyKey) {
    const duplicate = await db.inboxMessage.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (duplicate) {
      return NextResponse.json({ success: true, message: "Duplicate request ignored.", data: { message: duplicate, duplicate: true }, meta: {}, errors: [] });
    }
  }

  const modeRow = await db.setting.findUnique({ where: { key: COMMUNICATION_MODE_KEY } });
  const mode = parseCommunicationMode(modeRow?.value) as CommunicationMode;
  if (input.kind === "reply" && mode === "PAUSED") {
    return error("Communication is paused. No outbound message was sent.", "paused", 409);
  }
  const adapter = getInboxAdapter(conversation.channel);
  if (!adapter) return error("Unsupported channel.", "unsupported_channel", 400);

  if (input.kind === "reply" && input.automated) {
    const connectedChannels = Object.keys(INBOX_ADAPTERS).filter(
      (channel) => getInboxAdapter(channel)?.isConnected()
    );
    const decision = authorizeOutbound({
      mode,
      channel: conversation.channel,
      allowedChannels: connectedChannels,
      external: adapter.external,
      approvalGiven: input.approvalGiven,
    });
    if (!decision.allowed) {
      await db.inboxAudit.create({
        data: { conversationId: id, action: "outbound_blocked", actorId: guard.session.userId, meta: JSON.stringify(decision) },
      });
      return error(`Outbound blocked: ${decision.reason}`, decision.route === "approval" ? "approval_required" : "automation_blocked", 403);
    }
  }

  let deliveryStatus = "received";
  let providerMessageId: string | undefined;
  let sendError: string | undefined;
  if (input.kind === "reply") {
    if (!adapter.isConnected()) {
      return error("Channel is not connected. No message was sent.", "channel_not_connected", 503);
    }
    try {
      const result = await adapter.send({
        conversationId: id,
        externalThreadId: conversation.externalThreadId,
        accountId: conversation.accountId,
        body: input.body,
        attachments: attachmentMetadata,
      });
      deliveryStatus = result.status;
      providerMessageId = result.providerMessageId;
      sendError = result.error;
    } catch (e) {
      if (e instanceof ChannelNotConnectedError) {
        return error(e.message, "channel_not_connected", 503);
      }
      sendError = e instanceof Error ? e.message : "Adapter failure";
      deliveryStatus = "failed";
    }
  } else {
    deliveryStatus = "suppressed";
  }

  const message = await db.inboxMessage.create({
    data: {
      conversationId: id,
      providerMessageId,
      idempotencyKey: input.idempotencyKey || null,
      direction: input.kind === "note" ? "internal_note" : "outbound",
      body: input.body,
      attachments: JSON.stringify(attachmentMetadata),
      senderType: input.kind === "note" ? "agent" : input.automated ? "ai" : "agent",
      deliveryStatus: input.kind === "note" ? "suppressed" : deliveryStatus,
      error: sendError || null,
    },
  });
  await db.inboxConversation.update({ where: { id }, data: { lastMessageAt: new Date(), unreadCount: 0 } });
  await db.inboxAudit.create({
    data: {
      conversationId: id,
      action: input.kind === "note" ? "internal_note_added" : "reply_sent",
      actorId: guard.session.userId,
      meta: JSON.stringify({ messageId: message.id, automated: input.automated, status: deliveryStatus }),
    },
  });
  await writeAudit(guard.session, "inbox_message_created", "InboxConversation", id, {
    messageId: message.id,
    kind: input.kind,
    deliveryStatus: message.deliveryStatus,
    automated: input.automated,
  });
  return NextResponse.json({
    success: true,
    message: input.kind === "note" ? "Internal note saved." : "Reply recorded.",
    data: { message, actuallySent: input.kind === "reply" && !sendError && message.deliveryStatus !== "failed" },
    meta: {}, errors: [],
  }, { status: 201 });
}
