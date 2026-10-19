import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response; return ok(await db.aiPersonalityProfile.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] })); }
export async function POST(req: NextRequest) { const g = await requirePermission(req, "social.personality.manage"); if (g.denied) return g.response;
  const b = await readJson<Record<string, unknown>>(req); if (!b?.name) return fail("name required", ["name_required"], 400);
  if (b.isDefault) await db.aiPersonalityProfile.updateMany({ data: { isDefault: false } });
  const p = await db.aiPersonalityProfile.create({ data: { name: String(b.name), isDefault: !!b.isDefault, identity: (b.identity as string) || null, brandContext: (b.brandContext as string) || null, languages: (b.languages as string) || "en,bn", formality: Number(b.formality ?? 3), friendliness: Number(b.friendliness ?? 4), greeting: (b.greeting as string) || null, signOff: (b.signOff as string) || null, sentenceStyle: (b.sentenceStyle as string) || null, preferredPhrases: (b.preferredPhrases as string) || null, avoidPhrases: (b.avoidPhrases as string) || null, servicePrinciples: (b.servicePrinciples as string) || null, faqs: (b.faqs as string) || null, businessHours: (b.businessHours as string) || null, escalationContact: (b.escalationContact as string) || null, platformStyles: (b.platformStyles as string) || null, neverAnswerTopics: (b.neverAnswerTopics as string) || null, examplePairs: (b.examplePairs as string) || null } });
  await writeAudit(g.session, "social_personality_saved", "AiPersonalityProfile", p.id, {}); return ok(p, "Personality profile saved.", {}, 201); }
export async function PUT(req: NextRequest) { const g = await requirePermission(req, "social.personality.manage"); if (g.denied) return g.response;
  const b = await readJson<Record<string, unknown>>(req); if (!b?.id) return fail("id required", ["id_required"], 400);
  if (b.isDefault) await db.aiPersonalityProfile.updateMany({ where: { id: { not: String(b.id) } }, data: { isDefault: false } });
  const { id, ...rest } = b as Record<string, unknown> & { id: string };
  const p = await db.aiPersonalityProfile.update({ where: { id: String(id) }, data: rest as never });
  await writeAudit(g.session, "social_personality_saved", "AiPersonalityProfile", p.id, {}); return ok(p); }
