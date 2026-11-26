import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, checkAdminRateLimit } from "@/lib/admin-api-server";
import { runMergeContacts, mergeSchema } from "@/lib/crm/duplicate-merge";
import { emitWebhookEvent } from "@/lib/api-platform/webhooks";

export const dynamic = "force-dynamic";

/** POST /api/v1/admin/contacts/merge — merge a duplicate contact into a master record */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  if (!checkAdminRateLimit(`contacts-merge:${guard.session.userId}`, 20).allowed) {
    return fail("Too many merges. Wait a minute and try again.", ["rate_limited"], 429);
  }
  const body = await req.json().catch(() => null);
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid merge request.", ["invalid_merge"]);
  const result = await runMergeContacts(db, parsed.data, guard.session.userId);
  if (!result.ok) return fail(result.message, ["merge_failed"], 400);
  await writeAudit(guard.session, "contacts.merge", "Contact", result.masterId as string, {
    duplicateId: parsed.data.duplicateId,
    moved: result.movedCounts,
  });
  await emitWebhookEvent("contact.merged", {
    masterId: result.masterId,
    duplicateId: parsed.data.duplicateId,
    movedCounts: result.movedCounts,
  }).catch(() => undefined);
  return ok(result, result.message);
}
