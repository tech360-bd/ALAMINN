/**
 * Free Email Providers — Catalog & Configuration Registry
 * =======================================================
 * Zero-cost / free-tier email sending services for consent-based outbound
 * email. Listed under jixserver/free-for-dev → Email.
 *
 * Loop / failover behavior lives in src/lib/email/router.ts: if provider A
 * hits its free-tier limit (429 / failure / network error) the router
 * automatically tries provider B, then C, and finally dev mode — exactly
 * like the SMS router (src/lib/sms/router.ts) and AI free-router
 * (src/lib/ai/free-router.ts).
 *
 * IMPORTANT (honesty + licensing):
 *  - We do NOT vendor these services into this codebase. We call their
 *    documented public APIs only — no code is copied.
 *  - "adapter"  = we ship a real HTTP client + connection test.
 *  - "service"  = self-host / connect via SMTP or API key.
 *  - "dev-mode" = always-available local fallback (logs instead of sending).
 *
 * Only send to recipients who have given explicit marketing consent.
 */

import { db } from "@/lib/db";
import { decryptStoredAiSecret, encryptStoredAiSecret } from "@/lib/ai/free-providers";

export type EmailProviderId =
  | "sparkpost"
  | "mailgun"
  | "sendgrid"
  | "mailjet"
  | "sendinblue"
  | "sendpulse"
  | "pepipost"
  | "elasticemail"
  | "resend"
  | "smtp"
  | "dev-null";

export type EmailStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "PENDING";

export interface EmailProviderSpec {
  id: EmailProviderId;
  name: string;
  mode: "adapter" | "service" | "dev-mode";
  license: string;
  language: string;
  requiresKey: boolean;
  envKeyNames: string[];
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

export const FREE_EMAIL_PROVIDERS: EmailProviderSpec[] = [
  {
    id: "sparkpost",
    name: "SparkPost",
    mode: "adapter",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_SPARKPOST_API_KEY"],
    defaultBaseUrl: "https://api.sparkpost.com",
    signupUrl: "https://www.sparkpost.com",
    rateLimitNote: "First 100,000 emails/month free.",
    supportsInternational: true,
    summary: "Enterprise-grade email API with a generous 100k free monthly tier.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Native adapter: POST /api/v1/transmissions with { content, recipients }. No code is copied; we call the documented public API only.",
    fields: [
      { key: "apiKey", label: "SparkPost API key", secret: true, required: true, placeholder: "YOUR_API_KEY" },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "mailgun",
    name: "Mailgun",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_MAILGUN_API_KEY", "EMAIL_MAILGUN_DOMAIN"],
    defaultBaseUrl: "https://api.mailgun.net/v3",
    signupUrl: "https://www.mailgun.com",
    rateLimitNote: "First 10,000 emails/month free.",
    supportsInternational: true,
    summary: "Popular email API/SMTP service with a 10k free monthly tier.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect your API key + domain by URL. Not vendored.",
    fields: [
      { key: "apiKey", label: "Mailgun API key", secret: true, required: true, placeholder: "key-..." },
      { key: "domain", label: "Sandbox domain", required: true, placeholder: "sandbox.mailgun.org" },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_SENDGRID_API_KEY"],
    defaultBaseUrl: "https://api.sendgrid.com/v3",
    signupUrl: "https://sendgrid.com",
    rateLimitNote: "12,000 emails/month and 2,000 contacts free.",
    supportsInternational: true,
    summary: "Well-known email API with 12k free monthly emails.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect your API key. Not vendored.",
    fields: [
      { key: "apiKey", label: "SendGrid API key", secret: true, required: true, placeholder: "SG...." },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "mailjet",
    name: "Mailjet",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_MAILJET_API_KEY", "EMAIL_MAILJET_SECRET_KEY"],
    defaultBaseUrl: "https://api.mailjet.com/v3",
    signupUrl: "https://www.mailjet.com",
    rateLimitNote: "6,000 emails/month free.",
    supportsInternational: true,
    summary: "Email API with 6k free monthly emails.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect API key + secret key. Not vendored.",
    fields: [
      { key: "apiKey", label: "Mailjet API key", secret: true, required: true, placeholder: "..." },
      { key: "authToken", label: "Secret key", secret: true, required: true, placeholder: "..." },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "sendinblue",
    name: "SendinBlue (Brevo)",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_SENDINBLUE_API_KEY"],
    defaultBaseUrl: "https://api.sendinblue.com/v3",
    signupUrl: "https://www.sendinblue.com",
    rateLimitNote: "9,000 emails/month free (300/day).",
    supportsInternational: true,
    summary: "Email/SMS marketing platform with 9k free monthly emails.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect your API key. Not vendored.",
    fields: [
      { key: "apiKey", label: "SendinBlue API key", secret: true, required: true, placeholder: "xkeysib-..." },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "sendpulse",
    name: "SendPulse",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_SENDPULSE_CLIENT_ID", "EMAIL_SENDPULSE_CLIENT_SECRET"],
    defaultBaseUrl: "https://api.sendpulse.com",
    signupUrl: "https://sendpulse.com",
    rateLimitNote: "50 emails free/hour, first 12,000 emails/month free.",
    supportsInternational: true,
    summary: "Multi-channel marketing with 12k free monthly emails.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect client ID + secret. Not vendored.",
    fields: [
      { key: "clientId", label: "Client ID", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "pepipost",
    name: "Pepipost",
    mode: "adapter",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_PEPIPOST_API_KEY"],
    defaultBaseUrl: "https://api.pepipost.com/v2",
    signupUrl: "http://www.pepipost.com",
    rateLimitNote: "Unlimited free for first three months, then first 25,000 emails/month free.",
    supportsInternational: true,
    summary: "Email API with generous free tier (unlimited for 3 months, then 25k/mo).",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Native adapter: POST /send_mail with { from, to, subject, content }. No code is copied; we call the documented public API only.",
    fields: [
      { key: "apiKey", label: "Pepipost API key", secret: true, required: true, placeholder: "..." },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "elasticemail",
    name: "Elastic Email",
    mode: "adapter",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["EMAIL_ELASTICEMAIL_API_KEY"],
    defaultBaseUrl: "https://api.elasticemail.com/v4",
    signupUrl: "https://elasticemail.com",
    rateLimitNote: "First 150,000 emails/month free.",
    supportsInternational: true,
    summary: "Email API with the largest free tier: 150k free monthly emails.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Native adapter: POST /email/send with { from, to, subject, body }. No code is copied; we call the documented public API only.",
    fields: [
      { key: "apiKey", label: "Elastic Email API key", secret: true, required: true, placeholder: "..." },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "resend",
    name: "Resend",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "REST",
    requiresKey: true,
    envKeyNames: ["RESEND_API_KEY"],
    defaultBaseUrl: "https://api.resend.com",
    signupUrl: "https://resend.com",
    rateLimitNote: "Free tier available; check Resend pricing for current limits.",
    supportsInternational: true,
    summary: "Modern email API (already integrated in src/lib/email/transport.ts).",
    integrationNote: "Already used by the platform's email transport. Listed here so it can participate in the email failover loop.",
    fields: [
      { key: "apiKey", label: "Resend API key", secret: true, required: true, placeholder: "re_..." },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
    ],
  },
  {
    id: "smtp",
    name: "Custom SMTP",
    mode: "service",
    license: "Proprietary (free tier)",
    language: "SMTP",
    requiresKey: true,
    envKeyNames: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
    defaultBaseUrl: "smtp://localhost",
    signupUrl: "",
    rateLimitNote: "Depends on your SMTP provider (many offer free tiers).",
    supportsInternational: true,
    summary: "Bring your own SMTP server (already integrated in src/lib/email/transport.ts).",
    integrationNote: "Already used by the platform's email transport. Listed here so it can participate in the email failover loop.",
    fields: [
      { key: "host", label: "SMTP host", required: true, placeholder: "smtp.example.com" },
      { key: "port", label: "SMTP port", required: true, placeholder: "587" },
      { key: "user", label: "SMTP user", required: true },
      { key: "pass", label: "SMTP password", secret: true, required: true },
      { key: "from", label: "From address", required: true, placeholder: "hello@example.com" },
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
    rateLimitNote: "Always available in development — logs the email instead of sending.",
    supportsInternational: true,
    summary: "Guaranteed zero-failure fallback in development. Logs the outbound email to the console.",
    integrationNote: "Built-in dev-mode provider. Final guaranteed fallback in the email loop when every real provider is rate-limited or unconfigured.",
    fields: [],
  },
];

export const EMAIL_PROVIDER_MAP: Record<EmailProviderId, EmailProviderSpec> = Object.fromEntries(
  FREE_EMAIL_PROVIDERS.map((p) => [p.id, p])
) as Record<EmailProviderId, EmailProviderSpec>;

/** Default failover order: SparkPost → Mailgun → SendGrid → Mailjet → SendinBlue → SendPulse → Pepipost → ElasticEmail → Resend → SMTP → dev mode */
export const DEFAULT_EMAIL_FALLBACK_ORDER: EmailProviderId[] = [
  "sparkpost",
  "mailgun",
  "sendgrid",
  "mailjet",
  "sendinblue",
  "sendpulse",
  "pepipost",
  "elasticemail",
  "resend",
  "smtp",
  "dev-null",
];

export interface EmailSendResult {
  status: EmailStatus;
  providerUsed: EmailProviderId;
  providerName: string;
  messageId: string | null;
  error: string | null;
  /** True if actually handed to a real provider (false in dev mode) */
  actuallySent: boolean;
  /** End-to-end latency in ms (informational) */
  latencyMs?: number;
  fallbackTrail: Array<{
    provider: EmailProviderId;
    status: "skipped" | "cooldown" | "failed" | "ok";
    detail?: string;
  }>;
}

export interface ResolvedEmailProviderConfig {
  spec: EmailProviderSpec;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  domain?: string;
  authToken?: string;
  clientId?: string;
  clientSecret?: string;
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from: string;
  configured: boolean;
  keySource: "db" | "env" | "none";
}

export interface EmailGlobalSettings {
  preferredProvider: EmailProviderId | "auto";
  fallbackOrder: EmailProviderId[];
}

const EMAIL_SETTINGS_CACHE_TTL_MS = 10_000;
let emailSettingsCache: { at: number; map: Record<string, string> } | null = null;

export function invalidateEmailSettingsCache(): void {
  emailSettingsCache = null;
}

export async function loadEmailRawSettings(): Promise<Record<string, string>> {
  if (emailSettingsCache && Date.now() - emailSettingsCache.at < EMAIL_SETTINGS_CACHE_TTL_MS) {
    return emailSettingsCache.map;
  }
  const map: Record<string, string> = {};
  try {
    const rows = await db.setting.findMany({
      where: { key: { startsWith: "email." } },
    });
    for (const r of rows) {
      map[r.key] = r.value;
    }
  } catch {
    // Database might not be initialized in build/test contexts — degrade to env vars
  }
  emailSettingsCache = { at: Date.now(), map };
  return map;
}

export function maskEmailSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export async function resolveAllEmailProviderConfigs(): Promise<{
  providers: ResolvedEmailProviderConfig[];
  global: EmailGlobalSettings;
}> {
  const raw = await loadEmailRawSettings();

  const preferredRaw =
    raw["email.preferredProvider"] ||
    process.env.EMAIL_PREFERRED_PROVIDER ||
    "sparkpost";
  const preferredProvider =
    preferredRaw === "auto" || preferredRaw in EMAIL_PROVIDER_MAP
      ? preferredRaw
      : "sparkpost";

  let fallbackOrder = DEFAULT_EMAIL_FALLBACK_ORDER;
  if (raw["email.fallbackOrder"]) {
    try {
      const parsed = JSON.parse(raw["email.fallbackOrder"]) as EmailProviderId[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((id) => id in EMAIL_PROVIDER_MAP);
        for (const def of DEFAULT_EMAIL_FALLBACK_ORDER) {
          if (!valid.includes(def)) valid.push(def);
        }
        fallbackOrder = valid;
      }
    } catch {
      // keep default
    }
  }

  const global: EmailGlobalSettings = {
    preferredProvider,
    fallbackOrder,
  };

  const providers: ResolvedEmailProviderConfig[] = FREE_EMAIL_PROVIDERS.map((spec) => {
    const dbEnabled = raw[`email.provider.${spec.id}.enabled`];
    const defaultEnabled =
      spec.id === "dev-null" ? true : dbEnabled !== undefined ? dbEnabled === "true" : true;

    const dbKey = decryptStoredAiSecret(raw[`email.provider.${spec.id}.apiKey`]);
    let envKey = "";
    for (const envName of spec.envKeyNames) {
      if (process.env[envName]?.trim()) {
        envKey = process.env[envName]!.trim();
        break;
      }
    }

    const rawDbBaseUrl = (raw[`email.provider.${spec.id}.baseUrl`] || "").trim();
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

    const dbFrom = raw[`email.provider.${spec.id}.from`] || "";
    const envFrom =
      process.env[`EMAIL_${spec.id.toUpperCase()}_FROM`] ||
      process.env.EMAIL_FROM ||
      "";
    const from = dbFrom || envFrom || "";

    const dbDomain = raw[`email.provider.${spec.id}.domain`] || "";
    const dbAuthToken = decryptStoredAiSecret(raw[`email.provider.${spec.id}.authToken`]);
    const dbClientId = raw[`email.provider.${spec.id}.clientId`] || "";
    const dbClientSecret = decryptStoredAiSecret(raw[`email.provider.${spec.id}.clientSecret`]);
    const dbHost = raw[`email.provider.${spec.id}.host`] || "";
    const dbPort = Number(raw[`email.provider.${spec.id}.port`] || "0") || undefined;
    const dbUser = raw[`email.provider.${spec.id}.user`] || "";
    const dbPass = decryptStoredAiSecret(raw[`email.provider.${spec.id}.pass`]);

    let configured = false;
    if (spec.id === "dev-null") {
      configured = true;
    } else if (spec.requiresKey) {
      if (spec.id === "smtp") {
        configured = Boolean(dbHost && dbUser && dbPass && dbFrom);
      } else if (spec.id === "mailgun") {
        configured = Boolean(apiKey && dbDomain && dbFrom);
      } else if (spec.id === "mailjet") {
        configured = Boolean(apiKey && dbAuthToken && dbFrom);
      } else if (spec.id === "sendpulse") {
        configured = Boolean(dbClientId && dbClientSecret && dbFrom);
      } else {
        configured = Boolean(apiKey && dbFrom);
      }
    } else {
      configured = true;
    }

    return {
      spec,
      enabled: defaultEnabled,
      apiKey,
      baseUrl,
      domain: dbDomain,
      authToken: dbAuthToken || "",
      clientId: dbClientId,
      clientSecret: dbClientSecret || "",
      host: dbHost,
      port: dbPort,
      user: dbUser,
      pass: dbPass || "",
      from,
      configured,
      keySource,
    };
  });

  return { providers, global };
}
