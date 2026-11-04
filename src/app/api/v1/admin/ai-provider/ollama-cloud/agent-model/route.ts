import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Per-agent model selection (spec §5, §16).
 *
 * GET /api/v1/admin/ai-provider/ollama-cloud/agent-model
 *   Returns the current model assignment for each agent category.
 *
 * PUT /api/v1/admin/ai-provider/ollama-cloud/agent-model
 *   Updates the model assignment for one or more agent categories.
 *
 * Agent categories (spec §5):
 *   - seo
 *   - content
 *   - whatsapp
 *   - sms
 *   - lead_qualification
 *   - crm
 *
 * Model assignments are stored in the Setting table with keys:
 *   ollama-cloud.model.<category>
 *
 * If no assignment exists, the agent uses its tier default (from env or
 * the Ollama Cloud model list).
 */

const VALID_CATEGORIES = [
  "seo",
  "content",
  "whatsapp",
  "sms",
  "lead_qualification",
  "crm",
] as const;
type AgentCategory = (typeof VALID_CATEGORIES)[number];

const ENV_VAR_MAP: Record<AgentCategory, string> = {
  seo: "OLLAMA_CLOUD_MODEL_SEO",
  content: "OLLAMA_CLOUD_MODEL_CONTENT",
  whatsapp: "OLLAMA_CLOUD_MODEL_WHATSAPP",
  sms: "OLLAMA_CLOUD_MODEL_SMS",
  lead_qualification: "OLLAMA_CLOUD_MODEL_LEAD_QUALIFICATION",
  crm: "OLLAMA_CLOUD_MODEL_CRM",
};

const UpdateSchema = z.object({
  assignments: z.array(
    z.object({
      category: z.enum(VALID_CATEGORIES),
      model: z.string().max(100).nullable(), // null = use default
    })
  ),
});

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  // Read all assignments from Setting table + env fallbacks.
  const settings = await db.setting.findMany({
    where: {
      key: { startsWith: "ollama-cloud.model." },
    },
  });

  const assignments = VALID_CATEGORIES.map((category) => {
    const settingKey = `ollama-cloud.model.${category}`;
    const setting = settings.find((s) => s.key === settingKey);
    const envVar = ENV_VAR_MAP[category];
    return {
      category,
      model: setting?.value || process.env[envVar] || null,
      source: setting ? "db" : process.env[envVar] ? "env" : "default",
    };
  });

  return ok({ assignments }, "Agent model assignments");
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "ai_approvals.decide");
  if (guard.denied) return guard.response;

  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "Invalid agent-model payload.",
      parsed.error.issues.map((i) => i.message),
      400
    );
  }

  const changes: Array<{ category: string; from: string | null; to: string | null }> = [];

  for (const { category, model } of parsed.data.assignments) {
    const settingKey = `ollama-cloud.model.${category}`;
    const existing = await db.setting.findUnique({ where: { key: settingKey } });
    const from = existing?.value || process.env[ENV_VAR_MAP[category]] || null;

    if (model === null) {
      // Clear the assignment (fall back to env/default)
      if (existing) {
        await db.setting.delete({ where: { key: settingKey } });
      }
      changes.push({ category, from, to: null });
    } else {
      await db.setting.upsert({
        where: { key: settingKey },
        create: { key: settingKey, value: model },
        update: { value: model },
      });
      changes.push({ category, from, to: model });
    }
  }

  await writeAudit(
    guard.session,
    "ai_provider.ollama_cloud.agent_model_update",
    "Setting",
    "ollama-cloud.model.*",
    { changes }
  );

  return ok({ changes }, "Agent model assignments updated.");
}
