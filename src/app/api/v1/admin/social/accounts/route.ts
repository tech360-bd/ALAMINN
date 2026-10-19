import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { encryptToken } from "@/lib/social/crypto";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response;
  const rows = await db.socialAccount.findMany({ orderBy: { createdAt: "desc" } });
  return ok(rows.map((a) => ({ ...a, tokenEncrypted: undefined, hasToken: !!a.tokenEncrypted }))); }
export async function POST(req: NextRequest) { const g = await requirePermission(req, "social.accounts.manage"); if (g.denied) return g.response;
  const b = await readJson<Record<string, string>>(req); if (!b?.platform || !b?.externalId || !b?.displayName) return fail("platform, externalId, displayName required", ["missing_fields"], 400);
  const caps: Record<string, string[]> = { facebook: ["publish", "inbox", "comments"], whatsapp: ["inbox"], instagram: ["publish", "comments"], youtube: [], linkedin: [], tiktok: [] };
  const a = await db.socialAccount.create({ data: { platform: b.platform, externalId: b.externalId, displayName: b.displayName, username: b.username || null, status: b.accessToken ? "connected" : "disconnected", capabilities: JSON.stringify(caps[b.platform] ?? []), tokenEncrypted: b.accessToken ? encryptToken(b.accessToken) : null, tokenExpiresAt: b.tokenExpiresAt ? new Date(b.tokenExpiresAt) : null, automationEnabled: b.automationEnabled === "true", responseMode: b.responseMode || "approval", aiProfileId: b.aiProfileId || null } });
  await writeAudit(g.session, "social_account_connected", "SocialAccount", a.id, { platform: a.platform });
  return ok({ ...a, tokenEncrypted: undefined, hasToken: !!a.tokenEncrypted }, "Account saved. Tokens are stored encrypted and never returned.", {}, 201); }
