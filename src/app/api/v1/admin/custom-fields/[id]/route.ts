import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson } from "@/lib/admin-api-server";
import { validateFieldDefinition } from "@/lib/crm/custom-fields";

export const dynamic = "force-dynamic";

/** PUT /api/v1/admin/custom-fields/[id] — update a definition */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.customField.findUnique({ where: { id } });
  if (!existing) return fail("Custom field not found.", ["not_found"], 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  let definition;
  try {
    definition = validateFieldDefinition({ ...(body as Record<string, unknown>), key: existing.key });
  } catch (e) {
    return fail((e as Error).message, ["invalid_field_definition"]);
  }
  const status = (body as Record<string, unknown>).status === "archived" ? "archived" : "active";
  const updated = await db.customField.update({
    where: { id },
    data: {
      label: definition.label,
      type: definition.type,
      options: definition.options ? definition.options.join(",") : null,
      required: definition.required,
      sortOrder: definition.sortOrder,
      status,
    },
  });
  await writeAudit(guard.session, "custom_field.update", "CustomField", id, { key: updated.key, status });
  return ok(updated, "Custom field updated.");
}

/** DELETE /api/v1/admin/custom-fields/[id] — archive (soft) the definition */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.customField.findUnique({ where: { id } });
  if (!existing) return fail("Custom field not found.", ["not_found"], 404);
  await db.customField.update({ where: { id }, data: { status: "archived" } });
  await writeAudit(guard.session, "custom_field.archive", "CustomField", id, { key: existing.key });
  return ok({ id, status: "archived" }, "Custom field archived. Existing values stay on their records.");
}
