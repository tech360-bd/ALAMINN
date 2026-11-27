import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson } from "@/lib/admin-api-server";
import { validateFieldDefinition, CUSTOM_FIELD_ENTITIES } from "@/lib/crm/custom-fields";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/custom-fields — list definitions (entity filter, active only by default) */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.view");
  if (guard.denied) return guard.response;
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const where: Record<string, unknown> = {};
  if (entity && CUSTOM_FIELD_ENTITIES.includes(entity as never)) where.entity = entity;
  if (!includeArchived) where.status = "active";
  const items = await db.customField.findMany({ where, orderBy: [{ entity: "asc" }, { sortOrder: "asc" }, { label: "asc" }] });
  return ok(items, "Custom field definitions loaded.", { total: items.length });
}

/** POST /api/v1/admin/custom-fields — create a definition */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  let definition;
  try {
    definition = validateFieldDefinition(body as Record<string, unknown>);
  } catch (e) {
    return fail((e as Error).message, ["invalid_field_definition"]);
  }
  const existing = await db.customField.findUnique({
    where: { entity_key: { entity: definition.entity, key: definition.key } },
  });
  if (existing) return fail(`A field with key "${definition.key}" already exists for ${definition.entity}.`, ["duplicate_key"]);
  const created = await db.customField.create({
    data: {
      entity: definition.entity,
      key: definition.key,
      label: definition.label,
      type: definition.type,
      options: definition.options ? definition.options.join(",") : null,
      required: definition.required,
      sortOrder: definition.sortOrder,
      status: "active",
    },
  });
  await writeAudit(guard.session, "custom_field.create", "CustomField", created.id, { key: created.key, entity: created.entity });
  return ok(created, "Custom field created.", {}, 201);
}
