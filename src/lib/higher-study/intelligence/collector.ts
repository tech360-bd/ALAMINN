/**
 * Permission-gated collector for the university & course intelligence
 * system (module spec §2, §4). Every fetch:
 *  1. resolves the source organisation + level,
 *  2. checks robots.txt (never bypasses a restriction; unreachable robots
 *     → skip and record skipped-permissions),
 *  3. records a per-source collection job (failure visibility + retry),
 *  4. upserts per-fact evidence with the original wording excerpt,
 *     normalised value, academic year and intelligence status,
 *  5. runs conflict detection for every field it touched.
 *
 * Unknown values are stored as unknown — this collector never invents a
 * value.
 */
import { db } from "@/lib/db";
import { canFetch, INTELLIGENCE_USER_AGENT } from "./robots";
import { resolveSourceLevel } from "./sources";
import { detectConflictsForEntity } from "./conflicts";
import { extractSignals } from "../monitoring/engine";
import type { IntelligenceStatus, SourceLevel } from "./statuses";

const MAX_HTML_BYTES = 500_000;
const MAX_WORDING_CHARS = 600;
const MAX_EVIDENCE_PER_SOURCE = 40;

/** Bounded excerpt of the original source wording, preserved for verification. */
export function excerpt(text: string | null | undefined, max = MAX_WORDING_CHARS): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** Evidence status for a freshly collected fact, by source level. */
export function statusForCollectedFact(level: SourceLevel): IntelligenceStatus {
  // Facts read from official university pages are verified by definition;
  // discovery-platform facts always require an official source check.
  return level === "L1_OFFICIAL" ? "OFFICIAL_SOURCE_VERIFIED" : "SOURCE_CHECK_REQUIRED";
}

export interface CollectResult {
  jobId: string;
  status: "ok" | "failed" | "skipped-permissions";
  robotsAllowed: boolean;
  evidenceCreated: number;
  evidenceUpdated: number;
  conflictsDetected: number;
  error?: string;
}

export async function collectFromSource(
  sourceRecordId: string,
  options: {
    runId?: string;
    fetchImpl?: typeof fetch;
    officialHostnames?: readonly string[];
  } = {}
): Promise<CollectResult> {
  const src = await db.higherStudySourceRecord.findUnique({ where: { id: sourceRecordId } });
  if (!src) throw new Error(`source record ${sourceRecordId} not found`);
  const fetchImpl = options.fetchImpl ?? fetch;

  const officialHostnames = options.officialHostnames ?? (await loadOfficialHostnames());
  const { level, orgKey } = resolveSourceLevel(src.url, officialHostnames);
  const sourceOrg = orgKey ? await db.higherStudySourceOrg.findUnique({ where: { key: orgKey } }) : null;

  const job = await db.higherStudyCollectionJob.create({
    data: {
      runId: options.runId,
      sourceOrgId: sourceOrg?.id,
      sourceUrl: src.url,
      status: "running",
      attempts: 1,
    },
  });

  const decision = await canFetch(src.url, fetchImpl);
  if (!decision.allowed) {
    await db.higherStudyCollectionJob.update({
      where: { id: job.id },
      data: {
        status: "skipped-permissions",
        robotsAllowed: false,
        error:
          decision.certainty === "unknown"
            ? "robots.txt unreachable — treated as unknown; fetch skipped (never bypassed)"
            : "robots.txt disallows this path for our agent — fetch skipped (never bypassed)",
        completedAt: new Date(),
      },
    });
    await db.higherStudySourceRecord.update({
      where: { id: src.id },
      data: { lastCheckedAt: new Date(), lastStatus: "permission-skipped" },
    });
    return {
      jobId: job.id,
      status: "skipped-permissions",
      robotsAllowed: false,
      evidenceCreated: 0,
      evidenceUpdated: 0,
      conflictsDetected: 0,
    };
  }

  if (decision.crawlDelayMs > 0) {
    await new Promise((r) => setTimeout(r, Math.min(decision.crawlDelayMs, 10_000)));
  }

  try {
    const res = await fetchImpl(src.url, {
      headers: { "user-agent": INTELLIGENCE_USER_AGENT },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const signals = extractSignals(html);
    const status = statusForCollectedFact(level);

    let created = 0;
    let updated = 0;
    const touched = new Set<string>();
    const entityType = src.entityType ?? "course";
    const entityId = src.entityId ?? src.id;
    const academicYear = detectAcademicYear(html);
    // Honest field mapping — unknown stays unknown; arrays are recorded as
    // comma-joined sightings (they are sightings, not asserted facts).
    const facts: Record<string, string | null> = {
      pageTitle: signals.title,
      ieltsRequirement: signals.ielts,
      tuitionFeeSightings: signals.fees.length ? signals.fees.join("; ") : null,
      applicationDeadlineSightings: signals.deadlines.length ? signals.deadlines.join("; ") : null,
      courseStatusSignal: signals.closed ? "closure/discontinuation signal detected on page" : null,
    };
    for (const [field, rawValue] of Object.entries(facts)) {
      if (touched.size >= MAX_EVIDENCE_PER_SOURCE) break;
      const normalised = normaliseSignalValue(rawValue);
      if (!normalised) continue; // unknown stays unknown — never invented
      const wording = findWordingExcerpt(html, normalised);
      const existing = await db.higherStudyEvidence.findUnique({
        where: {
          entityType_entityId_field_sourceUrl: { entityType, entityId, field, sourceUrl: src.url },
        },
      });
      if (existing) {
        if (existing.normalisedValue !== normalised) {
          const history = appendHistory(existing.changeHistory, existing.normalisedValue, normalised);
          await db.higherStudyEvidence.update({
            where: { id: existing.id },
            data: {
              normalisedValue: normalised,
              originalWording: wording ?? existing.originalWording,
              academicYear: academicYear ?? existing.academicYear,
              status,
              lastCheckedAt: new Date(),
              changeHistory: history,
            },
          });
          updated++;
        } else {
          await db.higherStudyEvidence.update({
            where: { id: existing.id },
            data: { lastCheckedAt: new Date(), status },
          });
        }
      } else {
        await db.higherStudyEvidence.create({
          data: {
            entityType,
            entityId,
            field,
            sourceOrgId: sourceOrg?.id,
            sourceOrgKey: orgKey,
            sourceLevel: level,
            sourceType: src.sourceType,
            sourceUrl: src.url,
            academicYear,
            originalWording: wording,
            normalisedValue: normalised,
            status: level === "L1_OFFICIAL" ? status : "DISCOVERED",
            lastCheckedAt: new Date(),
          },
        });
        created++;
      }
      touched.add(field);
    }

    let conflicts = 0;
    for (const field of touched) {
      const found = await detectConflictsForEntity(entityType, entityId, field);
      conflicts += found.length;
    }

    await db.higherStudyCollectionJob.update({
      where: { id: job.id },
      data: {
        status: "ok",
        robotsAllowed: true,
        httpStatus: res.status,
        itemsSeen: Object.keys(facts).length,
        evidenceCreated: created,
        evidenceUpdated: updated,
        conflictsDetected: conflicts,
        completedAt: new Date(),
      },
    });
    await db.higherStudySourceRecord.update({
      where: { id: src.id },
      data: { lastCheckedAt: new Date(), lastStatus: "ok", failCount: 0 },
    });
    return {
      jobId: job.id,
      status: "ok",
      robotsAllowed: true,
      evidenceCreated: created,
      evidenceUpdated: updated,
      conflictsDetected: conflicts,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    const retryAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.higherStudyCollectionJob.update({
      where: { id: job.id },
      data: { status: "failed", error: message, completedAt: new Date(), nextRetryAt: retryAt },
    });
    await db.higherStudySourceRecord.update({
      where: { id: src.id },
      data: { lastCheckedAt: new Date(), failCount: { increment: 1 }, lastStatus: "unavailable" },
    });
    return {
      jobId: job.id,
      status: "failed",
      robotsAllowed: true,
      evidenceCreated: 0,
      evidenceUpdated: 0,
      conflictsDetected: 0,
      error: message,
    };
  }
}

/** Hostnames of every university's official website (for L1 resolution). */
async function loadOfficialHostnames(): Promise<string[]> {
  const unis = await db.higherStudyUniversity.findMany({
    where: { officialWebsite: { not: null } },
    select: { officialWebsite: true },
    take: 1000,
  });
  const hosts: string[] = [];
  for (const u of unis) {
    try {
      hosts.push(new URL(u.officialWebsite!).hostname.toLowerCase());
    } catch {
      continue;
    }
  }
  return hosts;
}

function appendHistory(existingJson: string | null, from: string, to: string): string {
  let history: { at: string; from: string; to: string }[] = [];
  try {
    if (existingJson) history = JSON.parse(existingJson);
  } catch {
    history = [];
  }
  history.push({ at: new Date().toISOString(), from, to });
  return JSON.stringify(history.slice(-20)); // bounded history
}

/** Best-effort academic-year detection — absent means unknown (null). */
export function detectAcademicYear(html: string): string | null {
  const patterns = [
    /20\d{2}\s*[–/-]\s*(20\d{2}|\d{2})/,
    /\b(20\d{2})\s*[-/]\s*(\d{2}|\d{4})\b/,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Normalise a signal value to a display-safe string; null → unknown. */
export function normaliseSignalValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Find a short excerpt of the original wording around a value. If no
 * plain occurrence is found, the excerpt stays null (unknown) rather than
 * fabricating a quote.
 */
export function findWordingExcerpt(html: string, value: string): string | null {
  const plain = html.replace(/<[^>]+>/g, " ");
  const idx = plain.indexOf(value);
  if (idx === -1) return null;
  const start = Math.max(0, idx - Math.max(0, Math.floor((MAX_WORDING_CHARS - value.length) / 2)));
  return excerpt(plain.slice(start, start + MAX_WORDING_CHARS));
}
