import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, checkAdminRateLimit, writeAudit } from "@/lib/admin-api-server";
import { runFreeAiRouter } from "@/lib/ai/free-router";

export const dynamic = "force-dynamic";

const copilotSchema = z.object({
  conversationId: z.string().min(1).max(80),
  tone: z.enum(["friendly", "professional", "concise", "formal"]).default("professional"),
  intent: z.string().trim().max(400).optional(),
});

/**
 * POST /api/v1/admin/inbox/copilot — draft a reply for a unified-inbox
 * conversation with the AI copilot. Human-in-the-loop by design: this
 * endpoint ONLY returns a draft — it never sends or queues a message.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  if (!checkAdminRateLimit(`inbox-copilot:${guard.session.userId}`, 15).allowed) {
    return fail("Copilot limit reached. Try again in a minute.", ["rate_limited"], 429);
  }
  const body = await req.json().catch(() => null);
  const parsed = copilotSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid copilot request.", ["invalid_request"]);

  const conversation = await db.inboxConversation.findUnique({
    where: { id: parsed.data.conversationId },
  });
  if (!conversation) return fail("Conversation not found.", ["not_found"], 404);
  const contact = conversation.contactId
    ? await db.inboxContact.findUnique({ where: { id: conversation.contactId }, select: { displayName: true, email: true } }).catch(() => null)
    : null;
  const messagesDesc = await db.inboxMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const recent = [...messagesDesc].reverse();
  void contact; // reserved for personalization once display names are widely captured
  const transcript = recent
    .map((m) => `${m.direction === "outbound" ? "Agent" : "Customer"}: ${m.body.slice(0, 600)}`)
    .join("\n")
    .slice(0, 4000);

  const system = `You draft replies for the ALAMINN unified inbox (${conversation.channel}). Tone: ${parsed.data.tone}. ${parsed.data.intent ? `Intent: ${parsed.data.intent}. ` : ""}Rules: draft ONLY the reply text (no greeting labels like "Agent:"); reference real facts from the transcript; if the answer is unknown, say the team will confirm; never invent prices, deadlines, or university names; keep it under 120 words.`;

  try {
    const result = await runFreeAiRouter({
      systemPrompt: system,
      messages: [{ role: "user", content: `Conversation transcript:\n${transcript || "(no messages yet)"}\n\nDraft the next reply.` }],
      maxTokens: 400,
      bypassCache: true,
      cacheScope: { userId: guard.session.userId, agentId: "inbox-copilot" },
    });
    if (!result.content?.trim()) {
      return fail("The AI copilot returned an empty draft. Please retry or write the reply manually.", ["empty_draft"], 502);
    }
    await writeAudit(guard.session, "inbox.copilot.draft", "InboxConversation", conversation.id, {
      provider: result.providerUsed,
      model: result.modelUsed,
    });
    return ok(
      {
        draft: result.content.trim(),
        conversationId: conversation.id,
        channel: conversation.channel,
        provider: result.providerName,
        model: result.modelUsed,
        sentByCopilot: false, // drafts never auto-send — human review is required
      },
      "Draft ready. Review and edit before sending — nothing was sent to the customer."
    );
  } catch (e) {
    return fail(`Copilot failed: ${(e as Error).message}`.slice(0, 200), ["copilot_failed"], 502);
  }
}
