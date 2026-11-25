/**
 * Higher Study — weekly monitoring digest (§7 step 15).
 * --------------------------------------------------------------------
 * After each monitoring cycle the Super Admin needs a single honest
 * summary: what was checked, what failed, what changed, and what is
 * waiting for approval. The digest is DERIVED from persisted rows
 * (runs + changes) — nothing is invented, and an empty queue renders
 * as a valid result, never as missing data.
 *
 * `buildDigestPayload` is a pure function so the anti-fabrication
 * rules are unit-testable; `buildMonitoringDigest` only loads rows
 * from the database and delegates to it.
 */

export interface DigestChangeSummary {
  changeType: string;
  impact: string;
  count: number;
  pending: number;
}

export interface DigestInput {
  run: {
    id: string;
    status: string;
    startedAt: Date | string;
    completedAt: Date | string | null;
    nextRunAt: Date | string | null;
    sourcesChecked: number;
    sourcesFailed: number;
    changesDetected: number;
  } | null;
  /** Change rows belonging to the run (changeType, impact, status). */
  changes: ReadonlyArray<{ changeType: string; impact: string; status: string }>;
  /** Pending-review changes across the whole dataset (not just this run). */
  pendingApproval: number;
}

export interface DigestPayload {
  runId: string | null;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  nextRunAt: string | null;
  sourcesChecked: number;
  sourcesFailed: number;
  changesDetected: number;
  pendingApproval: number;
  criticalOrHigh: number;
  byType: DigestChangeSummary[];
  headline: string;
}

const HIGH_IMPACTS = new Set(["CRITICAL", "HIGH"]);

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Aggregate real change rows into the digest payload. Pure — no I/O. */
export function buildDigestPayload(input: DigestInput): DigestPayload {
  const { run, changes, pendingApproval } = input;

  if (!run) {
    return {
      runId: null,
      status: "no-run-yet",
      windowStart: null,
      windowEnd: null,
      nextRunAt: null,
      sourcesChecked: 0,
      sourcesFailed: 0,
      changesDetected: 0,
      pendingApproval,
      criticalOrHigh: 0,
      byType: [],
      headline:
        "No monitoring cycle has run yet. An empty history is a valid result — register official sources and wait for the weekly cron.",
    };
  }

  const byTypeMap = new Map<string, DigestChangeSummary>();
  let criticalOrHigh = 0;
  for (const c of changes) {
    const key = `${c.changeType}|${c.impact}`;
    const entry = byTypeMap.get(key) ?? { changeType: c.changeType, impact: c.impact, count: 0, pending: 0 };
    entry.count += 1;
    if (c.status === "pending") entry.pending += 1;
    if (HIGH_IMPACTS.has(c.impact)) criticalOrHigh += 1;
    byTypeMap.set(key, entry);
  }
  const byType = [...byTypeMap.values()].sort((a, b) => b.count - a.count || a.changeType.localeCompare(b.changeType));

  const checked = run.sourcesChecked;
  const failed = run.sourcesFailed;
  const detected = run.changesDetected;
  const parts: string[] = [];
  parts.push(
    run.status === "completed"
      ? `Last cycle completed: checked ${checked} source${checked === 1 ? "" : "s"}`
      : `Last cycle status ${run.status}: checked ${checked} source${checked === 1 ? "" : "s"}`,
  );
  if (failed > 0) parts.push(`${failed} failed (recorded for re-check, verified data untouched)`);
  if (detected > 0) {
    parts.push(`${detected} change${detected === 1 ? "" : "s"} detected (${criticalOrHigh} high/critical)`);
    parts.push(`${pendingApproval} pending review overall`);
  } else {
    parts.push("no changes detected — an empty queue is a valid result");
  }

  return {
    runId: run.id,
    status: run.status,
    windowStart: iso(run.startedAt),
    windowEnd: iso(run.completedAt),
    nextRunAt: iso(run.nextRunAt),
    sourcesChecked: checked,
    sourcesFailed: failed,
    changesDetected: detected,
    pendingApproval,
    criticalOrHigh,
    byType,
    headline: `${parts.join("; ")}.`,
  };
}

/** Load the latest monitoring run with its changes and build the digest. */
export async function buildMonitoringDigest(): Promise<DigestPayload> {
  const { db } = await import("@/lib/db");
  const run = await db.higherStudyMonitoringRun.findFirst({ orderBy: { startedAt: "desc" } });
  if (!run) return buildDigestPayload({ run: null, changes: [], pendingApproval: 0 });
  const [changes, pendingApproval] = await Promise.all([
    db.higherStudyDataChange.findMany({
      where: { runId: run.id },
      select: { changeType: true, impact: true, status: true },
    }),
    db.higherStudyDataChange.count({ where: { status: "pending" } }),
  ]);
  return buildDigestPayload({ run, changes, pendingApproval });
}
