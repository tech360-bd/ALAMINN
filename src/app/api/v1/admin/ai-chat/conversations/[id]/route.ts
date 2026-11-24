/** Get, rename/archive or delete a user-owned AI chat conversation. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.archived !== undefined, {
    message: "Provide title and/or archived.",
  });

function notFound() {
  return NextResponse.json(
    { success: false, message: "Conversation not found.", data: null, meta: {}, errors: ["not_found"] },
    { status: 404 }
  );
}

async function ownedConversation(req: NextRequest, id: string) {
  const auth = await requireAuth(req);
  if (!auth.user) return { denied: auth.error as NextResponse } as const;
  const conversation = await db.aiChatConversation.findFirst({
    where: { id, userId: auth.user.userId },
  });
  if (!conversation) return { denied: notFound() } as const;
  return { denied: null, conversation, userId: auth.user.userId } as const;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await ownedConversation(req, id);
  if (access.denied) return access.denied;
  const messages = await db.aiChatMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: { id: true, role: true, content: true, provider: true, model: true, error: true, createdAt: true },
  });
  return NextResponse.json({
    success: true,
    message: "Conversation loaded.",
    data: { conversation: access.conversation, messages },
    meta: {},
    errors: [],
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await ownedConversation(req, id);
  if (access.denied) return access.denied;
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON.", data: null, meta: {}, errors: ["invalid_json"] }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.message, data: null, meta: {}, errors: ["invalid_request"] }, { status: 400 });
  }
  const updated = await db.aiChatConversation.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}),
    },
    select: { id: true, title: true, archived: true, updatedAt: true },
  });
  return NextResponse.json({ success: true, message: "Conversation updated.", data: { conversation: updated }, meta: {}, errors: [] });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await ownedConversation(req, id);
  if (access.denied) return access.denied;
  await db.aiChatConversation.delete({ where: { id } });
  return NextResponse.json({ success: true, message: "Conversation deleted.", data: { id }, meta: {}, errors: [] });
}
