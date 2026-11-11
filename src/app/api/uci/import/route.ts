import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";


/** Minimal CSV parser handling quoted cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/**
 * POST /api/uci/import — validated bulk import with duplicate protection.
 * RBAC: import.run (ADMIN, EDITOR).
 * Accepts JSON body { entity, csv } OR multipart/form-data with a `file`
 * field (.csv) plus `entity`. Duplicate protection:
 *  - institutions: skipped when canonical_name already exists
 *  - programmes: skipped when same institution+program_name+level exists
 * Every imported record enters at SOURCE_CHECK_REQUIRED — never approved.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(session.role, "import.run")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  let entity = "";
  let csv = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
    entity = String(form.get("entity") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file field is required" }, { status: 400 });
    if (file.size > 5_000_000) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
    csv = await file.text();
  } else {
    const body = (await req.json().catch(() => null)) as { entity?: string; csv?: string } | null;
    entity = body?.entity ?? "";
    csv = body?.csv ?? "";
  }
  if (!csv || !entity) {
    return NextResponse.json({ error: "entity and csv are required" }, { status: 400 });
  }
  const rows = parseCsv(csv);
  if (rows.length < 2) return NextResponse.json({ error: "CSV needs a header and at least one data row" }, { status: 400 });
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  if (idx("canonical_name") < 0 && idx("institution") < 0) {
    return NextResponse.json({ error: "CSV must contain a canonical_name (institutions) or institution (programmes) column" }, { status: 400 });
  }

  const report = { received: rows.length - 1, imported: 0, skipped_duplicates: 0, skipped_invalid: 0, errors: [] as string[] };

  if (entity === "institutions") {
    for (const r of rows.slice(1)) {
      const name = r[idx("canonical_name")]?.trim();
      const country = r[idx("country")]?.trim();
      if (!name || !country) { report.skipped_invalid += 1; continue; }
      const exists = await db.uciInstitution.findFirst({ where: { canonicalName: name } });
      if (exists) { report.skipped_duplicates += 1; continue; }
      await db.uciInstitution.create({
        data: {
          canonicalName: name,
          country,
          institutionType: r[idx("institution_type")]?.trim() || "UNKNOWN",
          officialWebsite: r[idx("official_website")]?.trim() || null,
          asWritten: JSON.stringify([name]),
          cityNotes: JSON.stringify([]),
          status: "DISCOVERED",
        },
      });
      report.imported += 1;
    }
  } else {
    for (const r of rows.slice(1)) {
      const inst = r[idx("institution")]?.trim();
      const prog = r[idx("program_name")]?.trim();
      if (!inst || !prog) { report.skipped_invalid += 1; continue; }
      const instRow = await db.uciInstitution.findFirst({ where: { canonicalName: inst } });
      const dupe = await db.uciProgramme.findFirst({
        where: { institutionName: inst, programName: prog, level: r[idx("level")]?.trim() || null },
      });
      if (dupe) { report.skipped_duplicates += 1; continue; }
      await db.uciProgramme.create({
        data: {
          institutionId: instRow?.id ?? null,
          institutionName: inst,
          country: r[idx("country")]?.trim() || "Unknown",
          level: r[idx("level")]?.trim() || null,
          programName: prog,
          duration: r[idx("duration")]?.trim() || null,
          tuition: r[idx("tuition")]?.trim() || null,
          sourceFile: "manual_import",
          sheet: "csv",
          rowNumber: report.imported + 1,
          verificationStatus: "SOURCE_CHECK_REQUIRED",
        },
      });
      report.imported += 1;
    }
  }

  await db.uciAuditLog.create({
    data: {
      actor: session.email,
      action: "IMPORT",
      entity,
      entityId: "csv",
      detail: JSON.stringify(report),
    },
  });
  return NextResponse.json({ ok: true, report });
}
