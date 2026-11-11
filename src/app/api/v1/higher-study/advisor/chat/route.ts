/**
 * POST /api/v1/higher-study/advisor/chat
 * ======================================
 * Public AI advisor for the Higher Study platform. Answers visitor
 * questions about universities, courses, scholarships and research
 * opportunities using a *grounded* prompt — the model is given context
 * retrieved from the verified + published rows of the Higher Study
 * catalogue so it does not have to rely on training-data recall.
 *
 * Hard rules enforced by the system prompt + this route:
 *  - **No fabrication.** If the catalogue has no record, the assistant
 *    says so and points the visitor to the official source.
 *  - **Cite sources.** Every concrete claim must reference a
 *    `groundingRecords` entry (university/course/scholarship slug +
 *    officialSourceUrl).
 *  - **Distinguish verified vs pending.** Pending-review rows are
 *    surfaced only with an explicit "verify on official site" caveat.
 *  - **No admission / scholarship / CAS / visa guarantee.** The
 *    disclaimer is appended to every reply.
 *
 * Rate-limited: 10 messages / minute / IP (in-memory Map — adequate
 * for the public advisor; the WhatsApp webhook uses a separate,
 * stricter limiter).
 *
 * Spec reference: docs/higher-study/architecture-and-platform-ownership.md
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonResponse } from "@/lib/higher-study/api-helpers";
import { runFreeAiRouter } from "@/lib/ai/free-router";

export const dynamic = "force-dynamic";

// ─── Rate limiter (in-memory, per IP) ────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 messages per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return {
      ok: true,
      remaining: RATE_LIMIT_MAX - 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }
  return {
    ok: true,
    remaining: RATE_LIMIT_MAX - entry.count,
    resetAt: entry.resetAt,
  };
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// ─── Request schema ──────────────────────────────────────────────────

const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(ChatTurnSchema).max(8).default([]),
});

type ChatTurn = { role: "user" | "assistant"; content: string };

// ─── Grounding ───────────────────────────────────────────────────────

/**
 * A single grounding record handed to the model. Each entry is a
 * verified + published row from the Higher Study catalogue.
 */
interface GroundingRecord {
  kind: "university" | "course" | "scholarship";
  slug: string;
  title: string;
  universityName?: string | null;
  verificationStatus: string;
  officialSourceUrl: string | null;
  /** Short text snippet used for grounding (overview / eligibility). */
  snippet: string;
}

/**
 * Retrieve up to N verified + published Higher Study rows whose text
 * fields contain the query terms. SQLite-backed, so we use plain
 * `contains` (case-insensitive for ASCII) — NOT `mode: "insensitive"`
 * (that is a Postgres-only Prisma feature).
 *
 * Searches across universities, courses (with their parent university),
 * and scholarships in parallel and merges the results.
 */
async function retrieveGroundingContext(
  query: string,
  limitPerKind = 4,
): Promise<GroundingRecord[]> {
  const q = query.trim();
  if (!q) return [];

  // Build a simple OR-contains filter across the most-likely fields.
  // SQLite `contains` is case-insensitive for ASCII characters by
  // default; no `mode` flag is required (and none is supported).
  const universityWhere = {
    verificationStatus: "verified",
    publicationStatus: "published",
    OR: [
      { officialName: { contains: q } },
      { overview: { contains: q } },
      { researchStrengths: { contains: q } },
    ],
  };
  const courseWhere = {
    verificationStatus: "verified",
    publicationStatus: "published",
    OR: [
      { title: { contains: q } },
      { overview: { contains: q } },
      { specialisation: { contains: q } },
    ],
  };
  const scholarshipWhere = {
    verificationStatus: "verified",
    publicationStatus: "published",
    OR: [
      { name: { contains: q } },
      { eligibilityCriteria: { contains: q } },
      { provider: { contains: q } },
    ],
  };

  const [universities, courses, scholarships] = await Promise.all([
    db.higherStudyUniversity.findMany({
      where: universityWhere,
      take: limitPerKind,
      select: {
        slug: true,
        officialName: true,
        overview: true,
        verificationStatus: true,
        officialSourceUrl: true,
      },
    }),
    db.higherStudyCourse.findMany({
      where: courseWhere,
      take: limitPerKind,
      include: {
        university: {
          select: { officialName: true, slug: true },
        },
      },
    }),
    db.higherStudyScholarship.findMany({
      where: scholarshipWhere,
      take: limitPerKind,
      include: {
        university: {
          select: { officialName: true, slug: true },
        },
      },
    }),
  ]);

  const records: GroundingRecord[] = [];

  for (const u of universities) {
    records.push({
      kind: "university",
      slug: u.slug,
      title: u.officialName,
      universityName: u.officialName,
      verificationStatus: u.verificationStatus,
      officialSourceUrl: u.officialSourceUrl,
      snippet: (u.overview || "").slice(0, 320),
    });
  }

  for (const c of courses) {
    records.push({
      kind: "course",
      slug: c.slug,
      title: c.title,
      universityName: c.university?.officialName ?? null,
      verificationStatus: c.verificationStatus,
      officialSourceUrl: c.officialSourceUrl,
      snippet: (c.overview || "").slice(0, 320),
    });
  }

  for (const s of scholarships) {
    records.push({
      kind: "scholarship",
      slug: s.slug,
      title: s.name,
      universityName: s.university?.officialName ?? null,
      verificationStatus: s.verificationStatus,
      officialSourceUrl: s.officialSourceUrl,
      snippet: (s.eligibilityCriteria || "").slice(0, 320),
    });
  }

  return records;
}

/**
 * Render the grounding records as a compact text block for inclusion in
 * the system prompt. Each record is labelled with its kind, slug,
 * verification status and official source URL so the model can cite it.
 */
function buildGroundedContext(records: GroundingRecord[]): string {
  if (records.length === 0) {
    return "GROUNDING: No matching verified records were found in the catalogue. " +
      "Tell the visitor you could not find a verified match and suggest they " +
      "consult the official university or scholarship website directly.";
  }
  const lines = records.map((r, i) => {
    const cite = `[${i + 1}] kind=${r.kind} slug=${r.slug} ` +
      `title="${r.title}"` +
      (r.universityName ? ` university="${r.universityName}"` : "") +
      ` verificationStatus=${r.verificationStatus}` +
      ` source=${r.officialSourceUrl || "(none)"}` +
      ` snippet="${r.snippet.replace(/\s+/g, " ").trim()}"`;
    return cite;
  });
  return "GROUNDING RECORDS (cite by [n] in your reply):\n" + lines.join("\n");
}

// ─── System prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Alaminn.info Higher Study AI advisor. Your job is to help prospective students understand their options for studying abroad — universities, courses, scholarships, and PhD/research opportunities.

HARD RULES:
1. NEVER fabricate. Only use facts from the GROUNDING RECORDS provided in this prompt. If the grounding does not cover the question, say so explicitly: "I could not find a verified record for that — please confirm on the official website."
2. CITE sources. After any concrete claim about a university, course, or scholarship, append the citation index in square brackets, e.g. "...offers an MSc Data Science [2]."
3. DISTINGUISH verified vs pending. Records with verificationStatus="verified" may be stated as fact. Records with any other status MUST be qualified with "(unverified — confirm on official site)".
4. NO admission, scholarship, CAS, or visa guarantee. Append this disclaimer to every reply: "This information is NOT an admission, scholarship, CAS, or visa guarantee. Final decisions rest with the admitting institution and visa authority."
5. If asked for opinions, rankings, or predictions, decline politely and redirect to official sources.
6. Keep replies under 250 words. Be specific and useful, not generic.
7. Never invent URLs. Only cite the source URL attached to a grounding record.`;

// ─── POST handler ────────────────────────────────────────────────────

interface AdvisorChatResponse {
  reply: string;
  providerUsed: string;
  modelUsed: string;
  cached: boolean;
  latencyMs: number;
  groundingRecords: Array<{
    kind: GroundingRecord["kind"];
    slug: string;
    title: string;
    verificationStatus: string;
    officialSourceUrl: string | null;
  }>;
  citations: string[];
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // 1. Rate limit.
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return jsonResponse(
      false,
      "Rate limit exceeded. Please try again shortly.",
      null,
      { retryAfterSeconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      ["rate_limited"],
      429,
    );
  }

  // 2. Parse + validate.
  let parsed: z.infer<typeof ChatRequestSchema>;
  try {
    const body = await req.json();
    parsed = ChatRequestSchema.parse(body);
  } catch (e) {
    const issues = e instanceof z.ZodError ? e.issues.map((i) => i.message) : ["invalid_json"];
    return jsonResponse(
      false,
      "Invalid request body.",
      null,
      {},
      issues,
      400,
    );
  }

  const message = parsed.message.trim();
  const history: ChatTurn[] = parsed.history.slice(-8);

  // 3. Retrieve grounding context from the verified catalogue.
  let groundingRecords: GroundingRecord[] = [];
  try {
    groundingRecords = await retrieveGroundingContext(message);
  } catch {
    // Grounding failure is non-fatal — the model is told there are no records.
    groundingRecords = [];
  }

  const groundedContext = buildGroundedContext(groundingRecords);
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${groundedContext}`;

  // 4. Run the free AI router.
  let routerResult;
  try {
    routerResult = await runFreeAiRouter({
      systemPrompt: fullSystemPrompt,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: message },
      ],
      tier: "auto",
      temperature: 0.3,
      maxTokens: 600,
    });
  } catch (e) {
    // Audit the failure (best-effort).
    try {
      await db.auditLog.create({
        data: {
          actorId: "system",
          action: "higher_study_advisor_error",
          resource: "HigherStudyAdvisor",
          resourceId: null,
          meta: JSON.stringify({
            ip,
            messageLen: message.length,
            error: (e as Error).message,
          }),
        },
      });
    } catch {
      // audit write failure is non-fatal
    }
    return jsonResponse(
      false,
      "The advisor is temporarily unavailable. Please try again shortly.",
      null,
      {},
      ["advisor_unavailable"],
      500,
    );
  }

  const latencyMs = Date.now() - startedAt;

  // Extract citation indices from the reply (e.g. "[1]", "[2]").
  const citationMatches = routerResult.content.matchAll(/\[(\d+)\]/g);
  const citations: string[] = [];
  for (const m of citationMatches) {
    const idx = Number.parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < groundingRecords.length) {
      const r = groundingRecords[idx];
      const cite = `${r.kind}:${r.slug}` + (r.officialSourceUrl ? ` ${r.officialSourceUrl}` : "");
      if (!citations.includes(cite)) citations.push(cite);
    }
  }

  const payload: AdvisorChatResponse = {
    reply: routerResult.content,
    providerUsed: routerResult.providerUsed,
    modelUsed: routerResult.modelUsed,
    cached: routerResult.cached,
    latencyMs,
    groundingRecords: groundingRecords.map((r) => ({
      kind: r.kind,
      slug: r.slug,
      title: r.title,
      verificationStatus: r.verificationStatus,
      officialSourceUrl: r.officialSourceUrl,
    })),
    citations,
  };

  // 5. Audit log (best-effort, never blocks the response).
  try {
    await db.auditLog.create({
      data: {
        actorId: "system",
        action: "higher_study_advisor_chat",
        resource: "HigherStudyAdvisor",
        resourceId: null,
        meta: JSON.stringify({
          ip,
          messageLen: message.length,
          provider: routerResult.providerUsed,
          model: routerResult.modelUsed,
          cached: routerResult.cached,
          latencyMs,
          groundingCount: groundingRecords.length,
          citationsCount: citations.length,
        }),
      },
    });
  } catch {
    // non-fatal
  }

  return jsonResponse(true, "OK", payload, {
    rateLimitRemaining: rl.remaining,
    rateLimitResetAt: new Date(rl.resetAt).toISOString(),
  });
}

// ─── GET health check ────────────────────────────────────────────────

export async function GET() {
  return jsonResponse(
    true,
    "Higher Study AI advisor endpoint is active.",
    {
      endpoint: "/api/v1/higher-study/advisor/chat",
      methods: ["POST"],
      rateLimit: `${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW_MS / 1000}s per IP`,
    },
  );
}
