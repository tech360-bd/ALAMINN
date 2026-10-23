import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { encryptToken, decryptToken } from "@/lib/social/crypto";
import { getAdapter } from "@/lib/social/adapters";
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "social.accounts.manage"); if (g.denied) return g.response; const { id } = await ctx.params;
  const b = await readJson<Record<string, unknown>>(req); if (!b) return fail("Invalid JSON", ["invalid_json"], 400);
  const data: Record<string, unknown> = {};
  for (const k of ["displayName", "username", "automationEnabled", "responseMode", "aiProfileId"]) if (k in b) data[k] = b[k];
  if (typeof b.accessToken === "string" && b.accessToken) { data.tokenEncrypted = encryptToken(b.accessToken); data.status = "connected"; }
  if (b.disconnect === true) { data.status = "disconnected"; data.automationEnabled = false; }
  if (b.test === true) { const acc = await db.socialAccount.findUnique({ where: { id } }); if (!acc) return fail("Not found", ["not_found"], 404); const h = await getAdapter(acc.platform).health(acc); await db.socialAccount.update({ where: { id }, data: { lastHealthAt: new Date(), healthError: h.error, status: h.ok ? "connected" : acc.status } }); return ok({ healthy: h.ok, error: h.error }); }
  const a = await db.socialAccount.update({ where: { id }, data });
  await writeAudit(g.session, b.disconnect === true ? "social_account_disconnected" : "social_account_updated", "SocialAccount", id, {});
  return ok({ ...a, tokenEncrypted: undefined, hasToken: !!a.tokenEncrypted }); }
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "social.accounts.manage"); if (g.denied) return g.response; const { id } = await ctx.params; await db.socialAccount.delete({ where: { id } }); await writeAudit(g.session, "social_account_deleted", "SocialAccount", id, {}); return ok({ deleted: true }); }
