import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { approvePublication } from "@/lib/higher-study/intelligence/publication";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/**
 * Publication approval gate: an entity's intelligence facts may be
 * approved for publication ONLY when every displayed fact is verified and
 * no open conflict remains. The gate is enforced server-side; blocked
 * approvals return the blockers and change nothing.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.publish");
  if (g.denied) return g.response;
  const b = await readJson<{ entityType?: string; entityId?: string; note?: string }>(req);
  if (!b?.entityType || !b.entityId || !["university", "course", "scholarship", "research-project", "supervisor"].includes(b.entityType)) return fail("entityType and entityId are required", ["invalid_entity"], 400);
  const result = await approvePublication(b.entityType, b.entityId, g.session.userId, b.note);
  if (!result.ok) return fail(result.error ?? "publication blocked", ["publication_blocked", ...(result.blockers ?? [])], 422);
  await writeAudit(g.session, "higher_study_intelligence_publication_approved", b.entityType, b.entityId, { note: b.note });
  return ok({ approved: true });
}
