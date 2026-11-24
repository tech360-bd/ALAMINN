/** CMS state transitions with role-gated publishing and audit logging. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { canTransition } from "@/lib/cms/state";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const StatusSchema = z.object({ status: z.enum(["review", "approved", "published", "archived", "draft"]) });

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON.", data: null, meta: {}, errors: ["invalid_json"] }, { status: 400 });
  }
  const parsed = StatusSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid status.", data: null, meta: {}, errors: ["invalid_request"] }, { status: 400 });
  }

  const requiredPermission =
    parsed.data.status === "published" ? "articles.publish" : "articles.update";
  const guard = await requirePermission(req, requiredPermission);
  if (guard.denied) return guard.response;

  const entry = await db.cmsEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ success: false, message: "Entry not found.", data: null, meta: {}, errors: ["not_found"] }, { status: 404 });
  }
  if (!canTransition(entry.status, parsed.data.status)) {
    return NextResponse.json(
      { success: false, message: `Cannot move from ${entry.status} to ${parsed.data.status}.`, data: null, meta: {}, errors: ["invalid_transition"] },
      { status: 409 }
    );
  }

  const updated = await db.cmsEntry.update({
    where: { id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.status === "published"
        ? { publishedAt: new Date(), reviewerId: guard.session.userId }
        : {}),
      ...(parsed.data.status === "approved" ? { reviewerId: guard.session.userId } : {}),
    },
  });
  await writeAudit(guard.session, "cms_status_changed", "CmsEntry", id, {
    from: entry.status,
    to: updated.status,
  });
  return NextResponse.json({ success: true, message: `Status changed to ${updated.status}.`, data: { entry: updated }, meta: {}, errors: [] });
}
