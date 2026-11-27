/**
 * Weekly intelligence cycle (module spec §4, §8): a bounded, locked cycle
 * that (1) keeps the documented source registry seeded, (2) registers
 * official URLs from the catalogue as Level-1 sources, (3) runs the
 * permission-gated collector over due sources, (4) runs conflict,
 * duplicate and staleness sweeps, and (5) opens review tasks for every
 * discrepancy. Uses the same HigherStudyMonitoringRun table for locking
 * as the existing monitor so the two cycles can never double-run.
 */
import { db } from "@/lib/db";
import { SOURCE_ORG_DEFINITIONS, MARGE_REVIEW_TASK } from "./sources";
import { collectFromSource, type CollectResult } from "./collector";
import { detectConflictsForEntity } from "./conflicts";
import { detectDuplicateUniversities, detectDuplicateCourses } from "./duplicates";
import { runStalenessSweep } from "./stale";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const MAX_SOURCES_PER_CYCLE = 40;

export interface IntelligenceCycleResult {
  runId: string;
  skipped?: string;
  sourcesChecked: number;
  sourcesFailed: number;
  sourcesSkippedPermissions: number;
  evidenceCreated: number;
  evidenceUpdated: number;
  conflictsDetected: number;
  duplicates: { created: number; open: number };
  staleness: { outdated: number; unavailable: number; missingOfficialUrl: number; reviewTasks: number };
}

/** Seed the documented source registry (idempotent upserts). */
export async function ensureSourceRegistry(): Promise<{ seeded: number; margeTaskId?: string }> {
  let seeded = 0;
  for (const def of SOURCE_ORG_DEFINITIONS) {
    await db.higherStudySourceOrg.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        name: def.name,
        level: def.level,
        baseUrl: def.baseUrl,
        docsUrl: def.docsUrl,
        permissionNote: def.permissionNote,
        apiAvailable: def.apiAvailable,
        active: def.collectable,
      },
      update: {
        name: def.name,
        level: def.level,
        docsUrl: def.docsUrl,
        permissionNote: def.permissionNote,
        apiAvailable: def.apiAvailable,
      },
    });
    seeded++;
  }
  // MARGE URL confirmation review task (spec: exact source URL to be confirmed)
  const task = await db.higherStudyReviewTask.upsert({
    where: { type_refType_refId: { type: MARGE_REVIEW_TASK.type, refType: MARGE_REVIEW_TASK.refType, refId: MARGE_REVIEW_TASK.refId } },
    create: { ...MARGE_REVIEW_TASK },
    update: {},
  });
  return { seeded, margeTaskId: task?.id };
}

/** Register official URLs from catalogue rows as Level-1 sources (reuses the monitor's auto-registration). */
async function registerOfficialSources(): Promise<number> {
  const [courses, unis, schols] = await Promise.all([
    db.higherStudyCourse.findMany({ where: { officialSourceUrl: { not: null } }, select: { id: true, title: true, officialSourceUrl: true }, take: 500 }),
    db.higherStudyUniversity.findMany({ where: { officialSourceUrl: { not: null } }, select: { id: true, officialName: true, officialSourceUrl: true }, take: 500 }),
    db.higherStudyScholarship.findMany({ where: { officialSourceUrl: { not: null } }, select: { id: true, name: true, officialSourceUrl: true }, take: 500 }),
  ]);
  const rows = [
    ...courses.map((c) => ({ url: c.officialSourceUrl!, entityType: "course", entityId: c.id, title: c.title, sourceType: "university-course" })),
    ...unis.map((u) => ({ url: u.officialSourceUrl!, entityType: "university", entityId: u.id, title: u.officialName, sourceType: "uni-admissions" })),
    ...schols.map((s) => ({ url: s.officialSourceUrl!, entityType: "scholarship", entityId: s.id, title: s.name, sourceType: "uni-scholarship" })),
  ];
  let registered = 0;
  for (const r of rows) {
    const res = await db.higherStudySourceRecord.upsert({ where: { url: r.url }, create: r, update: {} });
    if (res) registered++;
  }
  return registered;
}

export async function runIntelligenceCycle(
  maxSources = MAX_SOURCES_PER_CYCLE
): Promise<IntelligenceCycleResult> {
  // Shared lock with the existing weekly monitor (same table, 2h window).
  const stale = new Date(Date.now() - TWO_HOURS);
  const running = await db.higherStudyMonitoringRun.findFirst({
    where: { status: "running", startedAt: { gt: stale } },
  });
  if (running) {
    return {
      runId: running.id,
      skipped: "run_already_in_progress",
      sourcesChecked: 0,
      sourcesFailed: 0,
      sourcesSkippedPermissions: 0,
      evidenceCreated: 0,
      evidenceUpdated: 0,
      conflictsDetected: 0,
      duplicates: { created: 0, open: 0 },
      staleness: { outdated: 0, unavailable: 0, missingOfficialUrl: 0, reviewTasks: 0 },
    };
  }
  const run = await db.higherStudyMonitoringRun.create({
    data: { status: "running", nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  await ensureSourceRegistry();
  await registerOfficialSources();

  const sources = await db.higherStudySourceRecord.findMany({
    where: { active: true },
    orderBy: { lastCheckedAt: "asc" },
    take: maxSources,
  });

  let checked = 0;
  let failed = 0;
  let skippedPermissions = 0;
  let evidenceCreated = 0;
  let evidenceUpdated = 0;
  let conflicts = 0;
  for (const src of sources) {
    let result: CollectResult;
    try {
      result = await collectFromSource(src.id, { runId: run.id });
    } catch {
      failed++;
      continue;
    }
    if (result.status === "ok") checked++;
    else if (result.status === "failed") failed++;
    else skippedPermissions++;
    evidenceCreated += result.evidenceCreated;
    evidenceUpdated += result.evidenceUpdated;
    conflicts += result.conflictsDetected;
  }

  // Cross-source conflict sweep for facts collected from multiple sources.
  const multiSourceFacts = await db.higherStudyEvidence.groupBy({
    by: ["entityType", "entityId", "field"],
    where: { status: { in: ["CONFLICTING_INFORMATION"] } },
    _count: { _all: true },
  }).catch(() => [] as { entityType: string; entityId: string; field: string }[]);
  for (const f of multiSourceFacts) {
    const found = await detectConflictsForEntity(f.entityType, f.entityId, f.field);
    conflicts += found.length;
  }

  const uniDupes = await detectDuplicateUniversities();
  const courseDupes = await detectDuplicateCourses();
  const duplicates = {
    created: uniDupes.created + courseDupes.created,
    open: uniDupes.open + courseDupes.open,
  };

  const staleness = await runStalenessSweep();

  await db.higherStudyMonitoringRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      sourcesChecked: checked,
      sourcesFailed: failed,
      changesDetected: conflicts,
    },
  });

  return {
    runId: run.id,
    sourcesChecked: checked,
    sourcesFailed: failed,
    sourcesSkippedPermissions: skippedPermissions,
    evidenceCreated,
    evidenceUpdated,
    conflictsDetected: conflicts,
    duplicates,
    staleness,
  };
}
