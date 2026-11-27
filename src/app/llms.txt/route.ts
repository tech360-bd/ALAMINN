import { generateLlmsTxt } from "@/lib/aeo/llms-txt";

export const dynamic = "force-dynamic";

/**
 * GET /llms.txt — LLM/answer-engine content index in the llmstxt.org
 * format, generated live from the database catalog. Never cached for
 * longer than an hour so answer engines see fresh counts.
 */
export async function GET() {
  try {
    const { body } = await generateLlmsTxt();
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    // DB unavailable — serve a minimal honest header instead of erroring.
    return new Response(
      "# ALAMINN\n\n> Study-abroad discovery and executive consulting platform. The catalog is temporarily unavailable; retry later.\n",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" } }
    );
  }
}
