import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const UA = "ALOEduIntelBot/1.0 (+https://alaminn.info; university-info verification check)";

function parseRobotsForPath(robotsTxt: string, path: string): boolean {
  // Minimal but correct robots.txt evaluation for our token:
  // use the most specific matching group (our UA or *), last group wins per spec.
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.allow.length || current.disallow.length) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
    } else if (current && (key === "allow" || key === "disallow")) {
      if (val) current[key].push(val);
    }
  }
  const matching = groups.filter((g) => g.agents.includes("aloeduintelbot") || g.agents.includes("*"));
  const group = matching.find((g) => g.agents.includes("aloeduintelbot")) ?? matching[matching.length - 1];
  if (!group) return true;
  const matchLen = (rule: string, p: string): number | null => {
    // supports '*' wildcard and '$' terminator minimally
    const hasEnd = rule.endsWith("$");
    let pattern = hasEnd ? rule.slice(0, -1) : rule;
    pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp("^" + pattern + (hasEnd ? "$" : ""));
    return re.test(p) ? pattern.length : null;
  };
  const pathRules: { len: number; allow: boolean }[] = [];
  for (const a of group.allow) {
    const len = matchLen(a, path);
    if (len !== null) pathRules.push({ len, allow: true });
  }
  for (const d of group.disallow) {
    const len = matchLen(d, path);
    if (len !== null) pathRules.push({ len, allow: false });
  }
  if (!pathRules.length) return true;
  pathRules.sort((x, y) => y.len - x.len);
  return pathRules[0].allow;
}

async function runJob(jobId: string, targetUrl: string, sourceKey: string) {
  const started = new Date();
  await db.uciCollectionJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: started, attempts: { increment: 1 } } });
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
  } catch (e) {
    await db.uciCollectionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), lastError: `Invalid target URL: ${(e as Error).message}` },
    });
    return;
  }

  // 1) robots.txt gate — never fetch the target when disallowed
  let robotsAllowed: boolean | null = null;
  try {
    const robotsRes = await fetch(`${parsed.origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (robotsRes.ok) {
      const txt = await robotsRes.text();
      robotsAllowed = parseRobotsForPath(txt, parsed.pathname + (parsed.search ?? ""));
    } else {
      robotsAllowed = true; // no robots.txt => allowed by convention
    }
  } catch {
    robotsAllowed = null; // unreachable network — record as unknown, do not guess
  }

  if (robotsAllowed === false) {
    await db.uciCollectionJob.update({
      where: { id: jobId },
      data: { status: "ROBOTS_BLOCKED", finishedAt: new Date(), findings: "robots.txt disallows this path for our token — target NOT fetched.", lastError: null },
    });
    await db.uciSource.update({ where: { key: sourceKey }, data: { robotsAllowed: false, lastCheckedAt: new Date() } }).catch(() => {});
    return;
  }

  // 2) real fetch of the target page
  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    const body = await res.text();
    const hash = createHash("sha256").update(body).digest("hex");
    const bytes = Buffer.byteLength(body, "utf8");

    // change detection against previous successful job for the same URL
    const previous = await db.uciCollectionJob.findFirst({
      where: { targetUrl, status: "SUCCESS", id: { not: jobId } },
      orderBy: { finishedAt: "desc" },
    });
    const findings = previous
      ? previous.contentHash === hash
        ? "UNCHANGED — content hash matches the previous check."
        : "CHANGED — content differs from the previous check; review required."
      : "FIRST_CHECK — baseline hash recorded.";

    await db.uciCollectionJob.update({
      where: { id: jobId },
      data: { status: "SUCCESS", httpStatus: res.status, contentHash: hash, bytes, findings, finishedAt: new Date(), lastError: null },
    });
    await db.uciSource.update({
      where: { key: sourceKey },
      data: { robotsAllowed, lastCheckedAt: new Date() },
    }).catch(() => {});
    // refresh lastCheckedAt on requirement records that reference this URL
    const records = await db.uciRequirementRecord.findMany({ where: { sourceUrl: { contains: parsed.hostname } }, select: { id: true } });
    for (const r of records) {
      await db.uciRequirementRecord.update({ where: { id: r.id }, data: { lastCheckedAt: new Date() } });
    }
  } catch (e) {
    await db.uciCollectionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), lastError: `Fetch failed: ${(e as Error).message}` },
    });
    if (robotsAllowed !== null) {
      await db.uciSource.update({ where: { key: sourceKey }, data: { robotsAllowed, lastCheckedAt: new Date() } }).catch(() => {});
    }
  }
}

/** GET /api/uci/jobs — list collection jobs with their real outcomes. */
export async function GET() {
  const jobs = await db.uciCollectionJob.findMany({ orderBy: { scheduledAt: "desc" }, take: 100 });
  return NextResponse.json({ jobs });
}

/**
 * POST /api/uci/jobs — create and immediately run a real source check.
 * RBAC: uci.edit (ADMIN, EDITOR) — anonymous visitors cannot trigger fetches.
 * Body: { targetUrl, sourceKey, type? }
 * MARGE (or any PENDING_IDENTITY source) is refused until its identity is confirmed.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "uci.edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { targetUrl?: string; sourceKey?: string; type?: string }
    | null;
  if (!body?.targetUrl || !body?.sourceKey) {
    return NextResponse.json({ error: "targetUrl and sourceKey are required" }, { status: 400 });
  }
  const source = await db.uciSource.findUnique({ where: { key: body.sourceKey } });
  if (!source) return NextResponse.json({ error: "unknown sourceKey" }, { status: 404 });
  if (source.identityStatus === "PENDING_IDENTITY") {
    return NextResponse.json(
      { error: `Source "${source.name}" has PENDING_IDENTITY status — confirm its exact URL and permission before scheduling collection.` },
      { status: 422 },
    );
  }
  if (!source.url && !body.targetUrl.startsWith("http")) {
    return NextResponse.json({ error: "Source has no confirmed URL" }, { status: 422 });
  }

  const job = await db.uciCollectionJob.create({
    data: {
      sourceKey: body.sourceKey,
      targetUrl: body.targetUrl,
      type: body.type === "DISCOVERY" ? "DISCOVERY" : "SOURCE_CHECK",
      status: "PENDING",
    },
  });
  await db.uciAuditLog.create({
    data: {
      actor: session.email,
      action: "JOB_CREATE",
      entity: "UciCollectionJob",
      entityId: job.id,
      detail: JSON.stringify({ targetUrl: body.targetUrl, sourceKey: body.sourceKey }),
    },
  });
  // run synchronously (bounded timeouts inside); the UI gets the real result
  await runJob(job.id, body.targetUrl, body.sourceKey);
  const final = await db.uciCollectionJob.findUnique({ where: { id: job.id } });
  return NextResponse.json({ job: final });
}
