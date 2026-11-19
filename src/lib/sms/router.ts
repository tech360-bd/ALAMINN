/**
 * Free SMS Router — Multi-Provider Failover Loop
 * ==============================================
 * Sends consent-based SMS with automatic failover: if provider A hits its
 * free-tier limit (429 / failure / network error) the router automatically
 * tries provider B, then C, and finally dev-mode. Mirrors the AI free-router
 * pattern in src/lib/ai/free-router.ts.
 *
 * Per-provider runtime metrics track calls / successes / failures / rate
 * limits and enforce a cooldown window after each 429 so a limited provider
 * isn't retried hot.
 *
 * SECURITY: Server-only. API keys/tokens are NEVER exposed to the client.
 * Only send to recipients who have given explicit comms consent.
 */

import {
  SMS_PROVIDER_MAP,
  type ResolvedSmsProviderConfig,
  type SmsGlobalSettings,
  type SmsProviderId,
  type SmsStatus,
  type SmsSendResult,
} from "./providers";
import { resolveAllSmsProviderConfigs } from "./providers";

// Re-exported so consumers (e.g. the sender layer) can import from one barrel.
export {
  SMS_PROVIDER_MAP,
  resolveAllSmsProviderConfigs,
};
export type {
  ResolvedSmsProviderConfig,
  SmsGlobalSettings,
  SmsProviderId,
  SmsStatus,
  SmsSendResult,
};

interface SmsRuntimeMetric {
  calls: number;
  successes: number;
  failures: number;
  rateLimits: number;
  totalLatencyMs: number;
  lastUsedAt: number | null;
  lastError: string | null;
  cooldownUntil: number;
}

const providerMetrics = new Map<SmsProviderId, SmsRuntimeMetric>();

function metricFor(id: SmsProviderId): SmsRuntimeMetric {
  let m = providerMetrics.get(id);
  if (!m) {
    m = {
      calls: 0,
      successes: 0,
      failures: 0,
      rateLimits: 0,
      totalLatencyMs: 0,
      lastUsedAt: null,
      lastError: null,
      cooldownUntil: 0,
    };
    providerMetrics.set(id, m);
  }
  return m;
}

export function getSmsRouterTelemetry() {
  const now = Date.now();
  const perProvider: Record<string, unknown> = {};
  for (const [id, m] of providerMetrics.entries()) {
    perProvider[id] = {
      calls: m.calls,
      successes: m.successes,
      failures: m.failures,
      rateLimits: m.rateLimits,
      avgLatencyMs: m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0,
      lastUsedAt: m.lastUsedAt ? new Date(m.lastUsedAt).toISOString() : null,
      lastError: m.lastError,
      inCooldown: m.cooldownUntil > now,
      cooldownRemainingSec: m.cooldownUntil > now ? Math.ceil((m.cooldownUntil - now) / 1000) : 0,
    };
  }
  return { providers: perProvider };
}

export function clearSmsRouterMetrics(): number {
  const count = providerMetrics.size;
  providerMetrics.clear();
  return count;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePhone(input: string): string {
  return String(input).trim().replace(/[^+\d]/g, "");
}

function isValidPhone(input: string): boolean {
  const s = normalizePhone(input);
  return s.length >= 8 && s.length <= 16 && /^\+?\d+$/.test(s);
}

/**
 * httpSMS adapter: POST /v1/messages/send with { Content, From, To } using
 * x-api-key auth (matches the connection test in src/lib/integrations/connectors.ts).
 */
async function sendHttpSms(cfg: ResolvedSmsProviderConfig, to: string, text: string) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/v1/messages/send`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": cfg.apiKey,
      },
      body: JSON.stringify({
        Content: text,
        From: cfg.from || "",
        To: to,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("httpsms");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429 || res.status === 402 || res.status === 403) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`httpSMS rate-limited/blocked (HTTP ${res.status})`);
      }
      throw new Error(`httpSMS HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      messageId?: string;
      status?: string;
      error?: string;
    };
    const messageId = data.id || data.messageId || null;

    return {
      status: "SENT" as SmsStatus,
      messageId,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : `httpSMS network error: ${String(e)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Textbelt adapter: POST /text with { phone, message, key }.
 * Free tier key=TEXTBELT allows 1 SMS/day per phone number (US/Canada best-effort).
 */
async function sendTextbelt(cfg: ResolvedSmsProviderConfig, to: string, text: string) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/text`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        phone: to,
        message: text,
        key: cfg.apiKey || "TEXTBELT",
      }).toString(),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("textbelt");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error("Textbelt rate-limited (HTTP 429)");
      }
      throw new Error(`Textbelt HTTP ${res.status}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      textId?: string;
      error?: string;
      quotaRemaining?: number;
    };
    if (!data.success) {
      throw new Error(`Textbelt rejected: ${data.error || "unknown error"}`);
    }

    return {
      status: "SENT" as SmsStatus,
      messageId: data.textId || null,
      error: null,
      actuallySent: true,
      latencyMs,
      quotaRemaining: data.quotaRemaining,
    };
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : `Textbelt network error: ${String(e)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Twilio adapter: POST /2010-04-01/Accounts/{AccountSid}/Messages.json
 * Basic auth (AccountSid:AuthToken), form body { From, To, Body }.
 */
async function sendTwilio(cfg: ResolvedSmsProviderConfig, to: string, text: string) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        From: cfg.from || "",
        To: to,
        Body: text,
      }).toString(),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("twilio");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Twilio rate-limited (HTTP 429)`);
      }
      throw new Error(`Twilio HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { sid?: string; error_code?: number };
    return {
      status: "SENT" as SmsStatus,
      messageId: data.sid || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Twilio network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Plivo adapter: POST /v1/Account/{authId}/Message/
 * Basic auth (authId:authToken), form body { src, dst, text }.
 */
async function sendPlivo(cfg: ResolvedSmsProviderConfig, to: string, text: string) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/Account/${encodeURIComponent(cfg.accountSid)}/Message/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        src: cfg.from || "",
        dst: to,
        text: text,
      }).toString(),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("plivo");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Plivo rate-limited (HTTP 429)`);
      }
      throw new Error(`Plivo HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { message_uuid?: string; message_uuids?: string[] };
    return {
      status: "SENT" as SmsStatus,
      messageId: data.message_uuid || (data.message_uuids?.[0] || null),
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Plivo network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Dev-mode provider: logs the SMS instead of sending. Always available. */
function sendDevNull(to: string, text: string) {
  const m = metricFor("dev-null");
  const now = Date.now();
  m.calls++;
  m.successes++;
  m.lastUsedAt = now;
  console.log(
    `[sms/dev-null] Would send SMS to ${to.slice(-4)}: "${text.slice(0, 120)}"${text.length > 120 ? "…" : ""}`
  );
  return {
    status: "PENDING" as SmsStatus,
    messageId: `dev-${now}-${to.slice(-4)}`,
    error: null,
    actuallySent: false,
  };
}

/**
 * Send an SMS through the first available provider in the failover loop.
 *
 * @param to Recipient phone number (international format recommended, e.g. "+8801716609554")
 * @param text Message body (max 1600 chars; long messages may be split by carriers)
 * @param opts.preferredProvider Force a specific provider ("auto" = configured order)
 *
 * @returns SmsSendResult with providerUsed, fallbackTrail, and actuallySent flag
 */
export async function sendSms(
  to: string,
  text: string,
  opts?: { preferredProvider?: SmsProviderId | "auto" }
): Promise<SmsSendResult> {
  const startedAt = Date.now();
  if (!isValidPhone(to)) {
    return {
      status: "FAILED",
      providerUsed: "dev-null",
      providerName: SMS_PROVIDER_MAP["dev-null"].name,
      messageId: null,
      error: "Invalid recipient phone number.",
      actuallySent: false,
      fallbackTrail: [],
    };
  }
  if (!text || !text.trim()) {
    return {
      status: "FAILED",
      providerUsed: "dev-null",
      providerName: SMS_PROVIDER_MAP["dev-null"].name,
      messageId: null,
      error: "Message body is required.",
      actuallySent: false,
      fallbackTrail: [],
    };
  }
  if (text.length > 1600) {
    text = text.slice(0, 1597) + "…";
  }

  const { providers, global } = await resolveAllSmsProviderConfigs();
  const providerById = new Map(providers.map((p) => [p.spec.id, p]));

  const orderedIds: SmsProviderId[] = [];
  const requested =
    opts?.preferredProvider && opts.preferredProvider !== "auto"
      ? opts.preferredProvider
      : global.preferredProvider !== "auto"
        ? global.preferredProvider
        : null;
  if (requested && providerById.has(requested)) orderedIds.push(requested);
  for (const id of global.fallbackOrder) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  const fallbackTrail: SmsSendResult["fallbackTrail"] = [];
  const now = Date.now();

  for (const providerId of orderedIds) {
    const cfg = providerById.get(providerId);
    if (!cfg) continue;

    if (!cfg.enabled && providerId !== "dev-null") {
      fallbackTrail.push({ provider: providerId, status: "skipped", detail: "Disabled" });
      continue;
    }
    if (!cfg.configured && providerId !== "dev-null") {
      fallbackTrail.push({ provider: providerId, status: "skipped", detail: "Not configured" });
      continue;
    }

    const metric = metricFor(providerId);
    if (metric.cooldownUntil > now && providerId !== "dev-null") {
      fallbackTrail.push({
        provider: providerId,
        status: "cooldown",
        detail: "429 rate-limit cooldown",
      });
      continue;
    }

    // Guaranteed dev-mode fallback — always last resort, never cooldown-gated
    if (providerId === "dev-null") {
      const result = sendDevNull(to, text);
      fallbackTrail.push({ provider: "dev-null", status: "ok" });
      return {
        ...result,
        status: "PENDING",
        providerUsed: "dev-null",
        providerName: cfg.spec.name,
        fallbackTrail,
        latencyMs: Date.now() - startedAt,
      };
    }

    const callStart = Date.now();
    metric.calls++;
    try {
      let inner: Awaited<ReturnType<typeof sendHttpSms>>;
      if (providerId === "httpsms") {
        inner = await sendHttpSms(cfg, to, text);
      } else if (providerId === "textbelt") {
        inner = await sendTextbelt(cfg, to, text);
      } else if (providerId === "twilio") {
        inner = await sendTwilio(cfg, to, text);
      } else if (providerId === "plivo") {
        inner = await sendPlivo(cfg, to, text);
      } else {
        throw new Error(`No send adapter for ${providerId}`);
      }

      metric.successes++;
      metric.lastUsedAt = Date.now();
      metric.lastError = null;
      fallbackTrail.push({ provider: providerId, status: "ok" });

      return {
        status: inner.status,
        providerUsed: providerId,
        providerName: cfg.spec.name,
        messageId: inner.messageId ?? null,
        error: inner.error ?? null,
        actuallySent: inner.actuallySent,
        fallbackTrail,
        latencyMs: Date.now() - startedAt,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      metric.failures++;
      metric.lastError = errMsg.slice(0, 200);
      metric.totalLatencyMs += Date.now() - callStart;
      const isRateLimit =
        /rate.limit|429|402|quota/i.test(errMsg) ||
        errMsg.includes("HTTP 429") ||
        errMsg.includes("HTTP 402");
      if (isRateLimit) {
        metric.rateLimits++;
        metric.cooldownUntil = Date.now() + 45_000;
      }
      fallbackTrail.push({
        provider: providerId,
        status: "failed",
        detail: errMsg.slice(0, 140),
      });
      // continue to next provider in the loop
    }
  }

  // Unreachable because dev-null is always appended, but TS-safe:
  return {
    status: "FAILED",
    providerUsed: "dev-null",
    providerName: SMS_PROVIDER_MAP["dev-null"].name,
    messageId: null,
    error: "No SMS provider available.",
    actuallySent: false,
    fallbackTrail,
    latencyMs: Date.now() - startedAt,
  };
}
