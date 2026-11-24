/** Restore a CMS revision as a new draft (never auto-publish). */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { snapshotRevision } from "@/lib/cms/revisions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; revisionId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requirePermission(req, "articles.update");
  if (guard.denied) return guard.response;
  const { id, revisionId } = await ctx.params;

  const [entry, revision] = await Promise.all([
    db.cmsEntry.findUnique({ where: { id } }),
    db.cmsRevision.findFirst({ where: { id: revisionId, entryId: id } }),
  ]);
  if (!entry || !revision) {
    return NextResponse.json({ success: false, message: "Entry or revision not found.", data: null, meta: {}, errors: ["not_found"] }, { status: 404 });
  }

  const restored = await db.cmsEntry.update({
    where: { id },
    data: {
      title: revision.title,
      summary: revision.summary,
      body: revision.body,
      seoTitle: revision.seoTitle,
      seoDescription: revision.seoDescription,
      status: "draft",
      publishedAt: null,
      reviewerId: null,
    },
  });
  await snapshotRevision(restored, guard.session.userId);
  await writeAudit(guard.session, "cms_revision_restored", "CmsEntry", id, {
    revisionId,
    revisionNumber: revision.revisionNumber,
    status: "draft",
  });
  return NextResponse.json({ success: true, message: `Revision ${revision.revisionNumber} restored as a draft.`, data: { entry: restored }, meta: {}, errors: [] });
}
