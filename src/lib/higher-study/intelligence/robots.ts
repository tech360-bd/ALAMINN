/**
 * robots.txt awareness for the intelligence collector (module spec §2, §5:
 * collect only information that is publicly accessible AND permitted by
 * each source's terms; never bypass robots.txt or access restrictions).
 *
 * Implements the subset of the robots exclusion protocol needed for
 * gate-keeping a fetch: User-agent groups, Disallow, Allow (longest-match
 * wins), and Crawl-delay. When robots.txt cannot be fetched, the caller
 * treats the source as UNKNOWN and skips the fetch (conservative default).
 */

const USER_AGENT = "ALO-Education-Intelligence/1.0 (+https://alaminn.info; contact: hello@alaminn.info)";
export const INTELLIGENCE_USER_AGENT = USER_AGENT;

export interface RobotsDecision {
  allowed: boolean;
  /** known = robots.txt consulted; unknown = robots unreachable → conservative skip */
  certainty: "known" | "unknown";
  crawlDelayMs: number;
  robotsUrl: string;
}

interface RobotsRule {
  path: string;
  allow: boolean;
}

const MAX_ROBOTS_BYTES = 256 * 1024;
const ROBOTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const cache = new Map<string, { at: number; rules: RobotsRule[] | null; delayMs: number }>();

const AGENT_TOKEN = "alo-education-intelligence";

export function parseRobots(text: string): { rules: RobotsRule[]; delayMs: number } {
  // Two passes, per the robots exclusion protocol: a crawler uses the
  // single most specific matching agent group — an exact group replaces
  // the `*` group entirely rather than merging with it.
  interface Group {
    agents: string[];
    rules: RobotsRule[];
    delayMs: number;
  }
  const groups: Group[] = [];
  let current: Group | null = null;
  let currentHasRules = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      // Consecutive User-agent lines share one group; a User-agent after
      // rules starts a new group.
      if (!current || currentHasRules) {
        current = { agents: [], rules: [], delayMs: 0 };
        groups.push(current);
        currentHasRules = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) {
      // Rules before any agent line apply to nobody per the protocol.
      continue;
    }
    if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delayMs = Math.min(seconds, 60) * 1000;
      continue;
    }
    if (field === "disallow" || field === "allow") {
      if (value) {
        current.rules.push({ path: value, allow: field === "allow" });
        currentHasRules = true;
      }
    }
  }
  const exact = groups.find((g) => g.agents.includes(AGENT_TOKEN));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const group = exact ?? wildcard;
  return { rules: group?.rules ?? [], delayMs: group?.delayMs ?? 0 };
}

/** Longest-match decision, per the robots exclusion protocol. */
export function decideByRules(
  path: string,
  rules: readonly RobotsRule[]
): { allowed: boolean; matched: boolean } {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (path.startsWith(rule.path) && (!best || rule.path.length > best.path.length)) best = rule;
  }
  if (!best) return { allowed: true, matched: false }; // no matching rule → allowed
  return { allowed: best.allow, matched: true };
}

export async function fetchRobots(
  origin: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ rules: RobotsRule[] | null; delayMs: number }> {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.at < ROBOTS_CACHE_TTL_MS) {
    return { rules: cached.rules, delayMs: cached.delayMs };
  }
  const robotsUrl = new URL("/robots.txt", origin).toString();
  let rules: RobotsRule[] | null = null;
  let delayMs = 0;
  try {
    const res = await fetchImpl(robotsUrl, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (res.ok) {
      const text = (await res.text()).slice(0, MAX_ROBOTS_BYTES);
      const parsed = parseRobots(text);
      rules = parsed.rules;
      delayMs = parsed.delayMs;
    } else if (res.status === 404 || res.status === 410) {
      rules = []; // no robots.txt → crawling permitted, still politely
    }
    // other statuses (5xx, 403): unknown → keep rules null (conservative)
  } catch {
    rules = null; // unreachable → unknown
  }
  cache.set(origin, { at: Date.now(), rules, delayMs });
  return { rules, delayMs };
}

/**
 * Decide whether the collector may fetch a URL. Never bypasses a
 * restriction: explicit deny, or an unreachable robots.txt, both result in
 * allowed=false (the job is recorded as skipped-permissions).
 */
export async function canFetch(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<RobotsDecision> {
  let origin: string;
  let path: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    path = parsed.pathname + (parsed.search || "");
  } catch {
    return { allowed: false, certainty: "unknown", crawlDelayMs: 0, robotsUrl: "" };
  }
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const { rules, delayMs } = await fetchRobots(origin, fetchImpl);
  if (rules === null) {
    return { allowed: false, certainty: "unknown", crawlDelayMs: delayMs, robotsUrl };
  }
  const { allowed } = decideByRules(path, rules);
  return { allowed, certainty: "known", crawlDelayMs: delayMs, robotsUrl };
}

/** Test hook: clear the robots cache. */
export function clearRobotsCache(): void {
  cache.clear();
}
