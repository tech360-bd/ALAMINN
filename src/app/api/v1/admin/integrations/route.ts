import type { NextRequest } from "next/server";
import { z } from "zod";
import { kitRead, kitAction, kitOk } from "@/lib/kits/api";
import { writeAudit } from "@/lib/admin-api-server";
import { INTEGRATIONS, INTEGRATION_BY_ID, INTEGRATION_CATEGORIES, isConnectable } from "@/lib/integrations/registry";
import { readConnectionPublic, saveConnection } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

/** GET — registry + masked connection state. Requires integration_settings.view. */
export async function GET(req: NextRequest) {
  return kitRead(req, "integration_settings.view", async () => {
    const connections = await Promise.all(INTEGRATIONS.filter(i => isConnectable(i.mode)).map(i => readConnectionPublic(i)));
    const byId = Object.fromEntries(connections.map(c => [c.id, c]));
    return kitOk({
      categories: INTEGRATION_CATEGORIES,
      integrations: INTEGRATIONS.map(i => ({
        id: i.id, name: i.name, url: i.url, category: i.category, mode: i.mode,
        license: i.license, language: i.language, summary: i.summary,
        integrationNote: i.integrationNote, docsUrl: i.docsUrl ?? null,
        fields: (i.fields ?? []).map(f => ({ key: f.key, label: f.label, secret: !!f.secret, required: !!f.required, placeholder: f.placeholder ?? null })),
        connection: byId[i.id] ?? null,
      })),
    }, "Integrations loaded.");
  });
}

const saveSchema = z.object({
  id: z.string().min(1).max(80),
  enabled: z.boolean().optional(),
  values: z.record(z.string(), z.string().max(4000)).optional(),
});

/** PUT — save encrypted config / toggle. Requires integration_settings.update. */
export async function PUT(req: NextRequest) {
  return kitAction(req, "integration_settings.update", saveSchema, async (data, session) => {
    const def = INTEGRATION_BY_ID[data.id];
    if (!def) return kitOk(null, "Unknown integration.", 404);
    if (!isConnectable(def.mode)) return kitOk(null, "This integration is reference-only and cannot be configured.", 400);
    await saveConnection(data.id, { enabled: data.enabled, values: data.values });
    await writeAudit(session, "integration.update", "Integration", data.id, { enabled: data.enabled, fields: Object.keys(data.values ?? {}) });
    return kitOk(await readConnectionPublic(def), "Integration saved.");
  });
}
