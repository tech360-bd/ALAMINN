import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { fail, ok, readJson, writeAudit } from "@/lib/admin-api-server";
import {
  endorsementsPayloadSchema,
  sanitizeEndorsement,
  type LinkedInEndorsement,
} from "@/lib/endorsements";
import { getAdminEndorsements, saveEndorsements } from "@/lib/endorsements-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/endorsements
 * Returns every stored recommendation (including unconsented drafts) plus
 * the configured LinkedIn profile URL.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "endorsements.view");
  if (guard.denied) return guard.response;

  try {
    const data = await getAdminEndorsements();
    return ok(data, "Endorsements loaded.");
  } catch (err) {
    console.error("GET /api/v1/admin/endorsements:", err);
    return fail("Failed to load endorsements.", ["load_failed"], 500);
  }
}

/**
 * PUT /api/v1/admin/endorsements
 * Body: { profileUrl: string, items: LinkedInEndorsement[] }
 *
 * Replaces the full list. Validation is strict: quotes, names and URLs are
 * required, LinkedIn URLs must be https and on linkedin.com, and `consented`
 * must be explicitly true before an item can render publicly.
 */
export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "endorsements.update");
  if (guard.denied) return guard.response;

  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.", ["invalid_body"], 400);

  const parsed = endorsementsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "Invalid endorsement data.",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      400
    );
  }

  try {
    // Normalise text (strip control chars, cap length) and guarantee unique IDs.
    const seen = new Set<string>();
    const items: LinkedInEndorsement[] = [];
    for (const raw of parsed.data.items) {
      const item = sanitizeEndorsement(raw);
      if (seen.has(item.id)) item.id = `e_${Date.now().toString(36)}_${items.length}`;
      seen.add(item.id);
      items.push(item);
    }

    await saveEndorsements({ profileUrl: parsed.data.profileUrl, items });

    await writeAudit(guard.session, "endorsements.update", "Setting", undefined, {
      count: items.length,
      consented: items.filter((i) => i.consented).length,
      hasProfileUrl: Boolean(parsed.data.profileUrl),
    });

    return ok({ profileUrl: parsed.data.profileUrl, items }, "Endorsements saved.");
  } catch (err) {
    console.error("PUT /api/v1/admin/endorsements:", err);
    return fail("Failed to save endorsements.", ["save_failed"], 500);
  }
}
