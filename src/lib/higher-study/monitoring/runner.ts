import { db } from "@/lib/db";
import { contentHash, extractSignals, diffSignals } from "./engine";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
/** One monitoring cycle. Lock = a `running` run younger than 2h blocks duplicates (survives restarts via DB). Bounded batch. */
export async function runMonitoringCycle(maxSources = 50): Promise<{ runId: string; checked: number; failed: number; changes: number; skipped?: string }> {
  const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const running = await db.higherStudyMonitoringRun.findFirst({ where: { status: "running", startedAt: { gt: stale } } });
  if (running) return { runId: running.id, checked: 0, failed: 0, changes: 0, skipped: "run_already_in_progress" };
  const run = await db.higherStudyMonitoringRun.create({ data: { status: "running", nextRunAt: new Date(Date.now() + SEVEN_DAYS) } });
  // Auto-register official source URLs already stored on catalogue records (no invented URLs).
  await syncSourcesFromCatalogue();
  const sources = await db.higherStudySourceRecord.findMany({ where: { active: true }, orderBy: { lastCheckedAt: "asc" }, take: maxSources });
  let checked = 0, failed = 0, changes = 0;
  for (const src of sources) {
    try {
      const res = await fetch(src.url, { headers: { "user-agent": "ALO-Education-Monitor/1.0 (+https://alaminn.info)" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = (await res.text()).slice(0, 500_000);
      const hash = contentHash(html); const signals = extractSignals(html);
      const last = await db.higherStudySourceSnapshot.findFirst({ where: { sourceId: src.id }, orderBy: { fetchedAt: "desc" } });
      await db.higherStudySourceSnapshot.create({ data: { sourceId: src.id, contentHash: hash, title: signals.title, signals: JSON.stringify(signals), httpStatus: res.status } });
      let prevSignals = null; try { prevSignals = last?.signals ? JSON.parse(last.signals) : null; } catch { prevSignals = null; }
      if (!last || last.contentHash !== hash) {
        for (const d of diffSignals(prevSignals, signals, src.sourceType)) {
          // Suppress exact duplicate pending change for same entity+field.
          const dup = await db.higherStudyDataChange.findFirst({ where: { sourceId: src.id, field: d.field, status: "pending", newValue: d.newValue } });
          if (dup) continue;
          await db.higherStudyDataChange.create({ data: { runId: run.id, sourceId: src.id, entityType: src.entityType || "course", entityId: src.entityId, entityLabel: src.title, field: d.field, changeType: d.changeType, impact: d.impact, oldValue: d.oldValue, newValue: d.newValue, sourceUrl: src.url, confidence: d.confidence, aiSummary: d.aiSummary } });
          changes++;
        }
      }
      await db.higherStudySourceRecord.update({ where: { id: src.id }, data: { lastCheckedAt: new Date(), lastStatus: last && last.contentHash !== hash ? "changed" : "ok", failCount: 0 } });
      checked++;
    } catch (e) {
      failed++;
      await db.higherStudySourceRecord.update({ where: { id: src.id }, data: { lastCheckedAt: new Date(), lastStatus: "unavailable", failCount: { increment: 1 } } }).catch(() => null);
      await db.higherStudyDataChange.create({ data: { runId: run.id, sourceId: src.id, entityType: src.entityType || "course", entityId: src.entityId, entityLabel: src.title, changeType: "SOURCE_UNAVAILABLE", impact: "MEDIUM", sourceUrl: src.url, confidence: 1, aiSummary: `Fetch failed: ${e instanceof Error ? e.message : "unknown"}. Existing verified data was NOT modified.`, status: "needs-review" } }).catch(() => null);
    }
  }
  await db.higherStudyMonitoringRun.update({ where: { id: run.id }, data: { status: "completed", completedAt: new Date(), sourcesChecked: checked, sourcesFailed: failed, changesDetected: changes } });
  return { runId: run.id, checked, failed, changes };
}
async function syncSourcesFromCatalogue() {
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
  for (const r of rows) await db.higherStudySourceRecord.upsert({ where: { url: r.url }, create: r, update: {} }).catch(() => null);
}
