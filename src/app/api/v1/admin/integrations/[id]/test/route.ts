import type { NextRequest } from "next/server";
import { z } from "zod";
import { kitAction, kitOk } from "@/lib/kits/api";
import { writeAudit, checkAdminRateLimit } from "@/lib/admin-api-server";
import { INTEGRATION_BY_ID, isConnectable } from "@/lib/integrations/registry";
import { readConnectionSecrets, recordTest } from "@/lib/integrations/store";
import { testIntegration } from "@/lib/integrations/connectors";

export const dynamic = "force-dynamic";
const schema = z.object({}).passthrough();

/** POST — run a bounded live connection test using stored (decrypted) config. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kitAction(req, "integration_settings.update", schema, async (_data, session) => {
    const def = INTEGRATION_BY_ID[id];
    if (!def) return kitOk(null, "Unknown integration.", 404);
    if (!isConnectable(def.mode)) return kitOk(null, "This integration has no runtime connector.", 400);
    if (!checkAdminRateLimit(`integration-test:${session.userId}`, 20).allowed) return kitOk(null, "Too many tests. Please wait a minute.", 429);
    const cfg = await readConnectionSecrets(id);
    const result = await testIntegration(def, cfg);
    await recordTest(id, result.ok, result.message);
    await writeAudit(session, "integration.test", "Integration", id, { ok: result.ok, status: result.status ?? null });
    return kitOk(result, result.message, result.ok ? 200 : 200);
  });
}
