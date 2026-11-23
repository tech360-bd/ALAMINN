/**
 * Alaminn.info — Standalone Background AI Worker
 *
 * Polls `AiTask` rows in status="queued" and executes them via the Multi-Provider
 * AI Router (UnoRouter `claude-opus-4-6-thinking` preferred first, cascading across
 * Groq, Gemini, Cerebras, OpenRouter :free, GitHub Models, Pollinations, Ollama,
 * or deterministic grounded synthesis) before moving them to `awaiting-approval` or `delivered`.
 *
 * Run: `npx tsx mini-services/ai-worker/index.ts`
 */

import { db } from "../../src/lib/db";
import { WORKFLOW_PROMPTS } from "../../src/lib/ai/workflow-executor";
import { runFreeAiRouter } from "../../src/lib/ai/free-router";

const POLL_MS = Number(process.env.AI_WORKER_POLL_MS || 5000);

async function generateWithRouterStack(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await runFreeAiRouter({
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tier: "flagship",
    maxTokens: 2000,
    bypassCache: true,
  });
  return res.content;
}

async function processNext(): Promise<boolean> {
  const task = await db.aiTask.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!task) return false;

  await db.aiTask.update({ where: { id: task.id }, data: { status: "processing" } });
  console.log(`[ai-worker] Processing task ${task.id} (${task.workflow})`);

  try {
    const sys = WORKFLOW_PROMPTS[task.workflow] || "You are a concise executive assistant.";
    const userPrompt = `Objective: ${task.objective}\n\nBrief:\n${task.prompt}`;
    const output = await generateWithRouterStack(sys, userPrompt);
    const nextStatus = task.approvalRequired ? "awaiting-approval" : "delivered";
    await db.aiTask.update({
      where: { id: task.id },
      data: {
        result: output,
        status: nextStatus,
        ...(nextStatus === "delivered" ? { completedAt: new Date() } : {}),
      },
    });
    if (task.requesterId) {
      await db.notification.create({
        data: {
          userId: task.requesterId,
          type: "ai_task",
          title:
            nextStatus === "awaiting-approval"
              ? `AI draft ready for approval: ${task.objective}`
              : `AI task delivered: ${task.objective}`,
          message:
            nextStatus === "awaiting-approval"
              ? `Workflow "${task.workflow}" generated a draft deliverable and is awaiting human review.`
              : `Workflow "${task.workflow}" completed and is ready in AI Assistant.`,
          link: nextStatus === "awaiting-approval" ? "/admin/approvals" : "/admin/ai-assistant",
        },
      });
    }
    console.log(`[ai-worker] Finished ${task.id} -> ${nextStatus}`);
  } catch (err) {
    console.error(`[ai-worker] Failed ${task.id}:`, err);
    await db.aiTask.update({
      where: { id: task.id },
      data: { status: "failed", result: `Worker error: ${(err as Error).message}` },
    });
  }
  return true;
}

async function loop() {
  console.log(`[ai-worker] Started (UnoRouter + Free AI Router Stack). Polling every ${POLL_MS}ms.`);
  while (true) {
    try {
      const processed = await processNext();
      if (!processed) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (e) {
      console.error("[ai-worker] Loop error:", e);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

void loop();
