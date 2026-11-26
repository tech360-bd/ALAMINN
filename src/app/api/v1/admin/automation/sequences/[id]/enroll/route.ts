import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson } from "@/lib/admin-api-server";
import { enrollContact, type SequenceDb } from "@/lib/automation/sequences";

export const dynamic = "force-dynamic";

const enrollSchema = z.object({
  contactIds: z.array(z.string().min(1).max(80)).min(1).max(100),
});

/** POST /api/v1/admin/automation/sequences/[id]/enroll — enroll contacts into a sequence */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) return fail("Provide 1–100 contact IDs to enroll.", ["invalid_enroll"]);
  const results: Array<{ contactId: string; ok: boolean; message: string }> = [];
  for (const contactId of parsed.data.contactIds) {
    results.push({ contactId, ...(await enrollContact(db as unknown as SequenceDb, id, contactId)) });
  }
  const enrolled = results.filter((r) => r.ok).length;
  await writeAudit(guard.session, "automation.sequence.enroll", "AutomationSequence", id, {
    requested: results.length,
    enrolled,
  });
  return ok(results, `${enrolled} of ${results.length} contact(s) enrolled.`);
}
