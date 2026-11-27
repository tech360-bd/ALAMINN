import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { canFetch } from "@/lib/higher-study/intelligence/robots";
import { ensureSourceRegistry } from "@/lib/higher-study/intelligence/pipeline";
import { isSourceLevel } from "@/lib/higher-study/intelligence/statuses";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Documented source registry (all configured sources). GET lists; POST registers/updates an org and re-checks robots.txt. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  await ensureSourceRegistry().catch(() => null);
  const orgs = await db.higherStudySourceOrg.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }] });
  return ok({ sources: orgs, levels: ["L1_OFFICIAL", "L2_DISCOVERY", "L3_CREDIBLE"], note: "Level 1 = official university/government sources (verification authority). Level 2 = discovery platforms (ApplyBoard Assist, Edvoy, AHZ Associates, IDP Education, MARGE). Level 3 = credible public sources. MARGE stays inactive until its exact source URL is confirmed by a human." });
}
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const b = await readJson<{ key?: string; name?: string; level?: string; baseUrl?: string | null; docsUrl?: string | null; permissionNote?: string; active?: boolean; robotsRecheck?: boolean }>(req);
  if (!b?.key || !b.name || !b.level || !isSourceLevel(b.level)) return fail("key, name and a valid level (L1_OFFICIAL|L2_DISCOVERY|L3_CREDIBLE) are required", ["invalid_source"], 400);
  let permissionState = "unknown";
  let robotsCheckedAt: Date | null = null;
  let permissionNote = b.permissionNote ?? null;
  if (b.baseUrl) {
    if (!/^https:\/\//.test(b.baseUrl)) return fail("baseUrl must be https", ["url_invalid"], 400);
    const decision = await canFetch(b.baseUrl);
    permissionState = decision.allowed ? "allowed" : "restricted";
    robotsCheckedAt = new Date();
    permissionNote = permissionNote ?? (decision.certainty === "unknown" ? "robots.txt unreachable — collection stays disabled until permissions are confirmed" : `robots.txt consulted (${decision.robotsUrl}); collection ${permissionState}`);
  }
  const org = await db.higherStudySourceOrg.upsert({
    where: { key: b.key },
    create: { key: b.key, name: b.name, level: b.level, baseUrl: b.baseUrl ?? null, docsUrl: b.docsUrl ?? null, permissionState, permissionNote, robotsCheckedAt, active: b.active ?? false },
    update: { name: b.name, level: b.level, ...(b.baseUrl !== undefined ? { baseUrl: b.baseUrl } : {}), ...(b.docsUrl !== undefined ? { docsUrl: b.docsUrl } : {}), ...(permissionNote !== undefined ? { permissionNote } : {}), ...(b.robotsRecheck || b.baseUrl !== undefined ? { permissionState, robotsCheckedAt } : {}), ...(b.active !== undefined ? { active: b.active } : {}) },
  });
  await writeAudit(g.session, "higher_study_intelligence_source_saved", "HigherStudySourceOrg", org.id, { key: org.key, level: org.level, permissionState: org.permissionState });
  return ok(org, "", {}, 201);
}
