import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { retrieveApprovedKnowledge, generateSocialReply } from "@/lib/social/personality";
import { classifyMessage } from "@/lib/social/classifier";
export async function POST(req: NextRequest) { const g = await requirePermission(req, "social.personality.manage"); if (g.denied) return g.response;
  const b = await readJson<{ message?: string; platform?: string; profileId?: string }>(req); if (!b?.message) return fail("message required", ["message_required"], 400);
  const profile = b.profileId ? await db.aiPersonalityProfile.findUnique({ where: { id: b.profileId } }) : await db.aiPersonalityProfile.findFirst({ where: { isDefault: true } });
  const knowledge = await retrieveApprovedKnowledge(b.message);
  const cls = classifyMessage(b.message);
  const r = await generateSocialReply({ profile, platform: b.platform || "facebook", message: b.message, knowledge });
  return ok({ reply: r.text, modelUsed: r.modelUsed, classification: cls, knowledgeRefs: knowledge.map((k) => k.title), note: "Test console — nothing was sent." }); }
