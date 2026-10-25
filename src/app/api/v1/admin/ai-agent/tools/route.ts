import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { checkAdminRateLimit, ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import {
  buildPollinationsImageUrl,
  cosineSimilarity,
  generateFreeEmbeddings,
  transcribeFreeSpeech,
} from "@/lib/ai/free-router";
import {
  toolAcademicResearchLookup,
  toolGetWeather,
  toolWebInstantSearch,
  toolWikipediaLookup,
} from "@/lib/ai/free-tools";

export const dynamic = "force-dynamic";

const MAX_STT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/v1/admin/ai-agent/tools
 * Multimodal AI Studio endpoint:
 *   - Multipart FormData (audio file) → STT via Groq Whisper / Cloudflare Whisper
 *   - JSON `{ mode: "image", prompt, aspect }` → Pollinations.ai FLUX image generator
 *   - JSON `{ mode: "embeddings", texts, provider? }` → Embeddings + Cosine Similarity matrix
 *   - JSON `{ mode: "tool", tool, query | args }` → Open-Meteo, Wikipedia, OpenAlex, or Web Search
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  const rl = checkAdminRateLimit(`ai-tools:${guard.session.userId}`, 30, 60_000);
  if (!rl.allowed) {
    return fail(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`, ["rate_limited"], 429);
  }

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > MAX_STT_UPLOAD_BYTES + 65_536) {
      return fail("Audio upload exceeds 10 MB limit.", ["payload_too_large"], 413);
    }

    try {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        return fail("Missing audio file in form-data `file` field.");
      }
      if (file.size === 0) {
        return fail("Uploaded audio file is empty.");
      }
      if (file.size > MAX_STT_UPLOAD_BYTES) {
        return fail("Audio upload exceeds 10 MB limit.", ["payload_too_large"], 413);
      }
      const started = Date.now();
      const res = await transcribeFreeSpeech(file, (file as File).name || "recording.webm");
      await writeAudit(guard.session, "free_ai.stt", "FreeAiStudio", undefined, {
        provider: res.providerUsed,
        bytes: file.size,
      });
      return ok({ ...res, latencyMs: Date.now() - started }, "Speech transcribed.");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Speech-to-text failed.", [], 400);
    }
  }

  const body = await readJson<Record<string, unknown>>(req);
  if (!body || typeof body.mode !== "string") {
    return fail("Expected `mode` ('image' | 'embeddings' | 'tool').");
  }

  if (body.mode === "image") {
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return fail("Image prompt is required.");
    const aspect = (["landscape", "square", "portrait"].includes(String(body.aspect))
      ? String(body.aspect)
      : "landscape") as "landscape" | "square" | "portrait";
    const img = buildPollinationsImageUrl(prompt, aspect);
    await writeAudit(guard.session, "free_ai.image_gen", "FreeAiStudio", undefined, {
      aspect,
    });
    return ok(
      {
        provider: "Pollinations.ai FLUX ($0, Zero Key)",
        ...img,
      },
      "Free image URL generated."
    );
  }

  if (body.mode === "embeddings") {
    const rawTexts = Array.isArray(body.texts)
      ? body.texts.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    if (rawTexts.length === 0) {
      return fail("Provide at least 1 text in `texts`.");
    }
    const requestedProvider =
      typeof body.provider === "string" && body.provider.trim()
        ? body.provider.trim()
        : undefined;
    const started = Date.now();
    const emb = await generateFreeEmbeddings(rawTexts.slice(0, 8), requestedProvider);
    const similarities: Array<{ pair: [number, number]; similarity: number }> = [];
    const similarityPairs: Array<{ a: number; b: number; cosine: number }> = [];
    for (let i = 0; i < emb.embeddings.length; i++) {
      for (let j = i + 1; j < emb.embeddings.length; j++) {
        const sim = Number(cosineSimilarity(emb.embeddings[i], emb.embeddings[j]).toFixed(4));
        similarities.push({ pair: [i, j], similarity: sim });
        similarityPairs.push({ a: i, b: j, cosine: sim });
      }
    }
    return ok(
      {
        providerUsed: emb.providerUsed,
        modelUsed: emb.modelUsed,
        dimensions: emb.embeddings[0]?.length || 0,
        count: emb.embeddings.length,
        latencyMs: Date.now() - started,
        vectorPreview: emb.embeddings[0]?.slice(0, 12) || [],
        similarities,
        similarityPairs,
      },
      "Embeddings generated."
    );
  }

  if (body.mode === "tool") {
    const tool = String(body.tool || "");
    const argsObj =
      body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
    const query = String(
      body.query || argsObj.city || argsObj.topic || argsObj.query || ""
    ).trim();
    if (!query) return fail("Tool `query` is required.");

    switch (tool) {
      case "get_weather": {
        const result = await toolGetWeather(query);
        return ok({ result, ...result }, "Weather fetched.");
      }
      case "wikipedia_lookup": {
        const result = await toolWikipediaLookup(query);
        return ok({ result, ...result }, "Wikipedia summary fetched.");
      }
      case "academic_research_lookup": {
        const result = await toolAcademicResearchLookup(query);
        return ok({ result, ...result }, "OpenAlex research fetched.");
      }
      case "web_instant_search": {
        const result = await toolWebInstantSearch(query);
        return ok({ result, ...result }, "Instant search fetched.");
      }
      default:
        return fail(`Unknown research tool: ${tool}`);
    }
  }

  return fail(`Unknown studio mode: ${body.mode}`);
}
