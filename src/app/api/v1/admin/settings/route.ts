import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { isSensitiveSettingKey, ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import {
  decryptStoredAiSecret,
  encryptStoredAiSecret,
  invalidateFreeAiSettingsCache,
  maskSecret,
} from "@/lib/ai/free-providers";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/settings — return all settings as key→value map (sensitive values masked) */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "security_settings.view");
  if (guard.denied) return guard.response;
  const settings = await db.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    if (isSensitiveSettingKey(s.key) || s.value.startsWith("v1:")) {
      const plain = decryptStoredAiSecret(s.value);
      map[s.key] = plain ? maskSecret(plain) : "";
    } else {
      map[s.key] = s.value;
    }
  }
  return ok(map, "Settings loaded.");
}

/** PUT /api/v1/admin/settings — upsert settings (preserves masked secrets & encrypts sensitive keys) */
export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "security_settings.update");
  if (guard.denied) return guard.response;
  const body = await readJson<Record<string, string>>(req);
  if (!body || typeof body !== "object") return fail("Invalid JSON body.");
  try {
    const entries: Array<{ key: string; value: string }> = [];
    for (const [k, rawVal] of Object.entries(body)) {
      const strVal = String(rawVal ?? "");
      if (strVal.includes("••••") || strVal === "[CONFIGURED_REDACTED]" || strVal === "__KEEP__") {
        continue;
      }
      const valueToStore =
        isSensitiveSettingKey(k) && strVal.trim() ? encryptStoredAiSecret(strVal) : strVal;
      entries.push({ key: k, value: valueToStore });
    }
    if (entries.length > 0) {
      await db.$transaction(
        entries.map((e) =>
          db.setting.upsert({
            where: { key: e.key },
            update: { value: e.value },
            create: { key: e.key, value: e.value },
          })
        )
      );
      invalidateFreeAiSettingsCache();
    }
    await writeAudit(guard.session, "settings.update", "Setting", undefined, {
      keys: entries.map((e) => e.key),
    });
    return ok({ updated: entries.length }, "Settings saved.");
  } catch (e) {
    return fail("Failed to save settings.", [(e as Error).message], 500);
  }
}
