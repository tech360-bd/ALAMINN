import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response; return ok(await db.socialKnowledgeSource.findMany({ orderBy: { updatedAt: "desc" }, take: 100 })); }
export async function POST(req: NextRequest) { const g = await requirePermission(req, "social.personality.manage"); if (g.denied) return g.response;
  const b = await readJson<Record<string, unknown>>(req); if (!b?.title || !b?.content) return fail("title + content required", ["missing"], 400);
  const k = await db.socialKnowledgeSource.create({ data: { title: String(b.title), category: String(b.category || "faq"), content: String(b.content).slice(0, 20000), approved: !!b.approved, profileId: (b.profileId as string) || null } });
  await writeAudit(g.session, "social_knowledge_saved", "SocialKnowledgeSource", k.id, { approved: k.approved }); return ok(k, "", {}, 201); }
