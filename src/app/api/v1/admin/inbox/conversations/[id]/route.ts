/** Inbox conversation detail and operator controls. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  status: z.enum(["unread", "open", "pending", "resolved", "escalated", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedUserId: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().trim().max(60)).max(30).optional(),
  markRead: z.boolean().optional(),
});

function notFound() {
  return NextResponse.json({ success: false, message: "Conversation not found.", data: null, meta: {}, errors: ["not_found"] }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "inquiries.view");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const conversation = await db.inboxConversation.findUnique({ where: { id } });
  if (!conversation) return notFound();
  const [messages, audit, contact] = await Promise.all([
    db.inboxMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, take: 200 }),
    db.inboxAudit.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    conversation.contactId ? db.inboxContact.findUnique({ where: { id: conversation.contactId } }) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    success: true, message: "Conversation loaded.",
    data: {
      conversation: { ...conversation, tags: safeTags(conversation.tags) },
      messages: messages.map((m) => ({ ...m, attachments: safeTags(m.attachments) })),
      audit,
      contact,
    },
    meta: {}, errors: [],
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "inquiries.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.inboxConversation.findUnique({ where: { id } });
  if (!existing) return notFound();
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON.", data: null, meta: {}, errors: ["invalid_json"] }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid update.", data: null, meta: {}, errors: ["invalid_request"] }, { status: 400 });
  }
  const data = parsed.data;
  const updated = await db.inboxConversation.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.priority ? { priority: data.priority } : {}),
      ...(data.assignedUserId !== undefined ? { assignedUserId: data.assignedUserId } : {}),
      ...(data.tags ? { tags: JSON.stringify(data.tags) } : {}),
      ...(data.markRead ? { unreadCount: 0 } : {}),
    },
  });
  await db.inboxAudit.create({
    data: {
      conversationId: id,
      action: "conversation_updated",
      actorId: guard.session.userId,
      meta: JSON.stringify({ status: data.status, priority: data.priority, assigned: data.assignedUserId, tags: data.tags }),
    },
  });
  await writeAudit(guard.session, "inbox_conversation_updated", "InboxConversation", id, { status: data.status });
  return NextResponse.json({ success: true, message: "Conversation updated.", data: { conversation: updated }, meta: {}, errors: [] });
}

function safeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
