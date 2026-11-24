/**
 * POST /api/v1/admin/ai-chat/conversations/[id]/messages
 *
 * Persists the user message, streams the generated response as SSE, then
 * persists the assistant message (or a truthful error row). Generation uses
 * the existing free-first provider gateway; no key is sent to the browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runFreeAiRouter } from "@/lib/ai/free-router";
import { resolveChatProvider } from "@/lib/ai/chat-providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const MessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  provider: z.string().max(60).optional(),
  model: z.string().max(120).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if (!auth.user) return auth.error;
  const { id } = await ctx.params;

  const conversation = await db.aiChatConversation.findFirst({
    where: { id, userId: auth.user.userId },
  });
  if (!conversation) {
    return NextResponse.json(
      { success: false, message: "Conversation not found.", data: null, meta: {}, errors: ["not_found"] },
      { status: 404 }
    );
  }

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON.", data: null, meta: {}, errors: ["invalid_json"] }, { status: 400 });
  }
  const parsed = MessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid message.", data: null, meta: {}, errors: ["invalid_request"] }, { status: 400 });
  }

  const userMessage = await db.aiChatMessage.create({
    data: { conversationId: id, role: "user", content: parsed.data.content },
    select: { id: true, createdAt: true },
  });
  await db.aiChatConversation.update({
    where: { id },
    data: { updatedAt: new Date(), ...(conversation.title === "New conversation" ? { title: parsed.data.content.slice(0, 70) } : {}) },
  });

  const encoder = new TextEncoder();
  const requestedProvider = resolveChatProvider(parsed.data.provider ?? conversation.provider);
  const requestedModel = (parsed.data.model ?? conversation.model).trim();
  let cancelled = false;
  req.signal.addEventListener("abort", () => { cancelled = true; });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let delivered = "";
      try {
        emit("status", { stage: "generating", userMessageId: userMessage.id });
        const result = await runFreeAiRouter({
          systemPrompt:
            "You are the Alaminn.info admin AI assistant. Use only supplied context, be concise, and say when information is unavailable. Never fabricate provider results or task success.",
          messages: [{ role: "user", content: parsed.data.content }],
          preferredProvider: requestedProvider,
          ...(requestedModel ? { preferredModel: requestedModel } : {}),
          bypassCache: true,
          cacheScope: { userId: auth.user!.userId, agentId: "admin-ai-chat" },
        });
        delivered = result.content || "";
        if (!delivered.trim()) throw new Error("empty_output");
        for (let offset = 0; offset < delivered.length; offset += 160) {
          if (cancelled) break;
          const chunk = delivered.slice(offset, offset + 160);
          emit("delta", { text: chunk });
        }
        if (cancelled) {
          await db.aiChatMessage.create({
            data: {
              conversationId: id,
              role: "assistant",
              content: delivered,
              provider: result.providerName,
              model: result.modelUsed,
              error: "cancelled_by_client",
            },
          });
          controller.close();
          return;
        }
        await db.aiChatMessage.create({
          data: {
            conversationId: id,
            role: "assistant",
            content: delivered,
            provider: result.providerName,
            model: result.modelUsed,
          },
        });
        emit("done", {
          provider: result.providerName,
          model: result.modelUsed,
          cached: result.cached,
          content: delivered,
        });
      } catch {
        await db.aiChatMessage.create({
          data: {
            conversationId: id,
            role: "assistant",
            content: delivered,
            provider: null,
            model: null,
            error: "provider_unavailable",
          },
        });
        emit("error", {
          message: "AI provider is unavailable. No generated response was stored.",
          code: "provider_unavailable",
        });
      } finally {
        await db.aiChatConversation.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => undefined);
        try { controller.close(); } catch { /* already closed by the runtime */ }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
