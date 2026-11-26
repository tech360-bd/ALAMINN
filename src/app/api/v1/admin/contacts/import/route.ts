import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, checkAdminRateLimit } from "@/lib/admin-api-server";
import { runContactImport, importOptionsSchema, type ContactImportDb } from "@/lib/crm/csv-import";
import { fireAutomationEvent, contactEventFields } from "@/lib/automation/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/contacts/import — run a CSV import.
 * Dedupes by email/phone (same matcher as manual creation), scores
 * every created contact, and returns a per-row report.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.create");
  if (guard.denied) return guard.response;
  if (!checkAdminRateLimit(`contacts-import:${guard.session.userId}`, 5).allowed) {
    return fail("Too many imports. Wait a minute and try again.", ["rate_limited"], 429);
  }
  const parsed = importOptionsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid import request.", ["invalid_import"]);
  try {
    const summary = await runContactImport(db as unknown as ContactImportDb, parsed.data);
    await writeAudit(guard.session, "contacts.import", "ContactImportJob", summary.jobId, {
      total: summary.totalRows, created: summary.createdRows, updated: summary.updatedRows,
      duplicates: summary.duplicateRows, skipped: summary.skippedRows,
    });
    // Fire automation for rows that were created (bounded — the report carries IDs).
    const created = summary.report.filter((r) => r.outcome === "created" && r.contactId).slice(0, 25);
    for (const row of created) {
      const contact = await db.contact.findUnique({ where: { id: row.contactId as string } }).catch(() => null);
      if (contact) {
        await fireAutomationEvent({
          trigger: "contact.created",
          contactId: contact.id,
          fields: contactEventFields(contact),
          actorId: guard.session.userId,
        }).catch(() => undefined);
      }
    }
    return ok(summary, `Import finished: ${summary.createdRows} created, ${summary.updatedRows} updated, ${summary.duplicateRows} duplicates skipped, ${summary.skippedRows} invalid.`);
  } catch (e) {
    return fail((e as Error).message || "Import failed.", ["import_failed"], 400);
  }
}
