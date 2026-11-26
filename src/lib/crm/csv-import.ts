/**
 * CSV import — RFC 4180 parser + dedupe-aware contact import runner.
 * --------------------------------------------------------------------
 * Reuses the lead-hygiene duplicate matcher (email exact + phone
 * last-10) and lead scoring so imported contacts are deduped and
 * scored exactly like contacts created through the admin UI.
 *
 * HONESTY: the report records, per row, what actually happened
 * (created / updated / skipped_duplicate / skipped_invalid) — nothing
 * is silently swallowed.
 */

import { z } from "zod";
import {
  findDuplicateContacts,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
  scoreContact,
  type ContactScoringInput,
} from "./lead-hygiene";
import { readCustomValues, validateCustomValues, type CustomFieldDef } from "./custom-fields";

// ─── CSV parsing (RFC 4180) ─────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Parse CSV text (RFC 4180: quoted cells, doubled quotes, CRLF). */
export function parseCsv(text: string): ParsedCsv {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ""); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      out.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  // Drop fully-empty trailing rows (common with trailing newlines).
  const records = out.filter((r) => r.some((c) => c.trim() !== ""));
  if (!records.length) return { headers: [], rows: [] };
  return { headers: records[0].map((h) => h.trim()), rows: records.slice(1) };
}

// ─── Header mapping ─────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, keyof ContactImportRow> = {
  name: "fullName", full_name: "fullName", fullname: "fullName", "full name": "fullName",
  "first name": "fullName", firstname: "fullName",
  email: "email", "e-mail": "email", email_address: "email", "email address": "email",
  phone: "phone", mobile: "phone", "phone number": "phone", phone_number: "phone", whatsapp: "whatsapp",
  organization: "organization", company: "organization", organisation: "organization",
  role: "role", title: "role", job_title: "role", "job title": "role",
  country: "country", city: "city",
  preferred_channel: "preferredChannel", "preferred channel": "preferredChannel", channel: "preferredChannel",
  tags: "tags", tag: "tags", status: "status", source: "source",
};

export type ContactImportRow = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  organization?: string | null;
  role?: string | null;
  country?: string | null;
  city?: string | null;
  preferredChannel?: string | null;
  tags?: string | null;
  status?: string | null;
  source?: string | null;
};

/** Map CSV headers to contact fields automatically (normalized alias match). */
export function autoMapHeaders(headers: string[]): Record<number, keyof ContactImportRow> {
  const map: Record<number, keyof ContactImportRow> = {};
  headers.forEach((h, idx) => {
    const norm = h.trim().toLowerCase();
    const target = HEADER_ALIASES[norm];
    if (target && !Object.values(map).includes(target)) map[idx] = target;
  });
  return map;
}

/** Apply the auto-map + optional explicit overrides to one raw CSV row. */
export function rowToContact(
  headers: string[],
  cells: string[],
  autoMap: Record<number, keyof ContactImportRow>,
  explicit?: Record<string, string> // csvHeader → contact field
): ContactImportRow {
  const out: ContactImportRow = {};
  const explicitNorm = new Map<string, keyof ContactImportRow>();
  if (explicit) {
    for (const [header, field] of Object.entries(explicit)) {
      const f = field as keyof ContactImportRow;
      if (ALLOWED_ROW_FIELDS.includes(f)) explicitNorm.set(header.trim().toLowerCase(), f);
    }
  }
  const used = new Set<keyof ContactImportRow>();
  headers.forEach((h, idx) => {
    const headerNorm = h.trim().toLowerCase();
    let target = explicitNorm.get(headerNorm) ?? null;
    if (!target) target = autoMap[idx] ?? null;
    if (!target || used.has(target)) return;
    const value = (cells[idx] ?? "").trim();
    if (value) {
      out[target] = value.slice(0, 500);
      used.add(target);
    }
  });
  return out;
}

export const ALLOWED_ROW_FIELDS: (keyof ContactImportRow)[] = [
  "fullName", "email", "phone", "whatsapp", "organization", "role",
  "country", "city", "preferredChannel", "tags", "status", "source",
];

const VALID_STATUSES = ["active", "nurturing", "converted", "archived"];
const VALID_CHANNELS = ["email", "phone", "whatsapp"];

// ─── Import job runner ──────────────────────────────────────────────────────

export const importOptionsSchema = z.object({
  csv: z.string().min(1).max(2_000_000), // ~2 MB of CSV text
  filename: z.string().trim().min(1).max(200).default("import.csv"),
  strategy: z.enum(["upsert", "skip_duplicates"]).default("upsert"),
  source: z.string().trim().max(120).optional(),
  mapping: z.record(z.string(), z.string()).optional(), // csvHeader → contact field
  allowDuplicateEmails: z.boolean().default(false),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export interface ImportRowResult {
  row: number;
  email: string | null;
  outcome: "created" | "updated" | "skipped_duplicate" | "skipped_invalid" | "error";
  contactId?: string;
  detail?: string;
}

export interface ImportSummary {
  jobId: string;
  status: "completed" | "failed";
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  duplicateRows: number;
  errors: string[];
  report: ImportRowResult[]; // bounded to the first 200 rows
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_REPORT_ROWS = 200;

/** Minimal structural seam over the Prisma pieces the importer needs. */
export interface ContactImportDb {
  contact: {
    findMany(args?: { where?: { email?: string; phone?: { endsWith?: string }; id?: { not?: string } } }): Promise<
      Array<{ id: string; fullName: string; email: string; phone: string | null }>
    >;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  customField?: {
    findMany(args?: { where?: { entity?: string; status?: string } }): Promise<CustomFieldDef[]>;
  };
  contactImportJob: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

/** Score input assembled from an import row (mirrors admin create flow: a brand-new contact has no inquiries/opportunities yet). */
function scoreInputFor(row: ContactImportRow): ContactScoringInput {
  const email = normalizeEmailForMatch(row.email);
  const phone = normalizePhoneForMatch(row.phone);
  const channel = row.preferredChannel && VALID_CHANNELS.includes(row.preferredChannel) ? row.preferredChannel : null;
  return {
    hasEmail: !!email,
    hasPhone: !!phone,
    hasWhatsapp: !!(row.whatsapp ?? "").trim(),
    preferredChannel: channel,
    hasSource: !!(row.source ?? "").trim(),
    hasOrganization: !!(row.organization ?? "").trim(),
    inquiryCount: 0,
    opportunityCount: 0,
    hasActiveOpportunity: false,
  };
}

/**
 * Run a contact import. Returns the final job summary; the job row is
 * persisted first (running) and updated at the end (completed/failed).
 */
export async function runContactImport(
  db: ContactImportDb,
  raw: unknown
): Promise<ImportSummary> {
  const parsedOptions = importOptionsSchema.safeParse(raw ?? {});
  if (!parsedOptions.success) {
    throw new Error(parsedOptions.error.issues[0]?.message || "Invalid import options.");
  }
  const options = parsedOptions.data;
  const { headers, rows } = parseCsv(options.csv);
  if (!headers.length) throw new Error("The CSV file has no header row.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`CSV has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS}.`);

  const autoMap = autoMapHeaders(headers);
  const customDefs = (await db.customField?.findMany({ where: { entity: "contact", status: "active" } })) ?? [];

  const job = await db.contactImportJob.create({
    data: {
      filename: options.filename,
      status: "running",
      totalRows: rows.length,
      mapping: JSON.stringify({ auto: autoMap, explicit: options.mapping ?? {} }),
    },
  });

  const summary: ImportSummary = {
    jobId: job.id, status: "completed", totalRows: rows.length,
    createdRows: 0, updatedRows: 0, skippedRows: 0, duplicateRows: 0, errors: [], report: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const contact = rowToContact(headers, cells, autoMap, options.mapping);
    const email = normalizeEmailForMatch(contact.email);
    const rowResult: ImportRowResult = { row: i + 2, email: contact.email ?? null, outcome: "error" };

    try {
      if (!email) {
        rowResult.outcome = "skipped_invalid";
        rowResult.detail = "A valid email is required to import a contact (email is the contact identity in this CRM).";
        summary.skippedRows++;
      } else {
        const duplicates = await findDuplicateContacts(db, {
          email: contact.email, phone: contact.phone,
        });
        const emailMatch = duplicates.find((d) => d.matchOn.includes("email"));
        const otherMatch = duplicates.length ? duplicates[0] : null;
        const canUpdate = emailMatch && options.strategy === "upsert" && !options.allowDuplicateEmails;
        const isDuplicate = duplicates.length > 0 && !options.allowDuplicateEmails && !canUpdate;

        if (isDuplicate) {
          rowResult.outcome = "skipped_duplicate";
          rowResult.contactId = otherMatch?.id ?? emailMatch?.id;
          rowResult.detail = `Duplicate of existing contact (matched on ${(emailMatch ?? otherMatch)?.matchOn.join(" + ")}).`;
          summary.duplicateRows++;
        } else if (canUpdate) {
          const data: Record<string, unknown> = { updatedAt: new Date() };
          if (contact.fullName) data.fullName = contact.fullName.slice(0, 500);
          if (contact.phone) data.phone = contact.phone.slice(0, 500);
          if (contact.whatsapp) data.whatsapp = contact.whatsapp.slice(0, 500);
          if (contact.organization) data.organization = contact.organization.slice(0, 500);
          if (contact.role) data.role = contact.role.slice(0, 191);
          if (contact.country) data.country = contact.country.slice(0, 500);
          if (contact.city) data.city = contact.city.slice(0, 500);
          if (contact.preferredChannel && VALID_CHANNELS.includes(contact.preferredChannel)) data.preferredChannel = contact.preferredChannel;
          if (contact.tags) data.tags = contact.tags.slice(0, 500);
          const updated = await db.contact.update({ where: { id: emailMatch.id }, data });
          rowResult.outcome = "updated";
          rowResult.contactId = updated.id;
          rowResult.detail = `Updated existing contact matched on email.`;
          summary.updatedRows++;
        } else {
          const score = scoreContact(scoreInputFor(contact));
          const customValues = customDefs.length ? customValuesFromRow(headers, cells, customDefs) : null;
          const data: Record<string, unknown> = {
            fullName: (contact.fullName ?? "").slice(0, 500),
            email: contact.email ?? "",
            phone: contact.phone ?? null,
            whatsapp: contact.whatsapp ?? null,
            organization: contact.organization ?? null,
            role: contact.role ?? null,
            country: contact.country ?? null,
            city: contact.city ?? null,
            preferredChannel: contact.preferredChannel && VALID_CHANNELS.includes(contact.preferredChannel) ? contact.preferredChannel : null,
            tags: contact.tags ?? null,
            status: contact.status && VALID_STATUSES.includes(contact.status) ? contact.status : "active",
            source: options.source ?? contact.source ?? "csv-import",
            leadScore: score.score,
            leadScoreGrade: score.grade,
            leadScoreSignals: JSON.stringify(score.signals),
            leadScoreUpdatedAt: new Date(),
          };
          if (customValues && Object.keys(customValues).length) {
            data.customFields = JSON.stringify(customValues);
          }
          const created = await db.contact.create({ data });
          rowResult.outcome = "created";
          rowResult.contactId = created.id;
          rowResult.detail = `Created with lead score ${score.score} (${score.grade}).`;
          summary.createdRows++;
        }
      }
    } catch (e) {
      rowResult.outcome = "error";
      rowResult.detail = (e as Error).message?.slice(0, 300) ?? "Unknown import error.";
      summary.errors.push(`Row ${rowResult.row}: ${rowResult.detail}`);
    }
    if (summary.report.length < MAX_REPORT_ROWS) summary.report.push(rowResult);
  }

  if (summary.errors.length > 50) {
    summary.status = "failed";
  }

  await db.contactImportJob.update({
    where: { id: job.id },
    data: {
      status: summary.status,
      totalRows: summary.totalRows,
      createdRows: summary.createdRows,
      updatedRows: summary.updatedRows,
      skippedRows: summary.skippedRows,
      duplicateRows: summary.duplicateRows,
      report: JSON.stringify(summary.report),
      errors: JSON.stringify(summary.errors.slice(0, 100)),
      finishedAt: new Date(),
    },
  });

  return summary;
}

/**
 * Merge custom-field-shaped headers (keys matching active CustomField
 * definitions) out of a CSV row into a custom values object.
 */
export function customValuesFromRow(
  headers: string[],
  cells: string[],
  defs: CustomFieldDef[]
): Record<string, unknown> | null {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const raw: Record<string, unknown> = {};
  headers.forEach((h, idx) => {
    const key = h.trim().toLowerCase();
    if (byKey.has(key)) {
      const value = (cells[idx] ?? "").trim();
      if (value) raw[key] = value;
    }
  });
  if (!Object.keys(raw).length) return null;
  try {
    const { values, dropped } = validateCustomValues(defs, raw);
    if (dropped.length) return null; // dropped keys mean header/def drift — do not partially import
    return values;
  } catch {
    return null; // invalid value for its definition — skip the custom fields for this row
  }
}

/** Re-export for routes that need the stored-blob reader. */
export { readCustomValues };
