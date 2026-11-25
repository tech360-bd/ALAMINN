/**
 * Free SMS Providers — Catalog & Configuration Registry
 * =====================================================
 * Zero-cost / free-tier SMS gateways for consent-based outbound SMS.
 *
 * IMPORTANT (honesty + licensing):
 *  - We do NOT vendor these repositories into this codebase. Many are AGPL/GPL
 *    or native Android/Go projects. Copying them in would break their licenses.
 *  - "adapter"  = we ship a real HTTP client + connection test against an official API.
 *  - "service"  = self-host the project, then connect it here via base URL + key.
 *  - "reference"= documentation / recipes to study, not a runtime dependency.
 *  - "dev-mode" = always-available local fallback (logs instead of sending).
 *
 * Loop / failover behavior lives in src/lib/sms/router.ts: if provider A hits
 * its free-tier limit (429 / failure / cooldown), the router automatically
 * tries provider B, then C, and finally dev-mode — exactly like the AI
 * free-router (src/lib/ai/free-router.ts).
 */

import { db } from "@/lib/db";
import { decryptStoredAiSecret } from "@/lib/ai/free-providers";

export type SmsProviderId =
  | "httpsms"
  | "textbelt"
  | "twilio"
  | "plivo"
  | "dev-null";

export type SmsStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "PENDING";

export interface SmsProviderSpec {
  id: SmsProviderId;
  name: string;
  mode: "adapter" | "service" | "reference" | "dev-mode";
  license: string;
  language: string;
  requiresKey: boolean;
  envKeyNames: string[];
  envBaseUrlName?: string;
  defaultBaseUrl: string;
  signupUrl: string;
  rateLimitNote: string;
  supportsInternational: boolean;
  summary: string;
  integrationNote: string;
  fields?: Array<{
    key: string;
    label: string;
    secret?: boolean;
    placeholder?: string;
    required?: boolean;
  }>;
}

export const FREE_SMS_PROVIDERS: SmsProviderSpec[] = [
  {
    id: "httpsms",
    name: "httpSMS (NdoleStudio)",
    mode: "adapter",
    license: "AGPL-3.0",
    language: "Go / Android",
    requiresKey: true,
    envKeyNames: ["SMS_HTTPSMS_API_KEY"],
    envBaseUrlName: "SMS_HTTPSMS_BASE_URL",
    defaultBaseUrl: "https://api.httpsms.com",
    signupUrl: "https://github.com/NdoleStudio/httpsms",
    rateLimitNote: "Limited by your Android device & SIM plan; free once self-hosted. Set back-pressure on the device to avoid flooding the carrier.",
    supportsInternational: true,
    summary:
      "Send/receive SMS through your own Android phone via a simple HTTP API. The Android app polls your API key and triggers the phone's native SMS sender.",
    integrationNote:
      "Native adapter: POST /v1/messages/send with { Content, From, To } using x-api-key auth. The AGPL server is self-hosted separately; only the public MIT-compatible API contract is used here — no AGPL code is copied into this platform.",
    fields: [
      { key: "apiKey", label: "httpSMS API key", secret: true, required: true, placeholder: "xsms-..." },
      { key: "baseUrl", label: "API base URL", placeholder: "https://api.httpsms.com" },
      { key: "from", label: "Sender ID / From number", placeholder: "+18005550199" },
    ],
  },
  {
    id: "textbelt",
    name: "Textbelt",
    mode: "adapter",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: false,
    envKeyNames: ["SMS_TEXTBELT_KEY"],
    defaultBaseUrl: "https://textbelt.com",
    signupUrl: "https://textbelt.com",
    rateLimitNote: "Free tier: 1 SMS per day per phone number without a key (US/Canada best-effort). A paid key raises the quota and enables international.",
    supportsInternational: false,
    summary: "Simple free SMS API. Post phone + message to https://textbelt.com/text; returns quotaRemaining.",
    integrationNote:
      "Native adapter: POST /text with { phone, message, key } (key=TEXTBELT for the free daily tier, or your paid key). No license asserted on the client side — we use the documented public API only.",
    fields: [
      { key: "apiKey", label: "Textbelt key", secret: true, placeholder: "TEXTBELT (free daily tier) or paid key", required: false },
      { key: "baseUrl", label: "API base URL", placeholder: "https://textbelt.com" },
    ],
  },
  {
    id: "twilio",
    name: "Twilio",
    mode: "service",
    license: "Proprietary API",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["SMS_TWILIO_ACCOUNT_SID", "SMS_TWILIO_AUTH_TOKEN"],
    defaultBaseUrl: "https://api.twilio.com/2010-04-01",
    signupUrl: "https://www.twilio.com/try-twilio",
    rateLimitNote: "Free trial credit (~$15) — enough for a few dozen trial SMS; upgrade for more.",
    supportsInternational: true,
    summary: "Commercial SMS API with a free trial. Connect your Account SID + Auth Token to route through Twilio.",
    integrationNote:
      "Self-managed commercial service; connect by Account SID + Auth Token. Not vendored. Use only with numbers/consent you own.",
    fields: [
      { key: "accountSid", label: "Account SID", required: true },
      { key: "authToken", label: "Auth Token", secret: true, required: true },
      { key: "from", label: "Messaging Service SID or From number", placeholder: "+15017122661" },
    ],
  },
  {
    id: "plivo",
    name: "Plivo",
    mode: "service",
    license: "Proprietary API",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["SMS_PLIVO_AUTH_ID", "SMS_PLIVO_AUTH_TOKEN"],
    defaultBaseUrl: "https://api.plivo.com/v1",
    signupUrl: "https://console.plivo.com/",
    rateLimitNote: "Free trial credits; upgrade for ongoing volume.",
    supportsInternational: true,
    summary: "Commercial SMS/Voice API with free trial credits. Connect your Auth ID + Auth Token.",
    integrationNote:
      "Self-managed commercial service; connect by Auth ID + Auth Token. Not vendored.",
    fields: [
      { key: "authId", label: "Auth ID", required: true },
      { key: "authToken", label: "Auth Token", secret: true, required: true },
      { key: "from", label: "From number", placeholder: "+14155550000" },
    ],
  },
  {
    id: "dev-null",
    name: "Dev Mode (no provider)",
    mode: "dev-mode",
    license: "MIT",
    language: "TypeScript",
    requiresKey: false,
    envKeyNames: [],
    defaultBaseUrl: "",
    signupUrl: "",
    rateLimitNote: "Always available in development — logs the SMS instead of sending.",
    supportsInternational: true,
    summary: "Guaranteed zero-failure fallback in development. Logs the outbound SMS to the console; never actually delivers.",
    integrationNote:
      "Built-in dev-mode provider. Final guaranteed fallback in the SMS loop when every real provider is rate-limited or unconfigured.",
  },
];

export const SMS_PROVIDER_MAP: Record<SmsProviderId, SmsProviderSpec> = Object.fromEntries(
  FREE_SMS_PROVIDERS.map((p) => [p.id, p])
) as Record<SmsProviderId, SmsProviderSpec>;

/** Default failover order: httpSMS → Textbelt → Twilio → Plivo → Dev mode */
export const DEFAULT_SMS_FALLBACK_ORDER: SmsProviderId[] = [
  "httpsms",
  "textbelt",
  "twilio",
  "plivo",
  "dev-null",
];

export interface SmsSendResult {
  status: SmsStatus;
  providerUsed: SmsProviderId;
  providerName: string;
  messageId: string | null;
  error: string | null;
  /** True if actually handed to a real provider (false in dev mode) */
  actuallySent: boolean;
  /** End-to-end latency in ms (informational) */
  latencyMs?: number;
  fallbackTrail: Array<{
    provider: SmsProviderId;
    status: "skipped" | "cooldown" | "failed" | "ok";
    detail?: string;
  }>;
}

export interface ResolvedSmsProviderConfig {
  spec: SmsProviderSpec;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  accountSid: string;
  authToken: string;
  from: string;
  configured: boolean;
  keySource: "db" | "env" | "none";
}

export interface SmsGlobalSettings {
  preferredProvider: SmsProviderId | "auto";
  fallbackOrder: SmsProviderId[];
  devModeAlwaysLog: boolean;
}

const SMS_SETTINGS_CACHE_TTL_MS = 10_000;
let smsSettingsCache: { at: number; map: Record<string, string> } | null = null;

export function invalidateSmsSettingsCache(): void {
  smsSettingsCache = null;
}

export async function loadSmsRawSettings(): Promise<Record<string, string>> {
  if (smsSettingsCache && Date.now() - smsSettingsCache.at < SMS_SETTINGS_CACHE_TTL_MS) {
    return smsSettingsCache.map;
  }
  const map: Record<string, string> = {};
  try {
    const rows = await db.setting.findMany({
      where: { key: { startsWith: "sms." } },
    });
    for (const r of rows) {
      map[r.key] = r.value;
    }
  } catch {
    // Database might not be initialized in build/test contexts — degrade to env vars
  }
  smsSettingsCache = { at: Date.now(), map };
  return map;
}

export function maskSmsSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export async function resolveAllSmsProviderConfigs(): Promise<{
  providers: ResolvedSmsProviderConfig[];
  global: SmsGlobalSettings;
}> {
  const raw = await loadSmsRawSettings();

  const preferredRaw =
    raw["sms.preferredProvider"] ||
    process.env.SMS_PREFERRED_PROVIDER ||
    "httpsms";
  const preferredProvider =
    preferredRaw === "auto"
      ? "auto"
      : Object.hasOwn(SMS_PROVIDER_MAP, preferredRaw)
        ? preferredRaw as SmsProviderId
      : "httpsms";

  let fallbackOrder = DEFAULT_SMS_FALLBACK_ORDER;
  if (raw["sms.fallbackOrder"]) {
    try {
      const parsed = JSON.parse(raw["sms.fallbackOrder"]) as SmsProviderId[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((id) => id in SMS_PROVIDER_MAP);
        for (const def of DEFAULT_SMS_FALLBACK_ORDER) {
          if (!valid.includes(def)) valid.push(def);
        }
        fallbackOrder = valid;
      }
    } catch {
      // keep default
    }
  }

  const global: SmsGlobalSettings = {
    preferredProvider,
    fallbackOrder,
    devModeAlwaysLog: raw["sms.devModeAlwaysLog"] !== "false",
  };

  const providers: ResolvedSmsProviderConfig[] = FREE_SMS_PROVIDERS.map((spec) => {
    const dbEnabled = raw[`sms.provider.${spec.id}.enabled`];
    const defaultEnabled =
      spec.id === "dev-null" ? true : dbEnabled !== undefined ? dbEnabled === "true" : true;

    const dbKey = decryptStoredAiSecret(raw[`sms.provider.${spec.id}.apiKey`]);
    let envKey = "";
    for (const envName of spec.envKeyNames) {
      if (process.env[envName]?.trim()) {
        envKey = process.env[envName]!.trim();
        break;
      }
    }

    // Twilio / Plivo use two-part credentials split across apiKey/accountSid fields in DB
    const dbAccountSid = raw[`sms.provider.${spec.id}.accountSid`];
    const dbAuthToken = decryptStoredAiSecret(raw[`sms.provider.${spec.id}.authToken`]);

    const rawDbBaseUrl = (raw[`sms.provider.${spec.id}.baseUrl`] || "").trim();
    const rawEnvBaseUrl = spec.envBaseUrlName
      ? (process.env[spec.envBaseUrlName] || "").trim()
      : "";

    let baseUrl = spec.defaultBaseUrl;
    let baseUrlSource: "db" | "env" | "default" = "default";
    if (rawDbBaseUrl) {
      try {
        new URL(rawDbBaseUrl);
        baseUrl = rawDbBaseUrl.replace(/\/$/, "");
        baseUrlSource = "db";
      } catch {
        // keep default
      }
    } else if (rawEnvBaseUrl) {
      try {
        new URL(rawEnvBaseUrl);
        baseUrl = rawEnvBaseUrl.replace(/\/$/, "");
        baseUrlSource = "env";
      } catch {
        // keep default
      }
    }

    let allowEnvKey = true;
    if (!dbKey && envKey && baseUrlSource === "db" && spec.defaultBaseUrl.startsWith("https://")) {
      try {
        const officialHost = new URL(spec.defaultBaseUrl).hostname;
        const targetHost = new URL(baseUrl).hostname;
        if (officialHost !== targetHost) allowEnvKey = false;
      } catch {
        allowEnvKey = false;
      }
    }

    const effectiveEnvKey = allowEnvKey ? envKey : "";
    const apiKey = dbKey || effectiveEnvKey;
    const keySource: "db" | "env" | "none" = dbKey ? "db" : effectiveEnvKey ? "env" : "none";

    const dbFrom = raw[`sms.provider.${spec.id}.from`] || "";
    const envFrom = process.env[`SMS_${spec.id.toUpperCase()}_FROM`] || "";
    const from = dbFrom || envFrom || "";

    let configured = false;
    if (spec.id === "dev-null") {
      configured = true;
    } else if (spec.requiresKey) {
      if (spec.id === "twilio" || spec.id === "plivo") {
        configured = Boolean(apiKey && (dbAccountSid || envKey) && (dbAuthToken || effectiveEnvKey));
      } else {
        configured = Boolean(apiKey);
      }
    } else {
      configured = true;
    }

    return {
      spec,
      enabled: defaultEnabled,
      apiKey,
      baseUrl,
      accountSid: dbAccountSid || "",
      authToken: dbAuthToken || "",
      from,
      configured,
      keySource,
    };
  });

  return { providers, global };
}
