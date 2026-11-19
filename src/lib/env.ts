/**
 * Environment configuration — validated at startup.
 * ----------------------------------------------
 * Centralized, typed access to all environment variables. In production,
 * required secrets MUST be present or the app refuses to start. In
 * development, missing secrets fall back to safe dev values with a clear
 * console warning so local work isn't blocked.
 *
 * SECURITY: Never access `process.env` directly outside this file.
 * Import from here so every access is validated and typed.
 */
import { loadEnvConfig } from "@/lib/load-env";
import { resolveAuthSecret } from "@/lib/auth/secret";

// Load .env.config before anything reads process.env (Rule 5).
loadEnvConfig();

export type AppEnv = {
  /** Node environment — "development" | "production" | "test" */
  nodeEnv: string;
  isProd: boolean;
  isDev: boolean;
  /** Public site URL (no trailing slash) — used for emails, OG tags, sitemap */
  siteUrl: string;
  /** SQLite database file path */
  databaseUrl: string;
  /** HMAC secret for signing session cookies (>= 32 bytes in production) */
  authSecret: string;
  /** SMTP host (e.g. smtp.gmail.com) — leave empty to use dev console transport */
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  /** Default From: address for outgoing email */
  emailFrom: string;
  /** Reply-To address for outgoing email */
  emailReplyTo: string;
  /** Resend API key (alternative to SMTP) — leave empty to use SMTP */
  resendApiKey: string | null;
  /** True when email sending is configured (SMTP or Resend) */
  emailConfigured: boolean;
  // ─── WhatsApp AI Agent ─────────────────────────────────────────────
  /** Official WhatsApp number in local format (e.g. "01716609554") */
  whatsappNumber: string;
  /** International format without "+" (e.g. "8801716609554") — used in wa.me URLs */
  whatsappInternationalNumber: string;
  /** Display format (e.g. "01716 609 554") — used in UI text */
  whatsappDisplayNumber: string;
  /** Business name shown to WhatsApp users */
  whatsappBusinessName: string;
  /** Webhook verify token for Meta Cloud API (echoes back on GET verification) */
  whatsappWebhookVerifyToken: string | null;
  /** Meta Cloud API Phone Number ID — blank = dev mode (no actual sends) */
  whatsappApiPhoneNumberId: string | null;
  /** Meta Cloud API access token — blank = dev mode */
  whatsappApiToken: string | null;
  /** True when WhatsApp Cloud API is fully configured for outbound sending */
  whatsappApiConfigured: boolean;
  /** AI provider: "zai" (default) or "openai" */
  whatsappAiProvider: string;
  /** AI model name */
  whatsappAiModel: string;
  /** AI mode: "ACTIVE" | "HUMAN_ONLY" | "APPROVAL_REQUIRED" | "PAUSED" */
  whatsappAiMode: "ACTIVE" | "HUMAN_ONLY" | "APPROVAL_REQUIRED" | "PAUSED";
  // ─── SMS (free provider failover loop) ─────────────────────────────
  /** Preferred SMS provider: "httpsms" | "textbelt" | "twilio" | "plivo" | "auto" */
  smsPreferredProvider: string;
  /** httpSMS API key (from https://httpsms.com/settings) */
  smsHttpsmsApiKey: string | null;
  /** httpSMS API base URL */
  smsHttpsmsBaseUrl: string | null;
  /** httpSMS sender ID / From number */
  smsHttpsmsFrom: string | null;
  /** Textbelt key (use "TEXTBELT" for the free 1-SMS/day tier) */
  smsTextbeltKey: string | null;
  /** Twilio Account SID (free trial) */
  smsTwilioAccountSid: string | null;
  /** Twilio Auth Token */
  smsTwilioAuthToken: string | null;
  /** Twilio From / Messaging Service SID */
  smsTwilioFrom: string | null;
  /** Plivo Auth ID */
  smsPlivoAuthId: string | null;
  /** Plivo Auth Token */
  smsPlivoAuthToken: string | null;
  /** Plivo From number */
  smsPlivoFrom: string | null;
  // ─── Email (free provider failover loop) ─────────────────────────────
  /** Preferred email provider: "sparkpost" | "mailgun" | "sendgrid" | ... | "auto" */
  emailPreferredProvider: string;
  /** SparkPost API key */
  emailSparkpostApiKey: string | null;
  /** SparkPost from address */
  emailSparkpostFrom: string | null;
  /** Mailgun API key */
  emailMailgunApiKey: string | null;
  /** Mailgun domain */
  emailMailgunDomain: string | null;
  /** Mailgun from address */
  emailMailgunFrom: string | null;
  /** SendGrid API key */
  emailSendgridApiKey: string | null;
  /** SendGrid from address */
  emailSendgridFrom: string | null;
  /** Mailjet API key */
  emailMailjetApiKey: string | null;
  /** Mailjet secret key */
  emailMailjetSecretKey: string | null;
  /** Mailjet from address */
  emailMailjetFrom: string | null;
  /** SendinBlue API key */
  emailSendinblueApiKey: string | null;
  /** SendinBlue from address */
  emailSendinblueFrom: string | null;
  /** SendPulse client ID */
  emailSendpulseClientId: string | null;
  /** SendPulse client secret */
  emailSendpulseClientSecret: string | null;
  /** SendPulse from address */
  emailSendpulseFrom: string | null;
  /** Pepipost API key */
  emailPepipostApiKey: string | null;
  /** Pepipost from address */
  emailPepipostFrom: string | null;
  /** Elastic Email API key */
  emailElasticemailApiKey: string | null;
  /** Elastic Email from address */
  emailElasticemailFrom: string | null;
};

const DEV_SITE_URL = "http://localhost:3000";

function parsePort(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : def;
}

function buildEnv(): AppEnv {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";
  const isDev = nodeEnv === "development";

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEV_SITE_URL).replace(/\/$/, "");

  const databaseUrl =
    process.env.DATABASE_URL || "file:./db/custom.db";

  // JWT_SECRET (preferred, see .env.config) or legacy AUTH_SECRET.
  // Required in production, dev-fallback in development.
  const authSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
  if (!authSecret) {
    if (isProd) {
      throw new Error(
        "[env] FATAL: JWT_SECRET is missing in production. " +
          "Generate one with `openssl rand -hex 32` and set it in .env.config."
      );
    }
    console.warn(
      "[env] WARNING: JWT_SECRET not set. Using insecure dev fallback. DO NOT use in production."
    );
  }
  if (authSecret && authSecret.length < 32 && isProd) {
    throw new Error(
      "[env] FATAL: JWT_SECRET must be at least 32 bytes in production."
    );
  }

  // SMTP / Resend — at least one must be configured in production for emails
  const smtpHost = process.env.SMTP_HOST || null;
  const smtpPort = parsePort(process.env.SMTP_PORT, 587);
  const smtpUser = process.env.SMTP_USER || null;
  const smtpPass = process.env.SMTP_PASS || null;
  const resendApiKey = process.env.RESEND_API_KEY || null;

  const emailFrom =
    process.env.EMAIL_FROM || (isProd ? "" : "Al Aminn <hello@alaminn.info>");
  const emailReplyTo =
    process.env.EMAIL_REPLY_TO || emailFrom;

  const smtpConfigured = !!(smtpHost && smtpPort && smtpUser && smtpPass);
  const emailConfigured = smtpConfigured || !!resendApiKey;

  if (isProd && !emailConfigured) {
    console.error(
      "[env] WARNING: No email transport configured (SMTP or RESEND_API_KEY). " +
        "Emails will not be sent in production. Set SMTP_* or RESEND_API_KEY."
    );
  }

  if (isProd && !emailFrom) {
    throw new Error(
      "[env] FATAL: EMAIL_FROM is missing in production."
    );
  }

  // ─── WhatsApp AI Agent ────────────────────────────────────────────────
  // OFFICIAL WHATSAPP NUMBER: 01716609554 (Bangladesh)
  // International format: 8801716609554 (used in wa.me deep links)
  // These can be overridden via env, but the defaults are the official numbers.
  const DEFAULT_WHATSAPP_NUMBER = "01716609554";
  const DEFAULT_WHATSAPP_INTL = "8801716609554";
  const DEFAULT_WHATSAPP_DISPLAY = "01716 609 554";

  const whatsappNumber = process.env.WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER;
  const whatsappInternationalNumber =
    process.env.WHATSAPP_INTERNATIONAL_NUMBER || DEFAULT_WHATSAPP_INTL;
  const whatsappDisplayNumber =
    process.env.WHATSAPP_DISPLAY_NUMBER || DEFAULT_WHATSAPP_DISPLAY;
  const whatsappBusinessName =
    process.env.WHATSAPP_BUSINESS_NAME || "Al Aminn Info";

  const whatsappWebhookVerifyToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null;
  const whatsappApiPhoneNumberId =
    process.env.WHATSAPP_API_PHONE_NUMBER_ID || null;
  const whatsappApiToken = process.env.WHATSAPP_API_TOKEN || null;
  const whatsappApiConfigured = !!(whatsappApiPhoneNumberId && whatsappApiToken);

  const whatsappAiProvider = process.env.WHATSAPP_AI_PROVIDER || "unorouter";
  const whatsappAiModel = process.env.WHATSAPP_AI_MODEL || "claude-opus-4-6-thinking";
  const rawAiMode = (process.env.WHATSAPP_AI_MODE || "ACTIVE").toUpperCase();
  const whatsappAiMode: AppEnv["whatsappAiMode"] =
    rawAiMode === "HUMAN_ONLY" ||
    rawAiMode === "APPROVAL_REQUIRED" ||
    rawAiMode === "PAUSED"
      ? rawAiMode
      : "ACTIVE";

  if (isProd && !whatsappApiConfigured) {
    console.warn(
      "[env] WARNING: WhatsApp Cloud API not configured (WHATSAPP_API_PHONE_NUMBER_ID + WHATSAPP_API_TOKEN). " +
        "WhatsApp AI agent will run in dev mode (responses returned in API body, not actually sent)."
    );
  }

  // ─── SMS (free provider failover loop) ─────────────────────────────
  const smsPreferredProvider =
    process.env.SMS_PREFERRED_PROVIDER || "httpsms";
  const smsHttpsmsApiKey = process.env.SMS_HTTPSMS_API_KEY || null;
  const smsHttpsmsBaseUrl = process.env.SMS_HTTPSMS_BASE_URL || null;
  const smsHttpsmsFrom = process.env.SMS_HTTPSMS_FROM || null;
  const smsTextbeltKey = process.env.SMS_TEXTBELT_KEY || null;
  const smsTwilioAccountSid = process.env.SMS_TWILIO_ACCOUNT_SID || null;
  const smsTwilioAuthToken = process.env.SMS_TWILIO_AUTH_TOKEN || null;
  const smsTwilioFrom = process.env.SMS_TWILIO_FROM || null;
  const smsPlivoAuthId = process.env.SMS_PLIVO_AUTH_ID || null;
  const smsPlivoAuthToken = process.env.SMS_PLIVO_AUTH_TOKEN || null;
  const smsPlivoFrom = process.env.SMS_PLIVO_FROM || null;

  // ─── Email (free provider failover loop) ─────────────────────────────
  const emailPreferredProvider =
    process.env.EMAIL_PREFERRED_PROVIDER || "sparkpost";
  const emailSparkpostApiKey = process.env.EMAIL_SPARKPOST_API_KEY || null;
  const emailSparkpostFrom = process.env.EMAIL_SPARKPOST_FROM || null;
  const emailMailgunApiKey = process.env.EMAIL_MAILGUN_API_KEY || null;
  const emailMailgunDomain = process.env.EMAIL_MAILGUN_DOMAIN || null;
  const emailMailgunFrom = process.env.EMAIL_MAILGUN_FROM || null;
  const emailSendgridApiKey = process.env.EMAIL_SENDGRID_API_KEY || null;
  const emailSendgridFrom = process.env.EMAIL_SENDGRID_FROM || null;
  const emailMailjetApiKey = process.env.EMAIL_MAILJET_API_KEY || null;
  const emailMailjetSecretKey = process.env.EMAIL_MAILJET_SECRET_KEY || null;
  const emailMailjetFrom = process.env.EMAIL_MAILJET_FROM || null;
  const emailSendinblueApiKey = process.env.EMAIL_SENDINBLUE_API_KEY || null;
  const emailSendinblueFrom = process.env.EMAIL_SENDINBLUE_FROM || null;
  const emailSendpulseClientId = process.env.EMAIL_SENDPULSE_CLIENT_ID || null;
  const emailSendpulseClientSecret = process.env.EMAIL_SENDPULSE_CLIENT_SECRET || null;
  const emailSendpulseFrom = process.env.EMAIL_SENDPULSE_FROM || null;
  const emailPepipostApiKey = process.env.EMAIL_PEPIPOST_API_KEY || null;
  const emailPepipostFrom = process.env.EMAIL_PEPIPOST_FROM || null;
  const emailElasticemailApiKey = process.env.EMAIL_ELASTICEMAIL_API_KEY || null;
  const emailElasticemailFrom = process.env.EMAIL_ELASTICEMAIL_FROM || null;

  return {
    nodeEnv,
    isProd,
    isDev,
    siteUrl,
    databaseUrl,
    authSecret: resolveAuthSecret(),
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    emailFrom,
    emailReplyTo,
    resendApiKey,
    emailConfigured,
    whatsappNumber,
    whatsappInternationalNumber,
    whatsappDisplayNumber,
    whatsappBusinessName,
    whatsappWebhookVerifyToken,
    whatsappApiPhoneNumberId,
    whatsappApiToken,
    whatsappApiConfigured,
    whatsappAiProvider,
    whatsappAiModel,
    whatsappAiMode,
    smsPreferredProvider,
    smsHttpsmsApiKey,
    smsHttpsmsBaseUrl,
    smsHttpsmsFrom,
    smsTextbeltKey,
    smsTwilioAccountSid,
    smsTwilioAuthToken,
    smsTwilioFrom,
    smsPlivoAuthId,
    smsPlivoAuthToken,
    smsPlivoFrom,
    emailPreferredProvider,
    emailSparkpostApiKey,
    emailSparkpostFrom,
    emailMailgunApiKey,
    emailMailgunDomain,
    emailMailgunFrom,
    emailSendgridApiKey,
    emailSendgridFrom,
    emailMailjetApiKey,
    emailMailjetSecretKey,
    emailMailjetFrom,
    emailSendinblueApiKey,
    emailSendinblueFrom,
    emailSendpulseClientId,
    emailSendpulseClientSecret,
    emailSendpulseFrom,
    emailPepipostApiKey,
    emailPepipostFrom,
    emailElasticemailApiKey,
    emailElasticemailFrom,
  };
}

let _env: AppEnv | null = null;

/**
 * Get the validated environment. Throws on first access if production
 * secrets are missing. Cached after first call.
 */
export function env(): AppEnv {
  if (!_env) _env = buildEnv();
  return _env;
}

/**
 * Force re-evaluation (useful for tests).
 * @internal
 */
export function _resetEnv() {
  _env = null;
}
