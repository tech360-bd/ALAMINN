/**
 * Seed the University & Course Intelligence System (UCI) from the Phase-1
 * extraction dataset (scripts/audit/alo_dataset.json).
 *
 * Principles:
 *  - Every record keeps verbatim source fields + file/sheet/row provenance.
 *  - No value is invented; unknown stays unknown.
 *  - All internal-sheet records start at SOURCE_CHECK_REQUIRED.
 *  - Idempotent: wipes only UCI tables (UMC tables untouched).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { readFileSync } from "fs";

// Same driver-adapter pattern as the app (prisma.config.ts / src/lib/db.ts):
// the schema uses engine = "client", so every client needs the libsql adapter.
const rawUrl = process.env.DATABASE_URL || "file:./db/custom.db";
const url = rawUrl.startsWith("file:") && !require("path").isAbsolute(rawUrl.slice(5))
  ? `file:${require("path").resolve(rawUrl.slice(5))}`
  : rawUrl;
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url }) });

const DATASET = "/home/z/my-project/scripts/audit/alo_dataset.json";

const PRIORITY_27 = new Set([
  "University of Leicester", "University of East London", "Aston University",
  "Edinburgh Napier University", "Swansea University", "Teesside University",
  "Nottingham Trent University", "Liverpool Hope University", "Bangor University",
  "University of Hull", "Abertay University", "Cardiff Metropolitan University",
  "University of Gloucestershire", "University of the West of Scotland",
  "University of Portsmouth", "University of Liverpool", "University of Plymouth",
  "University of Bradford", "University of Salford", "University of Lincoln",
  "University of Derby", "Goldsmiths, University of London",
  "Queen Mary University of London", "University of Bath", "Anglia Ruskin University",
  "Heriot-Watt University", "Bath Spa University",
]);

const PATHWAY_HINT = /(pathway|international college|IC\/|ICP|BPC|HIC|KUIC|MMUIC|BCUIC|TCSU|UPIC|ICRGU|UA92|OIEG|UKIC|UBIC|ENUIC|QA Foundation|ARU COLLEGE|The College)/i;

function institutionType(name: string, _officialUrl: string | null): string {
  if (PATHWAY_HINT.test(name)) return "PATHWAY_PROVIDER";
  if (/universit/i.test(name)) return "UNIVERSITY";
  if (/college/i.test(name)) return "COLLEGE";
  if (/institute|academy|school|TAFE|SAE|KOI|SCEI|APIC|AIIHE|CIM/i.test(name)) return "INSTITUTE";
  return "OTHER";
}

interface Dataset {
  extracted_at: string;
  source_files: { key: string; file: string; role: string }[];
  institutions: Record<string, {
    canonical_name: string; as_written: string[]; country: string; cities: string[];
    official_urls: string[]; internal_links: string[]; sources: string[];
    record_count: number;
    requirement_records: {
      file: string; sheet: string; row: number; context?: string;
      fields: Record<string, string>; verification_status: string;
      collected_at: string; source_url?: string;
    }[];
  }>;
  programmes: {
    institution: string; country: string; level?: string; program_name: string;
    duration?: string; tuition?: string; extra: Record<string, string>;
    file: string; sheet: string; row: number;
  }[];
  issues: { type: string; [k: string]: unknown }[];
  priority27_coverage: {
    university: string; present_in_existing_data: boolean;
    ambiguous_namesake_note?: string | null; record_count: number; sheets: string[];
  }[];
  summary: Record<string, number | string[]>;
}

async function main() {
  const data: Dataset = JSON.parse(readFileSync(DATASET, "utf-8"));

  // idempotent: clear UCI only
  await db.uciAuditLog.deleteMany();
  await db.uciCollectionJob.deleteMany();
  await db.uciVerificationEvent.deleteMany();
  await db.uciProgramme.deleteMany();
  await db.uciRequirementRecord.deleteMany();
  await db.uciInstitution.deleteMany();
  await db.uciSource.deleteMany();

  // ── 1. Source registry ──────────────────────────────────────────────
  for (const sf of data.source_files) {
    await db.uciSource.create({
      data: {
        key: `internal_${sf.key}`,
        name: `ALO internal evidence — ${sf.file}`,
        url: null,
        level: "INTERNAL",
        identityStatus: "CONFIRMED",
        permissionNotes: "ALO Education's own operational spreadsheet; evidence of internal records, not an official university source.",
        robotsAllowed: null,
        notes: sf.role,
      },
    });
  }

  const officialRegistry: { key: string; name: string; url?: string | null; notes: string }[] = [
    { key: "official_university_pages", name: "Official university websites (course catalogues, admissions, fees, scholarships, English requirements)", notes: "Level 1 — primary authority. Verify every important fact here before publication. One source row per confirmed official URL is added automatically when discovered." },
    { key: "platform_applyboard", name: "ApplyBoard Assist", url: "https://applyboard.com", notes: "Level 2 — discovery of universities, programmes and advertised requirements. Never publish a Level-2 fact as officially confirmed without Level-1 verification." },
    { key: "platform_edvoy", name: "Edvoy", url: "https://edvoy.com", notes: "Level 2 — discovery source. Respect robots.txt and terms; no bulk copying of descriptions." },
    { key: "platform_ahz", name: "AHZ Associates", url: "https://ahzassociates.co.uk", notes: "Level 2 — discovery source." },
    { key: "platform_idp", name: "IDP Education", url: "https://www.idp.com", notes: "Level 2 — discovery source." },
    { key: "platform_marge", name: "MARGE", url: null, notes: "IDENTITY PENDING — the exact source URL must be confirmed before any collection is configured. No collection job may target MARGE until identity and permission are confirmed.", },
    { key: "public_gov_education", name: "Official government education sources (to be configured per country)", url: null, notes: "Level 3 — e.g. recognised qualification authorities. Configure exact URLs per destination before use." },
    { key: "public_research_dirs", name: "Recognised research databases / academic directories (to be configured)", url: null, notes: "Level 3 — use only where permitted and attributable." },
  ];
  for (const s of officialRegistry) {
    await db.uciSource.create({
      data: {
        key: s.key,
        name: s.name,
        url: s.url ?? null,
        level: s.key.startsWith("official") ? "OFFICIAL" : s.key.startsWith("platform") ? "PLATFORM" : "PUBLIC",
        identityStatus: s.key === "platform_marge" ? "PENDING_IDENTITY" : s.url ? "CONFIRMED" : "PENDING_IDENTITY",
        permissionNotes: s.notes,
      },
    });
  }

  // official URLs discovered inside the sheets → dedicated Level-1 source rows
  const officialUrlSources = new Map<string, string>(); // url -> source key
  let n = 0;
  for (const u of Object.values(data.institutions)) {
    for (const url of u.official_urls) {
      if (officialUrlSources.has(url)) continue;
      n += 1;
      const key = `official_discovered_${n}`;
      officialUrlSources.set(url, key);
      await db.uciSource.create({
        data: {
          key,
          name: `Official page captured with ALO records — ${url}`,
          url,
          level: "OFFICIAL",
          identityStatus: "CONFIRMED",
          permissionNotes: "Captured as the source reference recorded by ALO counsellors in the internal sheets. Verify page permission before scheduled monitoring.",
        },
      });
    }
  }

  // ── 2. Institutions ────────────────────────────────────────────────
  const instIdByName = new Map<string, string>();
  for (const u of Object.values(data.institutions)) {
    const official = u.official_urls[0] ?? null;
    const row = await db.uciInstitution.create({
      data: {
        canonicalName: u.canonical_name,
        asWritten: JSON.stringify(u.as_written),
        country: u.country,
        cityNotes: JSON.stringify(u.cities),
        institutionType: institutionType(u.canonical_name, official),
        priorityCohort: PRIORITY_27.has(u.canonical_name),
        officialWebsite: official,
        status: "DISCOVERED",
      },
    });
    instIdByName.set(u.canonical_name, row.id);
    for (const rec of u.requirement_records) {
      await db.uciRequirementRecord.create({
        data: {
          institutionId: row.id,
          context: rec.context ?? null,
          fieldsJson: JSON.stringify(rec.fields),
          sourceFile: rec.file,
          sheet: rec.sheet,
          rowNumber: rec.row,
          sourceUrl: rec.source_url ?? null,
          academicYear: rec.context?.match(/20\d\d/)?.[0] ?? null,
          verificationStatus: "SOURCE_CHECK_REQUIRED",
          collectedAt: new Date(),
        },
      });
    }
  }

  // ── 3. Programmes ──────────────────────────────────────────────────
  for (const p of data.programmes) {
    const instId = instIdByName.get(p.institution) ?? null;
    await db.uciProgramme.create({
      data: {
        institutionId: instId,
        institutionName: p.institution,
        country: p.country,
        level: p.level ?? null,
        programName: p.program_name,
        duration: p.duration ?? null,
        tuition: p.tuition ?? null,
        extraJson: JSON.stringify(p.extra),
        sourceFile: p.file,
        sheet: p.sheet,
        rowNumber: p.row,
        verificationStatus: "SOURCE_CHECK_REQUIRED",
      },
    });
  }

  // ── 4. Audit log ───────────────────────────────────────────────────
  await db.uciAuditLog.create({
    data: {
      actor: "system",
      action: "SEED",
      entity: "UCI",
      entityId: "dataset",
      detail: JSON.stringify({
        dataset_extracted_at: data.extracted_at,
        institutions: data.summary.unique_institutions,
        requirement_records: data.summary.total_requirement_records,
        programmes: data.summary.total_programme_records,
        conflicts_detected: data.summary.conflicting_information,
        priority27_covered: data.summary.priority27_with_existing_data,
      }),
    },
  });

  const counts = {
    sources: await db.uciSource.count(),
    institutions: await db.uciInstitution.count(),
    records: await db.uciRequirementRecord.count(),
    programmes: await db.uciProgramme.count(),
    priority: await db.uciInstitution.count({ where: { priorityCohort: true } }),
  };
  console.log("SEEDED:", JSON.stringify(counts));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
