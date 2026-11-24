/** CMS entries: list and create (always as draft). */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { isValidSlug } from "@/lib/cms/state";
import { snapshotRevision } from "@/lib/cms/revisions";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  slug: z.string().trim().toLowerCase(),
  title: z.string().trim().min(1).max(180),
  type: z.enum(["page", "article", "post"]).default("page"),
  summary: z.string().max(1000).default(""),
  body: z.string().max(200_000).default(""),
  category: z.string().max(100).default(""),
  tags: z.array(z.string().max(60)).max(30).default([]),
  seoTitle: z.string().max(180).optional(),
  seoDescription: z.string().max(320).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "articles.view");
  if (guard.denied) return guard.response;
  const status = req.nextUrl.searchParams.get("status");
  const type = req.nextUrl.searchParams.get("type");
  const entries = await db.cmsEntry.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    success: true, message: "CMS entries loaded.",
    data: { entries: entries.map((entry) => ({ ...entry, tags: safeTags(entry.tags) })) },
    meta: {}, errors: [],
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "articles.create");
  if (guard.denied) return guard.response;
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON.", data: null, meta: {}, errors: ["invalid_json"] }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success || !isValidSlug(parsed.data?.slug ?? "")) {
    return NextResponse.json({ success: false, message: "Invalid CMS entry or slug.", data: null, meta: {}, errors: ["invalid_request"] }, { status: 400 });
  }
  const exists = await db.cmsEntry.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) {
    return NextResponse.json({ success: false, message: "Slug already exists.", data: null, meta: {}, errors: ["slug_exists"] }, { status: 409 });
  }

  // AI-generated or manually created content always starts as a draft.
  const entry = await db.cmsEntry.create({
    data: {
      slug: parsed.data.slug,
      title: parsed.data.title,
      type: parsed.data.type,
      summary: parsed.data.summary,
      body: parsed.data.body,
      category: parsed.data.category,
      tags: JSON.stringify(parsed.data.tags),
      seoTitle: parsed.data.seoTitle,
      seoDescription: parsed.data.seoDescription,
      status: "draft",
      authorId: guard.session.userId,
    },
  });
  await snapshotRevision(entry, guard.session.userId);
  await writeAudit(guard.session, "cms_entry_created", "CmsEntry", entry.id, { slug: entry.slug, status: "draft" });
  return NextResponse.json({ success: true, message: "Draft created.", data: { entry }, meta: {}, errors: [] }, { status: 201 });
}

function safeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
