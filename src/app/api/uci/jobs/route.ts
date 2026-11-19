import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { z } from "zod";
import { approvedSourceUrl, fetchApprovedSource } from "@/lib/uci/source-fetch";

export const dynamic = "force-dynamic";

const UA = "ALOEduIntelBot/1.0 (+https://alaminn.info; university-info verification check)";

function parseRobotsForPath(robotsTxt: string, path: string): boolean {
  // Minimal but correct robots.txt evaluation for our token:
  // Combine all groups for the matching bot; otherwise use wildcard rules.
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
  const specific = groups.filter((g) => g.agents.includes("aloeduintelbot"));
  const matches = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const group = { allow: matches.flatMap((g) => g.allow), disallow: matches.flatMap((g) => g.disallow) };
  const matchLen = (rule: string, p: string): number | null => {
    // supports '*' wildcard and '$' terminator minimally
    const hasEnd = rule.endsWith("$");
    let pattern = hasEnd ? rule.slice(0, -1) : rule;
    pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp("^" + pattern + (hasEnd ? "$" : ""));
    return re.test(p) ? Buffer.byteLength(rule) : null;
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
  pathRules.sort((x, y) => (y.len - x.len) || Number(y.allow) - Number(x.allow));
  return pathRules[0].allow;
}

class RobotsBlockedError extends Error {}

async function runJob(jobId: string, parsed: URL, sourceUrl: URL, sourceKey: string, recordedSourceUrl: string) {
  const targetUrl = parsed.href;
  const started = new Date();
  await db.uciCollectionJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: started, attempts: { increment: 1 } } });
  let robotsTxt: string | undefined;
  try {
    const robotsRes = await fetchApprovedSource(new URL("/robots.txt", sourceUrl), sourceUrl, {
      userAgent: UA, timeout: 8000, maxBytes: 512_000,
    });
    if (robotsRes.status >= 200 && robotsRes.status < 300) robotsTxt = robotsRes.body.toString("utf8");
    else if (robotsRes.status === 404 || robotsRes.status === 410) robotsTxt = "";
  } catch {
    // Network or destination policy failure is not permission to fetch.
  }
  if (robotsTxt === undefined) {
    await db.uciCollectionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), lastError: "Unable to check source robots.txt safely" },
    });
    return;
  }
  const rules = robotsTxt;
  try {
    const res = await fetchApprovedSource(parsed, sourceUrl, {
      userAgent: UA, timeout: 12_000, maxBytes: 2_000_000,
      allowPath: (url) => {
        if (!parseRobotsForPath(rules, url.pathname + url.search)) throw new RobotsBlockedError();
      },
    });
    if (res.status < 200 || res.status >= 300) {
      await db.uciCollectionJob.update({ where: { id: jobId }, data: { status: "FAILED", httpStatus: res.status, finishedAt: new Date(), lastError: "Source returned a non-success HTTP status" } });
      return;
    }
    const hash = createHash("sha256").update(res.body).digest("hex");
    const bytes = res.body.length;

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

    const finishedAt = new Date();
    await db.$transaction([
      db.uciCollectionJob.update({ where: { id: jobId }, data: { status: "SUCCESS", httpStatus: res.status, contentHash: hash, bytes, findings, finishedAt, lastError: null } }),
      ...(res.finalUrl === targetUrl && targetUrl === sourceUrl.href ? [db.uciSource.updateMany({ where: { key: sourceKey, url: recordedSourceUrl }, data: { robotsAllowed: true, lastCheckedAt: finishedAt } })] : []),
      ...(res.finalUrl === targetUrl ? [db.uciRequirementRecord.updateMany({ where: { sourceUrl: targetUrl }, data: { lastCheckedAt: finishedAt } })] : []),
    ]);
  } catch (e) {
    if (e instanceof RobotsBlockedError) {
      await db.$transaction([
        db.uciCollectionJob.update({ where: { id: jobId }, data: {
          status: "ROBOTS_BLOCKED", finishedAt: new Date(), findings: "robots.txt disallows the requested path or a redirect destination.", lastError: null,
        } }),
        ...(targetUrl === sourceUrl.href ? [db.uciSource.updateMany({ where: { key: sourceKey, url: recordedSourceUrl }, data: { robotsAllowed: false } })] : []),
      ]);
      return;
    }
    await db.uciCollectionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), lastError: `Fetch failed: ${(e as Error).message}` },
    });

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

  const parsed = z.object({ targetUrl: z.url().max(2048), sourceKey: z.string().min(1).max(191), type: z.enum(["SOURCE_CHECK", "DISCOVERY"]).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Valid targetUrl and sourceKey are required" }, { status: 400 });
  const body = parsed.data;
  const source = await db.uciSource.findUnique({ where: { key: body.sourceKey } });
  if (!source) return NextResponse.json({ error: "unknown sourceKey" }, { status: 404 });
  if (source.identityStatus !== "CONFIRMED") {
    return NextResponse.json(
      { error: `Source "${source.name}" is not confirmed — confirm its exact URL and permission before scheduling collection.` },
      { status: 422 },
    );
  }
  let sourceUrl: URL;
  let target: URL;
  try {
    if (!source.url) throw new Error("Source has no confirmed URL");
    sourceUrl = new URL(source.url);
    approvedSourceUrl(sourceUrl.href, sourceUrl);
    target = approvedSourceUrl(body.targetUrl, sourceUrl);
  } catch {
    return NextResponse.json({ error: "Target must match a confirmed HTTPS source" }, { status: 422 });
  }

  const job = await db.uciCollectionJob.create({
    data: {
      sourceKey: body.sourceKey,
      targetUrl: target.href,
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
      detail: JSON.stringify({ targetUrl: target.href, sourceKey: body.sourceKey }),
    },
  });
  // run synchronously (bounded timeouts inside); the UI gets the real result
  await runJob(job.id, target, sourceUrl, body.sourceKey, source.url!);
  const final = await db.uciCollectionJob.findUnique({ where: { id: job.id } });
  return NextResponse.json({ job: final });
}
