/**
 * UCI verification statuses and live detection helpers.
 * Statuses follow module specification §4. Unknown stays unknown — nothing
 * here fabricates values; it only groups and compares recorded facts.
 */
export const UCI_STATUSES = [
  "DISCOVERED",
  "SOURCE_CHECK_REQUIRED",
  "OFFICIAL_SOURCE_VERIFIED",
  "CONFLICTING_INFORMATION",
  "OUTDATED",
  "UNAVAILABLE",
  "HUMAN_REVIEW_REQUIRED",
  "APPROVED_FOR_PUBLICATION",
] as const;

export type UciStatus = (typeof UCI_STATUSES)[number];

export const STATUS_STYLES: Record<string, string> = {
  DISCOVERED: "bg-slate-100 text-slate-700 border-slate-200",
  SOURCE_CHECK_REQUIRED: "bg-amber-50 text-amber-800 border-amber-200",
  OFFICIAL_SOURCE_VERIFIED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CONFLICTING_INFORMATION: "bg-red-50 text-red-800 border-red-200",
  OUTDATED: "bg-orange-50 text-orange-800 border-orange-200",
  UNAVAILABLE: "bg-slate-100 text-slate-500 border-slate-200",
  HUMAN_REVIEW_REQUIRED: "bg-violet-50 text-violet-800 border-violet-200",
  APPROVED_FOR_PUBLICATION: "bg-emerald-600 text-white border-emerald-700",
};

export interface FieldRecord {
  id: string;
  institutionId: string;
  context: string | null;
  fieldsJson: string;
  sourceFile: string;
  sheet: string;
  rowNumber: number;
  sourceUrl: string | null;
  academicYear: string | null;
  verificationStatus: string;
  collectedAt: Date | string;
  lastCheckedAt: Date | string | null;
  lastVerifiedAt: Date | string | null;
}

/** Fields whose disagreement across records of the same year-family is a conflict. */
export const CONFLICT_FIELDS = [
  "tuition_fees", "initial_deposit", "cas_deposit", "ug_ielts", "pg_ielts",
  "ug_pte", "pg_pte", "ug_hsc", "pg_honors", "max_scholarship",
  "ug_year_gap", "pg_year_gap", "pg_oietc", "ug_oietc",
];

export function sheetFamily(rec: { sheet: string; context: string | null }): string {
  const ctx = (rec.context ?? "").toLowerCase();
  if (ctx.includes("2027")) return "2027";
  if (ctx.includes("2026")) return "2026";
  if (ctx.includes("2025")) return "2025";
  if (rec.sheet.toLowerCase().includes("2027")) return "2027";
  if (rec.sheet.toLowerCase().includes("2026")) return "2026";
  if (rec.sheet.toLowerCase() === "uk-i") return "uk-i";
  return rec.sheet;
}

export function fieldsOf(rec: Pick<FieldRecord, "fieldsJson">): Record<string, string> {
  try {
    return JSON.parse(rec.fieldsJson) as Record<string, string>;
  } catch {
    return {};
  }
}

export interface ConflictVariant {
  value: string;
  locations: string[];
  recordIds: string[];
}

export interface ConflictItem {
  institutionId: string;
  institutionName: string;
  field: string;
  family: string;
  variants: ConflictVariant[];
}

/**
 * Live conflict detection: same institution + same field + same year-family
 * with differing recorded values. Preserves every source record; never picks
 * a winner silently.
 */
export function detectConflicts(
  records: (FieldRecord & { institutionName: string })[],
): ConflictItem[] {
  const byKey = new Map<string, {
    institutionId: string; institutionName: string; field: string; family: string;
    variants: Map<string, ConflictVariant>;
  }>();
  for (const rec of records) {
    const fields = fieldsOf(rec);
    for (const f of CONFLICT_FIELDS) {
      const v = fields[f];
      if (!v) continue;
      const family = sheetFamily(rec);
      const key = `${rec.institutionId}::${f}::${family}`;
      const entry = byKey.get(key) ?? {
        institutionId: rec.institutionId,
        institutionName: rec.institutionName,
        field: f,
        family,
        variants: new Map<string, ConflictVariant>(),
      };
      const sig = v.toLowerCase().replace(/[\s£,]/g, "");
      const variant = entry.variants.get(sig) ?? { value: v, locations: [], recordIds: [] };
      variant.locations.push(`${rec.sourceFile}::${rec.sheet}:row${rec.rowNumber}`);
      variant.recordIds.push(rec.id);
      entry.variants.set(sig, variant);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .filter((e) => e.variants.size > 1)
    .map((e) => ({
      institutionId: e.institutionId,
      institutionName: e.institutionName,
      field: e.field,
      family: e.family,
      variants: [...e.variants.values()],
    }));
}

export interface DuplicateItem {
  institutionName: string;
  country: string;
  sheets: string[];
  recordCount: number;
  programmeCount: number;
}

/** Cross-sheet duplicates: the same canonical institution captured in multiple sheets. */
export function groupDuplicates(
  institutions: { id: string; canonicalName: string; country: string }[],
  records: FieldRecord[],
  programmeCounts: Map<string, number>,
): DuplicateItem[] {
  const byInst = new Map<string, { sheets: Set<string>; count: number }>();
  for (const rec of records) {
    const e = byInst.get(rec.institutionId) ?? { sheets: new Set<string>(), count: 0 };
    e.sheets.add(`${rec.sourceFile}::${rec.sheet}`);
    e.count += 1;
    byInst.set(rec.institutionId, e);
  }
  return institutions
    .filter((i) => (byInst.get(i.id)?.sheets.size ?? 0) >= 2)
    .map((i) => {
      const e = byInst.get(i.id)!;
      return {
        institutionName: i.canonicalName,
        country: i.country,
        sheets: [...e.sheets],
        recordCount: e.count,
        programmeCount: programmeCounts.get(i.id) ?? 0,
      };
    });
}

/** Outdated candidates: a same-institution record whose year-family is superseded by a newer one. */
export function detectOutdated(records: (FieldRecord & { institutionName: string })[]): {
  recordId: string; institutionName: string; context: string | null; family: string;
  supersededBy: string; sheet: string;
}[] {
  const yearOf = (r: FieldRecord) => {
    const fam = sheetFamily(r);
    const m = fam.match(/20(\d\d)/);
    return m ? parseInt(m[1], 10) : null;
  };
  const latestByInst = new Map<string, number>();
  for (const r of records) {
    const y = yearOf(r);
    if (y !== null) {
      latestByInst.set(r.institutionId, Math.max(latestByInst.get(r.institutionId) ?? 0, y));
    }
  }
  const out: ReturnType<typeof detectOutdated> = [];
  for (const r of records) {
    const y = yearOf(r);
    const latest = latestByInst.get(r.institutionId);
    if (y !== null && latest !== undefined && y < latest) {
      out.push({
        recordId: r.id,
        institutionName: r.institutionName,
        context: r.context,
        family: sheetFamily(r),
        supersededBy: `20${latest}`,
        sheet: r.sheet,
      });
    }
  }
  return out;
}

/** Escape a value for CSV output. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
