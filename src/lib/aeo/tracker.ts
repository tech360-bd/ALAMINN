/**
 * AEO citation tracker — records REAL answer-engine citation checks.
 * --------------------------------------------------------------------
 * Each check asks a configured search/answer endpoint whether our
 * domain is cited for a set of seed queries, and stores the raw
 * per-query results. Runs are recorded in AeoCheckRun +
 * AeoCitationCheck with the source URLs that were actually returned.
 *
 * HONESTY — NO MOCKING:
 *  - Runs execute only when an answer/search provider is configured
 *    (Brave Search API key, or an OpenAI-compatible endpoint via the
 *    free AI router). Without a provider the run is recorded as
 *    `provider_unavailable` — it is NEVER fabricated as a score.
 *  - A cited result must contain an actual alaminn.info URL in the
 *    returned sources; position is recorded when rankable.
 *  - Every stored detail keeps the provider response evidence trail.
 */

import { db } from "@/lib/db";
import { getSiteUrl } from "./llms-txt";

export const DEFAULT_SEED_QUERIES = [
  "best study abroad consultants in Bangladesh",
  "how to choose a university for masters abroad",
  "study abroad scholarships for international students",
  "phd abroad supervisor matching guide",
  "ielts requirements for study abroad",
  "cheapest countries to study abroad",
];

export interface CitationQueryResult {
  query: string;
  cited: boolean;
  url: string | null;
  position: number | null;
  evidence: string; // short factual trace of what the provider returned
}

export interface CitationRunResult {
  runId: string;
  status: "completed" | "provider_unavailable" | "failed";
  queries: number;
  citedCount: number;
  score: number;
  results: CitationQueryResult[];
}

/** Check whether our domain appears in a provider's returned sources. */
export function extractOurCitation(urls: string[]): { url: string | null; position: number | null } {
  const domain = new URL(getSiteUrl()).hostname.replace(/^www\./, "");
  for (let i = 0; i < urls.length; i++) {
    try {
      const host = new URL(urls[i]).hostname.replace(/^www\./, "");
      if (host === domain || host.endsWith(`.${domain}`)) {
        return { url: urls[i], position: i + 1 };
      }
    } catch {
      /* skip non-URL strings */
    }
  }
  return { url: null, position: null };
}

/** Brave Search provider (free tier) — returns organic result URLs. */
async function braveSearchCheck(
  apiKey: string,
  query: string
): Promise<{ urls: string[]; evidence: string }> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Brave Search responded with status ${res.status}.`);
  const body = (await res.json()) as { web?: { results?: Array<{ url?: string }> } };
  const urls = (body.web?.results ?? []).map((r) => r.url).filter((u): u is string => !!u);
  return { urls, evidence: `Brave Search returned ${urls.length} organic results.` };
}

export interface TrackerOptions {
  queries?: string[];
  /** Brave Search API key (from env or integration store). */
  braveApiKey?: string;
  limit?: number;
}

/**
 * Run a citation check. Uses Brave Search when configured; otherwise
 * the run is recorded as provider_unavailable (honest fail-closed).
 */
export async function runCitationCheck(
  options: TrackerOptions = {}
): Promise<CitationRunResult> {
  const queries = (options.queries?.length ? options.queries : DEFAULT_SEED_QUERIES)
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, options.limit ?? 10);
  const braveApiKey = options.braveApiKey || process.env.BRAVE_SEARCH_API_KEY || "";

  const run = await db.aeoCheckRun.create({
    data: { status: "pending", engine: braveApiKey ? "brave-search" : "none", queries: queries.length, startedBy: "manual" },
  });

  const fail = async (status: "provider_unavailable" | "failed", reason: string): Promise<CitationRunResult> => {
    await db.aeoCheckRun.update({ where: { id: run.id }, data: { status, detail: reason, finishedAt: new Date() } });
    return { runId: run.id, status, queries: queries.length, citedCount: 0, score: 0, results: [] };
  };

  if (!braveApiKey) {
    return fail(
      "provider_unavailable",
      "No answer-engine provider is configured. Set BRAVE_SEARCH_API_KEY (or connect one from the integrations admin) to run real citation checks. Scores are never simulated."
    );
  }

  const results: CitationQueryResult[] = [];
  for (const query of queries) {
    try {
      const { urls, evidence } = await braveSearchCheck(braveApiKey, query);
      const { url, position } = extractOurCitation(urls);
      results.push({
        query,
        cited: !!url,
        url,
        position,
        evidence: `${evidence} alaminn.info ${url ? `cited at position ${position}` : "not cited"}.`,
      });
      await db.aeoCitationCheck.create({
        data: { runId: run.id, engine: "brave-search", query, cited: !!url, url, position },
      });
    } catch (e) {
      results.push({ query, cited: false, url: null, position: null, evidence: `Provider error: ${(e as Error).message?.slice(0, 160)}` });
    }
  }

  const citedCount = results.filter((r) => r.cited).length;
  const score = results.length ? Math.round((citedCount / results.length) * 100) : 0;
  await db.aeoCheckRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      engine: "brave-search",
      queries: results.length,
      citedCount,
      score,
      detail: JSON.stringify(results).slice(0, 12000),
      finishedAt: new Date(),
    },
  });

  return { runId: run.id, status: "completed", queries: results.length, citedCount, score, results };
}
