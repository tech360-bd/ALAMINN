/**
 * Bulk export with full source attribution (module spec §8): exports
 * catalogue rows with their evidence status, source, source level, last
 * checked / verified dates and academic year, so every exported fact is
 * traceable. Unverified facts are exported with their true status —
 * never as "current".
 */
import { db } from "@/lib/db";

export interface ExportRow {
  entityType: string;
  entityId: string;
  label: string;
  field: string;
  value: string;
  intelligenceStatus: string | null;
  sourceLevel: string | null;
  sourceOrg: string | null;
  sourceUrl: string | null;
  academicYear: string | null;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  originalWording: string | null;
}

export interface ExportResult {
  generatedAt: string;
  rowCount: number;
  rows: ExportRow[];
}

const MAX_EXPORT_ROWS = 10_000;

function csvCell(value: string | null | undefined): string {
  const v = value ?? "";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function exportEvidence(
  filters: { entityType?: string; status?: string; entityId?: string } = {}
): Promise<ExportResult> {
  const where: Record<string, unknown> = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.status) where.status = filters.status;
  if (filters.entityId) where.entityId = filters.entityId;
  const evidence = await db.higherStudyEvidence.findMany({
    where,
    orderBy: [{ entityType: "asc" }, { entityId: "asc" }, { field: "asc" }],
    take: MAX_EXPORT_ROWS,
  });
  const labelCache = new Map<string, string>();
  const rows: ExportRow[] = [];
  for (const e of evidence) {
    const labelKey = `${e.entityType}:${e.entityId}`;
    if (!labelCache.has(labelKey)) {
      labelCache.set(labelKey, await loadLabel(e.entityType, e.entityId));
    }
    rows.push({
      entityType: e.entityType,
      entityId: e.entityId,
      label: labelCache.get(labelKey) ?? "unknown",
      field: e.field,
      value: e.normalisedValue,
      intelligenceStatus: e.status,
      sourceLevel: e.sourceLevel,
      sourceOrg: e.sourceOrgKey,
      sourceUrl: e.sourceUrl,
      academicYear: e.academicYear,
      lastCheckedAt: e.lastCheckedAt?.toISOString() ?? null,
      lastVerifiedAt: e.lastVerifiedAt?.toISOString() ?? null,
      originalWording: e.originalWording,
    });
  }
  return { generatedAt: new Date().toISOString(), rowCount: rows.length, rows };
}

async function loadLabel(entityType: string, entityId: string): Promise<string> {
  try {
    if (entityType === "university") {
      const u = await db.higherStudyUniversity.findUnique({ where: { id: entityId }, select: { officialName: true } });
      return u?.officialName ?? entityId;
    }
    if (entityType === "course") {
      const c = await db.higherStudyCourse.findUnique({ where: { id: entityId }, select: { title: true } });
      return c?.title ?? entityId;
    }
    if (entityType === "scholarship") {
      const s = await db.higherStudyScholarship.findUnique({ where: { id: entityId }, select: { name: true } });
      return s?.name ?? entityId;
    }
  } catch {
    // fall through
  }
  return entityId;
}

export function toCsv(result: ExportResult): string {
  const header = [
    "entity_type",
    "entity_id",
    "entity_label",
    "field",
    "value",
    "intelligence_status",
    "source_level",
    "source_org",
    "source_url",
    "academic_year",
    "last_checked_at",
    "last_verified_at",
    "original_wording",
  ];
  const lines = [header.join(",")];
  for (const r of result.rows) {
    lines.push(
      [
        r.entityType,
        r.entityId,
        r.label,
        r.field,
        r.value,
        r.intelligenceStatus ?? "",
        r.sourceLevel ?? "",
        r.sourceOrg ?? "",
        r.sourceUrl ?? "",
        r.academicYear ?? "",
        r.lastCheckedAt ?? "",
        r.lastVerifiedAt ?? "",
        r.originalWording ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}
