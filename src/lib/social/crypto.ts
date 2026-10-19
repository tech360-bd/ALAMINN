/** Token encryption at rest — AES-256-GCM, key derived from AUTH_SECRET. Server-only. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
function key(): Buffer { return createHash("sha256").update(process.env.AUTH_SECRET || "dev-fallback-secret-please-set-AUTH_SECRET").digest(); }
export function encryptToken(plain: string): string {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try { const [v, iv, tag, data] = payload.split(":"); if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch { return null; }
}
/** Masked hint for UI: last 4 chars only. */
export function tokenHint(encrypted: string | null | undefined): string | null {
  const t = decryptToken(encrypted); return t ? `••••${t.slice(-4)}` : null;
}
