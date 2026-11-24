/**
 * POST /api/v1/higher-study/ai-services
 *
 * Public Higher Study AI Services. Generates a draft through the existing
 * free-first AI router. Anonymous users can generate but do not get storage;
 * authenticated users may save private, revisioned documents.
 *
 * GET /api/v1/higher-study/ai-services returns the service catalogue.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runFreeAiRouter } from "@/lib/ai/free-router";
import {
  AI_SERVICES,
  buildServicePrompt,
  getServiceById,
  parseServiceInputs,
} from "@/lib/higher-study/ai-services";
import {
  AI_SERVICE_DOCUMENT_KIND,
  decodeMetadata,
  encodeDocumentContent,
  encodeMetadata,
} from "@/lib/higher-study/ai-services-documents";
import { clientKey, createRateLimiter } from "@/lib/higher-study/ai-services-rate-limit";

export const dynamic = "force-dynamic";

const rateLimiter = createRateLimiter(8, 60_000);

const RequestSchema = z.object({
  serviceId: z.string().min(1).max(80),
  language: z.enum(["en", "bn"]).default("en"),
  inputs: z.record(z.string(), z.string()),
  save: z.boolean().default(false),
  revisionOf: z.string().max(64).optional(),
});

function ok(data: unknown, message = "OK", status = 200) {
  return NextResponse.json({ success: true, message, data, meta: {}, errors: [] }, { status });
}

function fail(message: string, errors: string[], status: number) {
  return NextResponse.json(
    { success: false, message, data: null, meta: {}, errors },
    { status }
  );
}

function requestKey(req: NextRequest, userId: string | null): string {
  if (userId) return clientKey(`user:${userId}`);
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return clientKey(`ip:${forwarded || req.headers.get("x-real-ip") || "unknown"}`);
}

export async function GET() {
  return ok({
    services: AI_SERVICES.map((service) => ({
      id: service.id,
      titleEn: service.titleEn,
      titleBn: service.titleBn,
      descriptionEn: service.descriptionEn,
      descriptionBn: service.descriptionBn,
      category: service.category,
      fields: service.fields,
    })),
    categories: Array.from(new Set(AI_SERVICES.map((s) => s.category))),
    storage: "Sign in to save private drafts and revision history.",
  });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("Invalid JSON body.", ["invalid_json"], 400);
  }

  const body = RequestSchema.safeParse(raw);
  if (!body.success) {
    return fail("Invalid request.", ["invalid_request"], 400);
  }

  const service = getServiceById(body.data.serviceId);
  if (!service) return fail("Unknown AI service.", ["service_not_found"], 404);

  const parsedInputs = parseServiceInputs(service, body.data.inputs);
  if (!parsedInputs.ok || !parsedInputs.inputs) {
    return fail(parsedInputs.error ?? "Invalid inputs.", ["invalid_inputs"], 400);
  }

  const auth = await requireAuth(req);
  const userId = auth.user?.userId ?? null;
  const limit = rateLimiter.check(requestKey(req, userId));
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many requests. Please try again in a minute.",
        data: null,
        meta: { retryAfterSeconds: Math.ceil((limit.resetAt - Date.now()) / 1000) },
        errors: ["rate_limited"],
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  if ((body.data.save || body.data.revisionOf) && !userId) {
    return fail("Sign in to save documents or create revisions.", ["authentication_required"], 401);
  }

  let parent: { id: string; metadata: string | null } | null = null;
  if (body.data.revisionOf) {
    parent = await db.kitDocument.findFirst({
      where: {
        id: body.data.revisionOf,
        kind: AI_SERVICE_DOCUMENT_KIND,
        createdById: userId,
      },
      select: { id: true, metadata: true },
    });
    if (!parent) return fail("Source document not found.", ["document_not_found"], 404);
  }

  const { systemPrompt, userPrompt } = buildServicePrompt(
    service,
    parsedInputs.inputs,
    body.data.language
  );

  let completion;
  try {
    completion = await runFreeAiRouter({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.35,
      maxTokens: 1600,
      bypassCache: true,
      cacheScope: {
        userId: userId ?? "anonymous",
        agentId: `higher-study-${service.id}`,
        extraKey: body.data.language,
      },
    });
  } catch {
    return fail(
      "AI generation is temporarily unavailable. No provider responded; please try again later.",
      ["provider_unavailable"],
      503
    );
  }

  const output = completion.content?.trim();
  if (!output) {
    return fail("The AI provider returned an empty response.", ["empty_output"], 502);
  }

  const generatedAt = new Date().toISOString();
  let documentId: string | null = null;
  let revision = 1;
  let rootId = parent?.id ?? "";

  if (body.data.save && userId) {
    const parentMeta = parent ? decodeMetadata(parent.metadata) : null;
    rootId = parentMeta?.rootId || parent?.id || "";
    revision = parentMeta ? parentMeta.revision + 1 : 1;
    const created = await db.kitDocument.create({
      data: {
        kind: AI_SERVICE_DOCUMENT_KIND,
        title: `${service.titleEn} — ${generatedAt.slice(0, 10)}`,
        content: encodeDocumentContent({
          output,
          inputs: parsedInputs.inputs,
          language: body.data.language,
          serviceId: service.id,
          provider: completion.providerName,
          model: completion.modelUsed,
          generatedAt,
        }),
        metadata: encodeMetadata({
          serviceId: service.id,
          language: body.data.language,
          revision,
          rootId,
        }),
        createdById: userId,
      },
      select: { id: true },
    });
    documentId = created.id;
    if (!rootId) rootId = created.id;
  }

  return ok(
    {
      serviceId: service.id,
      output,
      language: body.data.language,
      provider: completion.providerName,
      model: completion.modelUsed,
      cached: completion.cached,
      documentId,
      rootId: rootId || null,
      revision,
      saved: Boolean(documentId),
      privacyNotice:
        "AI output is a draft. Review it for accuracy and authenticity before submitting. Saved drafts are visible only to your account.",
    },
    "Draft generated."
  );
}
