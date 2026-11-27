import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, pagination } from "@/lib/admin-api-server";
import { findDuplicateContacts } from "@/lib/crm/lead-hygiene";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/contacts/duplicates — scan the contact list for
 * duplicate groups (shared normalized email or last-10-digit phone key).
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const contacts = await db.contact.findMany({
    select: { id: true, fullName: true, email: true, phone: true },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
  const groups: Array<Array<{ id: string; fullName: string; email: string; phone: string | null; matchOn: Array<"email" | "phone"> }>> = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    if (seen.has(contact.id)) continue;
    const matches = await findDuplicateContacts(db, { email: contact.email, phone: contact.phone });
    const group = [{ ...contact, matchOn: [] as Array<"email" | "phone"> }, ...matches.map((m) => ({ ...m, matchOn: m.matchOn }))];
    if (matches.length > 0) {
      for (const member of group) seen.add(member.id);
      groups.push(group);
    }
  }
  return ok(groups, "Duplicate scan finished for the requested page.", { page, pageSize, groups: groups.length, scanned: contacts.length });
}
