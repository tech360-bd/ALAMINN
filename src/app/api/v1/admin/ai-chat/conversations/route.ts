/** Persistent admin AI chat conversations — authenticated and user-owned. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveChatProvider } from "@/lib/ai/chat-providers";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  provider: z.string().max(60).optional(),
  model: z.string().max(120).optional(),
});

function ok(data: unknown, message = "OK", status = 200) {
  return NextResponse.json({ success: true, message, data, meta: {}, errors: [] }, { status });
}
function fail(message: string, errors: string[], status: number) {
  return NextResponse.json({ success: false, message, data: null, meta: {}, errors }, { status });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.user) return auth.error;
  const search = req.nextUrl.searchParams.get("q")?.trim().slice(0, 120) || "";
  const includeArchived = req.nextUrl.searchParams.get("archived") === "true";

  const conversations = await db.aiChatConversation.findMany({
    where: {
      userId: auth.user.userId,
      ...(includeArchived ? {} : { archived: false }),
      ...(search ? { title: { contains: search } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, provider: true, model: true, archived: true,
      createdAt: true, updatedAt: true,
    },
  });
  return ok({ conversations });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.user) return auth.error;
  let raw: unknown;
  try { raw = await req.json(); } catch { return fail("Invalid JSON.", ["invalid_json"], 400); }
  const parsed = CreateSchema.safeParse(raw ?? {});
  if (!parsed.success) return fail("Invalid request.", ["invalid_request"], 400);

  const conversation = await db.aiChatConversation.create({
    data: {
      userId: auth.user.userId,
      title: parsed.data.title || "New conversation",
      provider: resolveChatProvider(parsed.data.provider),
      model: parsed.data.model?.trim() || "",
    },
    select: {
      id: true, title: true, provider: true, model: true, archived: true,
      createdAt: true, updatedAt: true,
    },
  });
  return ok({ conversation }, "Conversation created.", 201);
}
