/** CMS entry detail: content updates create immutable revisions. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { snapshotRevision } from "@/lib/cms/revisions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  summary: z.string().max(1000).optional(),
  body: z.string().max(200_000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  seoTitle: z.string().max(180).nullable().optional(),
  seoDescription: z.string().max(320).nullable().optional(),
});

function denied(message: string, errors: string[], status: number) {
  return NextResponse.json({ success: false, message, data: null, meta: {}, errors }, { status });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "articles.view");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const entry = await db.cmsEntry.findUnique({ where: { id } });
  if (!entry) return denied("Entry not found.", ["not_found"], 404);
  const revisions = await db.cmsRevision.findMany({
    where: { entryId: id },
    orderBy: { revisionNumber: "desc" },
    take: 50,
  });
  return NextResponse.json({ success: true, message: "Entry loaded.", data: { entry, revisions }, meta: {}, errors: [] });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "articles.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.cmsEntry.findUnique({ where: { id } });
  if (!existing) return denied("Entry not found.", ["not_found"], 404);
  if (existing.status === "published") {
    return denied("Published content must be archived before editing.", ["published_locked"], 409);
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { return denied("Invalid JSON.", ["invalid_json"], 400); }
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) return denied("Invalid update.", ["invalid_request"], 400);

  const data = parsed.data;
  const updated = await db.cmsEntry.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.tags ? { tags: JSON.stringify(data.tags) } : {}),
      ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle } : {}),
      ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription } : {}),
    },
  });
  await snapshotRevision(updated, guard.session.userId);
  await writeAudit(guard.session, "cms_entry_updated", "CmsEntry", id, { status: updated.status });
  return NextResponse.json({ success: true, message: "Draft updated.", data: { entry: updated }, meta: {}, errors: [] });
}
