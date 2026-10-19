import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response;
  const [contents, campaigns] = await Promise.all([db.socialContent.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { targets: { include: { account: { select: { displayName: true, platform: true } } } } } }), db.socialCampaign.findMany({ orderBy: { createdAt: "desc" } })]); return ok({ contents, campaigns }); }
export async function POST(req: NextRequest) { const g = await requirePermission(req, "social.content.manage"); if (g.denied) return g.response;
  const b = await readJson<Record<string, unknown>>(req);
  if (b?.campaign === true) { if (!b.name) return fail("name required", ["name_required"], 400); const c = await db.socialCampaign.create({ data: { name: String(b.name), objective: (b.objective as string) || null, pillar: (b.pillar as string) || null, audience: (b.audience as string) || null, status: String(b.status || "draft") } }); return ok(c, "", {}, 201); }
  if (!b?.title || !b?.body) return fail("title + body required", ["missing"], 400);
  const c = await db.socialContent.create({ data: { title: String(b.title), body: String(b.body), campaignId: (b.campaignId as string) || null, variants: (b.variants as string) || null, hashtags: (b.hashtags as string) || null, cta: (b.cta as string) || null, mediaUrls: (b.mediaUrls as string) || null, language: String(b.language || "en"), status: String(b.status || "draft"), scheduledAt: b.scheduledAt ? new Date(String(b.scheduledAt)) : null, createdById: g.session.userId, approvedById: b.status === "approved" || b.status === "scheduled" ? g.session.userId : null } });
  const accountIds = Array.isArray(b.accountIds) ? (b.accountIds as string[]) : [];
  for (const aid of accountIds) await db.socialContentTarget.create({ data: { contentId: c.id, accountId: aid } }).catch(() => null);
  await writeAudit(g.session, "social_content_saved", "SocialContent", c.id, { status: c.status }); return ok(c, "", {}, 201); }
