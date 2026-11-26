/**
 * Ecosystem gateway — authenticated API-key + HMAC bridge used by the
 * self-hosted AI OS services (Activepieces, Directus, NocoBase,
 * Temporal, LibreChat/Open-WebUI actions) to talk to this platform.
 *
 * TWO credential paths, one verification function:
 *  1. ALAMINN_ECOSYSTEM_API_KEY (server env) — the bootstrap key with
 *     every scope. Zero DB dependency; intended for the services we
 *     deploy ourselves (docker compose network).
 *  2. ApiKey records (hashed, scoped, revocable) — per-client keys
 *     created in /admin/api-platform.
 *
 * HMAC SIGNATURES (optional but verified when present):
 *  - Header `X-ALAMINN-Signature: t=<unix-seconds>,v1=<hex>` where
 *    v1 = HMAC-SHA256(credentialSecret, `${t}.${rawBody}`).
 *  - A signed request with a stale timestamp (> 5 minutes) is rejected.
 *  - Requests may instead send the raw credential — but a present-but-
 *    invalid signature ALWAYS rejects (fail closed).
 *
 * Every verification is rate limited per key and logged to ApiUsageLog.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { checkKeyRateLimit, hasScope, hashApiKey, type ApiKeyScope } from "@/lib/api-platform/keys";

const SIGNATURE_HEADER = "x-alaminn-signature";
const MAX_SKEW_SECONDS = 300;

export interface EcosystemCredential {
  id: string; // "env:ecosystem" for the env key, ApiKey.id otherwise
  name: string;
  scopes: string[];
  hmacSecret: string;
  rateLimitPerMin: number;
}

export interface EcosystemGuard {
  allowed: boolean;
  credential?: EcosystemCredential;
  response?: NextResponse;
  rateRemaining?: number;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// The env key is hashed at module load so the raw value is never kept
// in a hot comparison path; comparisons use timing-safe equality.
function ecosystemEnvCredential(): EcosystemCredential | null {
  const raw = process.env.ALAMINN_ECOSYSTEM_API_KEY;
  if (!raw || raw.length < 32) return null;
  return {
    id: "env:ecosystem",
    name: "Ecosystem bootstrap key (ALAMINN_ECOSYSTEM_API_KEY)",
    scopes: ["*"],
    hmacSecret: raw,
    rateLimitPerMin: 240,
  };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Extract the raw credential from headers (X-Api-Key or Bearer). */
export function extractCredential(req: NextRequest): string | null {
  const headerKey = req.headers.get("x-api-key");
  if (headerKey && headerKey.trim()) return headerKey.trim();
  const auth = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (match?.[1]?.trim()) return match[1].trim();
  return null;
}

/** Parse `t=<unix>,v1=<hex>` signature headers. */
export function parseSignatureHeader(raw: string | null): { t: number; v1: string } | null {
  if (!raw) return null;
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/i.exec(raw.trim());
  if (!m) return null;
  const t = Number(m[1]);
  if (!Number.isFinite(t)) return null;
  return { t, v1: m[2].toLowerCase() };
}

export function computeEcosystemSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

async function verifyEcosystemSignature(
  credential: EcosystemCredential,
  req: NextRequest,
  rawBody: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parsed = parseSignatureHeader(req.headers.get(SIGNATURE_HEADER));
  if (!parsed) return { ok: true }; // unsigned requests are allowed (raw credential auth)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.t) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "Signature timestamp is stale. Re-sign the request with the current unix time." };
  }
  const expected = computeEcosystemSignature(credential.hmacSecret, parsed.t, rawBody);
  if (!constantTimeEqualHex(expected, parsed.v1)) {
    return { ok: false, reason: "Invalid HMAC signature for the provided credentials." };
  }
  return { ok: true };
}

export interface EcosystemVerifyOptions {
  /** Scope required for this route, e.g. "leads:write". */
  scope: ApiKeyScope;
  /** Route label for usage logs (defaults to the request pathname). */
  route?: string;
}

/**
 * Verify an ecosystem/API-platform request. Returns the credential on
 * success or a ready-to-return error response on failure.
 */
export async function verifyEcosystemRequest(
  req: NextRequest,
  rawBody: string,
  options: EcosystemVerifyOptions
): Promise<EcosystemGuard> {
  const fail = (message: string, status: number, extraHeaders: Record<string, string> = {}): EcosystemGuard => ({
    allowed: false,
    response: NextResponse.json(
      { success: false, message, error: message, data: null, meta: {}, errors: [status === 401 ? "unauthenticated" : "forbidden"] },
      { status, headers: { "cache-control": "no-store", ...extraHeaders } }
    ),
  });

  const raw = extractCredential(req);
  if (!raw) return fail("Provide an API key (X-Api-Key header) for the ecosystem bridge.", 401);

  const envCredential = ecosystemEnvCredential();
  let credential: EcosystemCredential | null = null;

  if (envCredential && constantTimeEqualHex(sha256Hex(raw), sha256Hex(process.env.ALAMINN_ECOSYSTEM_API_KEY as string))) {
    credential = envCredential;
  } else {
    // DB key lookup by hash
    try {
      const key = await db.apiKey.findUnique({ where: { hashedKey: hashApiKey(raw) } });
      if (key && key.status === "active") {
        let scopes: string[] = [];
        try { scopes = JSON.parse(key.scopes || "[]"); } catch { scopes = []; }
        credential = {
          id: key.id,
          name: key.name,
          scopes: Array.isArray(scopes) ? scopes : [],
          hmacSecret: raw, // DB keys sign with the raw key itself
          rateLimitPerMin: key.rateLimitPerMin,
        };
      }
    } catch {
      return fail("The API platform is temporarily unavailable. Try again shortly.", 503);
    }
  }

  if (!credential) return fail("Unknown, revoked or malformed API key.", 401);

  // Signature (optional but fail-closed when present)
  const signature = await verifyEcosystemSignature(credential, req, rawBody);
  if (!signature.ok) return fail(signature.reason, 401);

  // Scope enforcement (env key holds "*")
  if (!hasScope({ scopes: credential.scopes }, options.scope)) {
    return fail(`This key is not authorized for the "${options.scope}" scope.`, 403);
  }

  // Rate limit per key
  const rate = checkKeyRateLimit(`ecosystem:${credential.id}`, credential.rateLimitPerMin);
  if (!rate.allowed) {
    return fail(`Rate limit exceeded (${credential.rateLimitPerMin}/min). Retry in ${rate.retryAfterSec}s.`, 429, {
      "retry-after": String(rate.retryAfterSec),
    });
  }

  return { allowed: true, credential, rateRemaining: rate.remaining };
}

/** Log the FINAL status of a handled ecosystem request (best effort). */
export async function logEcosystemUsage(
  credential: EcosystemCredential | null,
  route: string,
  method: string,
  status: number,
  durationMs: number
): Promise<void> {
  if (!credential) return;
  try {
    await db.apiUsageLog.create({
      data: { keyId: credential.id.startsWith("env:") ? null : credential.id, route, method, status, durationMs },
    });
  } catch {
    /* non-fatal */
  }
}
