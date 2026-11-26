import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit } from "@/lib/admin-api-server";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/admin/api-keys/[id] — revoke a key (soft; audit retained) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.apiKey.findUnique({ where: { id } });
  if (!existing) return fail("API key not found.", ["not_found"], 404);
  await db.apiKey.update({ where: { id }, data: { status: "revoked" } });
  await writeAudit(guard.session, "api_key.revoke", "ApiKey", id, { name: existing.name });
  return ok({ id, status: "revoked" }, "API key revoked. Requests using it now fail with 401.");
}
