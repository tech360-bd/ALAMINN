/**
 * POST /api/v1/higher-study/proposal
 * ====================================
 * Public endpoint that accepts a research-proposal draft assembled by
 * the Proposal Builder (/higher-study/proposal-builder) and queues it
 * as an AiTask for AI-assisted drafting. The worker
 * (scripts/agentos-worker.ts) picks the task up — this route does not
 * invoke the AI router directly.
 *
 * - Inline rate limiter: 5 submissions per minute per IP.
 * - Zod validation: { message: ≤2000 chars, history?: turns[] }.
 * - Creates AiTask { workflow: "research-proposal-draft",
 *    status: "queued", approvalRequired: true,
 *    sensitivity: "confidential" }.
 * - Requester is a system user (system@alaminn.info) or, if not found,
 *   the first user in the DB (AiTask.requesterId is a required FK).
 * - Audit-logs the submission.
 *
 * Spec: docs/higher-study/proposal-builder.md
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────
function ok(data: unknown, message = "OK", meta: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, message, data, meta, errors: [] });
}
function fail(message: string, errors: unknown[] = [], status = 400) {
  return NextResponse.json({ success: false, message, data: null, meta: {}, errors }, { status });
}

// ─── Inline rate limiter (5 / min / IP) ───────────────────────────
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const rateMap = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.reset) {
    rateMap.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function ipHash(req: NextRequest): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// ─── Request schema ───────────────────────────────────────────────
const ProposalHistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const ProposalRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(ProposalHistoryTurnSchema).max(8).optional(),
});

// ─── System user lookup ───────────────────────────────────────────
async function resolveRequesterId(): Promise<string | null> {
  const SYSTEM_EMAIL = "system@alaminn.info";
  try {
    const sys = await db.user.findUnique({ where: { email: SYSTEM_EMAIL } });
    if (sys) return sys.id;
  } catch {
    // fall through to first-user lookup
  }
  try {
    const first = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (first) return first.id;
  } catch {
    // DB unreachable
  }
  return null;
}

// ─── POST handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const hash = ipHash(req);
    if (rateLimited(hash)) {
      return fail("Too many submissions. Please try again shortly.", ["rate_limited"], 429);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return fail("Invalid request body.");

    const parsed = ProposalRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("Validation failed.", parsed.error.issues.map((i) => i.message));
    }

    const { message, history } = parsed.data;

    const requesterId = await resolveRequesterId();
    if (!requesterId) {
      return fail("No system user available to file the task.", ["no_requester"], 500);
    }

    const historyBlock = (history && history.length)
      ? history.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n") + "\n\n"
      : "";
    const prompt =
      `${historyBlock}PROPOSAL DRAFT (sections split by ---):\n${message}\n\n` +
      `TASK: Restructure this research-proposal draft into a coherent academic proposal ` +
      `(background, gap, objectives, methodology, data, ethics, timeline, refs). Do not ` +
      `invent citations or results. Flag unverifiable claims. Suggest 3–5 concrete revisions.`;

    const task = await db.aiTask.create({
      data: {
        requesterId,
        workflow: "research-proposal-draft",
        objective: "Draft a research proposal from user-supplied sections.",
        prompt,
        sensitivity: "confidential",
        outputFormat: "markdown",
        approvalRequired: true,
        status: "queued",
      } as never,
    });

    try {
      await db.auditLog.create({
        data: {
          actorId: requesterId,
          action: "proposal.submitted",
          resource: "ai-task",
          resourceId: task.id,
          meta: JSON.stringify({
            workflow: "research-proposal-draft",
            ipHash: hash,
            historyTurns: history?.length || 0,
          }),
          ipHash: hash,
        } as never,
      });
    } catch {
      // non-fatal
    }

    return ok(
      { taskId: task.id },
      "Research proposal draft queued for AI drafting.",
      { workflow: "research-proposal-draft" },
    );
  } catch (e) {
    console.error("[higher-study/proposal] error", e);
    return fail("Internal error.", ["server_error"], 500);
  }
}
