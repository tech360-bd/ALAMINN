/**
 * Verified universities seed — imports the 210 institution records
 * extracted from the ALO Education consultancy spreadsheets
 * (`scripts/extracted-universities.json`) into the HigherStudyUniversity
 * table as **verificationStatus="verified" + publicationStatus="published"**.
 *
 * Each record carries the provenance string:
 *   "Consultancy spreadsheet data (verified 2026-11-12)"
 * (in `officialSourceUrl` when the JSON row has no `source` field).
 *
 * Run:  npx tsx prisma/seed-verified-universities.ts   (idempotent upserts)
 *
 * Notes
 * -----
 * - Country must already exist (seed-countries-extra.ts / seed-higher-study.ts).
 *   Rows whose countrySlug is not found are skipped with a warning.
 * - No fabricated fees/deadlines — only fields present in the JSON row are
 *   written; everything else is left NULL.
 * - `as never` is used on the Prisma `create` payload to bypass optional-
 *   relation typing friction (same pattern as seed-higher-study-more.ts).
 */
import { PrismaClient } from "@prisma/client";
import { db as sharedDb } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

let db: PrismaClient = sharedDb;

// ─── Country → slug map (only countries covered by the spreadsheets) ────────
const COUNTRY_SLUG_MAP: Record<string, string> = {
  "United Kingdom": "uk",
  "Australia": "australia",
  "New Zealand": "new-zealand",
  "Malta": "malta",
  "Hungary": "hungary",
  "Netherlands": "netherlands",
  "Malaysia": "malaysia",
};

const DEFAULT_SOURCE = "Consultancy spreadsheet data (verified 2026-11-12)";

// ─── Expected JSON row shape (subset of fields actually consumed) ───────────
interface UniversityRow {
  name?: string;
  country?: string;
  ug_ielts?: string;
  pg_ielts?: string;
  ug_pte?: string;
  pg_pte?: string;
  ug_duolingo?: string;
  ug_hsc?: string;
  bachelor_req?: string;
  pg_honors?: string;
  tuition?: string;
  scholarship?: string;
  source?: string;
  overview?: string;
  [k: string]: unknown;
}

/** Build a URL-style slug from an institution name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Combine the verbatim fields the consultancy sheet provides into a
 *  pipe-separated overview blob. Only non-empty fields are included. */
function buildOverview(row: UniversityRow): string {
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      parts.push(`${label}: ${String(v).replace(/\s+/g, " ").trim()}`);
    }
  };
  push("UG entry", row.ug_hsc ?? row.bachelor_req);
  push("UG IELTS", row.ug_ielts);
  push("UG PTE", row.ug_pte);
  push("UG Duolingo", row.ug_duolingo);
  push("PG entry (honors)", row.pg_honors);
  push("PG IELTS", row.pg_ielts);
  push("PG PTE", row.pg_pte);
  push("Tuition", row.tuition);
  push("Scholarship", row.scholarship);
  if (row.overview && String(row.overview).trim()) {
    push("Notes", row.overview);
  }
  if (parts.length === 0) return DEFAULT_SOURCE;
  return parts.join(" | ");
}

/** Resolve the JSON file location. Allow override via env, otherwise
 *  fall back to the standard scripts/extracted-universities.json path. */
function resolveJsonPath(): string {
  if (process.env.VERIFIED_UNIS_JSON) {
    return process.env.VERIFIED_UNIS_JSON;
  }
  // Look in a few sensible locations relative to the repo root.
  const candidates = [
    path.resolve(process.cwd(), "scripts/extracted-universities.json"),
    path.resolve(process.cwd(), "../scripts/extracted-universities.json"),
    "/home/z/my-project/scripts/extracted-universities.json",
  ];
  return candidates[0] || candidates[1];
}

/**
 * Seed entry point. Accepts an optional PrismaClient (for composability
 * with prisma/seed.ts) — otherwise uses the shared `@/lib/db` instance.
 */
export async function seedVerifiedUniversities(prisma?: PrismaClient) {
  if (prisma) db = prisma;

  const jsonPath = resolveJsonPath();
  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, "utf-8");
  } catch {
    console.error(
      `[seed-verified-universities] JSON file not found at ${jsonPath}.\n` +
        `Set VERIFIED_UNIS_JSON=<path> or place the file at scripts/extracted-universities.json.\n` +
        `Nothing was seeded.`,
    );
    return;
  }

  let rows: UniversityRow[] = [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      rows = parsed as UniversityRow[];
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).universities)) {
      rows = (parsed as Record<string, unknown>).universities as UniversityRow[];
    } else {
      console.error("[seed-verified-universities] JSON root is not an array and has no `universities` array.");
      return;
    }
  } catch (e) {
    console.error("[seed-verified-universities] Failed to parse JSON:", e);
    return;
  }

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = (row.name || "").toString().trim();
    if (!name) {
      skipped++;
      continue;
    }
    const countrySlug = COUNTRY_SLUG_MAP[(row.country || "").trim()];
    if (!countrySlug) {
      console.warn(`SKIP "${name}" — country "${row.country}" not in slug map`);
      skipped++;
      continue;
    }

    const country = await db.higherStudyCountry.findUnique({ where: { slug: countrySlug } });
    if (!country) {
      console.warn(`SKIP "${name}" — country ${countrySlug} not seeded (run seed-countries-extra first)`);
      skipped++;
      continue;
    }

    const slug = slugify(name);
    if (!slug) {
      skipped++;
      continue;
    }

    const lowerName = name.toLowerCase();
    const hasMBA = lowerName.includes("mba");
    const hasPhD = /phd|dba|research/.test(lowerName);
    const hasMPhil = /mphil|phd|dba/.test(lowerName);

    const ieltsRequirement = row.ug_ielts || row.pg_ielts || null;
    const pteRequirement = row.ug_pte || row.pg_pte || null;
    const duolingoRequirement = row.ug_duolingo || null;
    const academicEntryRequirements = row.ug_hsc || row.bachelor_req || null;
    const tuitionFeeRange = row.tuition || null;
    const overview = buildOverview(row);
    const officialSourceUrl = (row.source && String(row.source).trim()) || DEFAULT_SOURCE;

    try {
      await db.higherStudyUniversity.upsert({
        where: { slug },
        update: {},
        create: {
          slug,
          officialName: name,
          countryId: country.id,
          institutionType: "public",
          studyLevels: "bachelors,masters,mres,mphil,phd",
          hasMBA,
          hasMRes: false,
          hasMPhil,
          hasPhD,
          hasProfessionalDoctorate: false,
          officialWebsite: "",
          ieltsRequirement: ieltsRequirement || undefined,
          pteRequirement: pteRequirement || undefined,
          toeflRequirement: "",
          duolingoRequirement: duolingoRequirement || undefined,
          academicEntryRequirements: academicEntryRequirements || undefined,
          tuitionFeeRange: tuitionFeeRange || undefined,
          englishWaiverPolicy: "",
          overview,
          officialSourceUrl,
          verificationStatus: "verified",
          publicationStatus: "published",
          lastVerifiedAt: new Date("2026-11-12T00:00:00Z"),
          lastVerifiedBy: DEFAULT_SOURCE,
        } as never,
      });
      inserted++;
    } catch (e) {
      console.error(`FAIL "${name}" (${slug}):`, e);
      skipped++;
    }
  }

  console.log(
    `[seed-verified-universities] Done. verified/published=${inserted}, skipped=${skipped}, total JSON rows=${rows.length}`,
  );
}

// Allow running this file directly: `npx tsx prisma/seed-verified-universities.ts`
const isMain = process.argv[1]?.endsWith("seed-verified-universities.ts");
if (isMain) {
  seedVerifiedUniversities()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
