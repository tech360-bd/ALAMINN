import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson, pagination } from "@/lib/admin-api-server";
import { apiKeyCreateSchema, generateApiKey, ALL_SCOPES } from "@/lib/api-platform/keys";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/api-keys — list keys (masked; raw keys are never stored) */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const [items, total] = await Promise.all([
    db.apiKey.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
    db.apiKey.count(),
  ]);
  return ok(items, "API keys loaded.", {
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    availableScopes: ALL_SCOPES,
  });
}

/** POST /api/v1/admin/api-keys — create a key (raw key shown exactly once) */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = apiKeyCreateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid API key request.", ["invalid_api_key"]);
  const { rawKey, prefix, hashedKey } = generateApiKey();
  const created = await db.apiKey.create({
    data: {
      name: parsed.data.name,
      prefix,
      hashedKey,
      scopes: JSON.stringify(parsed.data.scopes),
      status: "active",
      rateLimitPerMin: parsed.data.rateLimitPerMin,
      createdBy: guard.session.userId,
    },
  });
  await writeAudit(guard.session, "api_key.create", "ApiKey", created.id, { name: created.name, scopes: parsed.data.scopes });
  return ok(
    { ...created, hashedKey: undefined, rawKey },
    "API key created. Copy the key now — it is shown only this once and cannot be recovered.",
    {},
    201
  );
}
