/**
 * Free Email Router — Multi-Provider Failover Loop
 * ================================================
 * Sends consent-based email with automatic failover: if provider A hits its
 * free-tier limit (429 / failure / network error) the router automatically
 * tries provider B, then C, and finally dev-mode. Mirrors the SMS router
 * in src/lib/sms/router.ts and the AI free-router in src/lib/ai/free-router.ts.
 *
 * Per-provider runtime metrics track calls / successes / failures / rate
 * limits and enforce a cooldown window after each 429 so a limited provider
 * isn't retried hot.
 *
 * SECURITY: Server-only. API keys/tokens are NEVER exposed to the client.
 * Only send to recipients who have given explicit marketing consent.
 */

import {
  EMAIL_PROVIDER_MAP,
  type EmailProviderId,
  type EmailSendResult,
  type EmailStatus,
  type ResolvedEmailProviderConfig,
} from "./providers";
import { resolveAllEmailProviderConfigs } from "./providers";

// Re-export types for consumers
export type { EmailSendResult, EmailStatus, EmailProviderId, ResolvedEmailProviderConfig };
export { EMAIL_PROVIDER_MAP, resolveAllEmailProviderConfigs };

interface EmailRuntimeMetric {
  calls: number;
  successes: number;
  failures: number;
  rateLimits: number;
  totalLatencyMs: number;
  lastUsedAt: number | null;
  lastError: string | null;
  cooldownUntil: number;
}

const providerMetrics = new Map<EmailProviderId, EmailRuntimeMetric>();

function metricFor(id: EmailProviderId): EmailRuntimeMetric {
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

export function getEmailRouterTelemetry() {
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

export function clearEmailRouterMetrics(): number {
  const count = providerMetrics.size;
  providerMetrics.clear();
  return count;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input).trim());
}

/**
 * SparkPost adapter: POST /api/v1/transmissions
 * { content: { from, subject, html, text }, recipients: [{ address: { email } }] }
 */
async function sendSparkPost(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/api/v1/transmissions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        content: {
          from: cfg.from || message.from || "hello@example.com",
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        recipients: [{ address: { email: to } }],
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("sparkpost");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`SparkPost rate-limited (HTTP 429)`);
      }
      throw new Error(`SparkPost HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
      results?: { total_accepted_recipients?: number; total_rejected_recipients?: number; id?: string };
    };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.results?.id || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `SparkPost network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mailgun adapter: POST /v3/{domain}/messages
 * Basic auth (api:api-key), form body { from, to, subject, text, html }.
 */
async function sendMailgun(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/${encodeURIComponent(cfg.domain || "")}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        from: cfg.from || message.from || "hello@example.com",
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }).toString(),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("mailgun");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Mailgun rate-limited (HTTP 429)`);
      }
      throw new Error(`Mailgun HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.id || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Mailgun network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SendGrid adapter: POST /v3/mail/send
 * Bearer auth, JSON body { personalizations: [{ to: [{ email }] }], from, subject, content: [...] }.
 */
async function sendSendGrid(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/mail/send`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [
          { to: [{ email: to }], subject: message.subject },
        ],
        from: { email: cfg.from || message.from || "hello@example.com" },
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("sendgrid");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`SendGrid rate-limited (HTTP 429)`);
      }
      throw new Error(`SendGrid HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    return {
      status: "SENT" as EmailStatus,
      messageId: res.headers.get("X-Message-Id") || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `SendGrid network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mailjet adapter: POST /v3/send
 * Basic auth (apiKey:secretKey), JSON body { Messages: [{ From, To, Subject, TextPart, HTMLPart }] }.
 */
async function sendMailjet(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/send`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.authToken}`).toString("base64")}`,
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: cfg.from || message.from || "hello@example.com", Name: "" },
            To: [{ Email: to, Name: "" }],
            Subject: message.subject,
            TextPart: message.text,
            HTMLPart: message.html,
          },
        ],
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("mailjet");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Mailjet rate-limited (HTTP 429)`);
      }
      throw new Error(`Mailjet HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
      Messages?: Array<{ MessageID?: string; Status?: string }>;
    };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.Messages?.[0]?.MessageID || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Mailjet network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SendinBlue (Brevo) adapter: POST /v3/smtp/email
 * Bearer auth, JSON body { sender, to: [{ email }], subject, textContent, htmlContent }.
 */
async function sendSendinBlue(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/smtp/email`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": cfg.apiKey,
      },
      body: JSON.stringify({
        sender: { email: cfg.from || message.from || "hello@example.com" },
        to: [{ email: to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("sendinblue");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`SendinBlue rate-limited (HTTP 429)`);
      }
      throw new Error(`SendinBlue HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.messageId || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `SendinBlue network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SendPulse adapter: OAuth2 token then POST /smtp/emails
 * Simplified: uses Bearer token from client credentials.
 */
async function sendSendPulse(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    // Get OAuth2 access token
    const tokenRes = await fetch(`${base}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
      signal: controller.signal,
    });
    if (!tokenRes.ok) {
      throw new Error(`SendPulse auth HTTP ${tokenRes.status}`);
    }
    const tokenData = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("SendPulse auth: no access token");

    const res = await fetch(`${base}/smtp/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        from: { name: "", email: cfg.from || message.from || "hello@example.com" },
        to: [{ name: "", email: to }],
        subject: message.subject,
        body: { html: message.html, text: message.text },
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("sendpulse");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`SendPulse rate-limited (HTTP 429)`);
      }
      throw new Error(`SendPulse HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.id || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `SendPulse network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pepipost adapter: POST /v2/send_mail
 * JSON body { from: { email, name }, to: [{ email, name }], subject, content: { body: "..." } }.
 */
async function sendPepipost(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/send_mail`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": cfg.apiKey,
      },
      body: JSON.stringify({
        from: { email: cfg.from || message.from || "hello@example.com", name: "" },
        to: [{ email: to, name: "" }],
        subject: message.subject,
        content: { body: message.html },
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("pepipost");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Pepipost rate-limited (HTTP 429)`);
      }
      throw new Error(`Pepipost HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { message_id?: string };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.message_id || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Pepipost network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Elastic Email adapter: POST /v4/email/send
 * JSON body { from, to, subject, body, content_type }.
 */
async function sendElasticEmail(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/email/send`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apikey: cfg.apiKey,
        from: cfg.from || message.from || "hello@example.com",
        to,
        subject: message.subject,
        body: message.html,
        isTransactional: true,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("elasticemail");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Elastic Email rate-limited (HTTP 429)`);
      }
      throw new Error(`Elastic Email HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.id || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Elastic Email network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resend adapter: POST /emails
 * Bearer auth, JSON body { from, to, subject, text, html }.
 */
async function sendResend(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/emails`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        from: cfg.from || message.from || "hello@example.com",
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const m = metricFor("resend");
    m.totalLatencyMs += latencyMs;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      if (res.status === 429) {
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Resend rate-limited (HTTP 429)`);
      }
      throw new Error(`Resend HTTP ${res.status}: ${errBody.slice(0, 160)}`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      status: "SENT" as EmailStatus,
      messageId: data.id || null,
      error: null,
      actuallySent: true,
      latencyMs,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `Resend network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SMTP adapter: uses nodemailer transport.
 */
async function sendSmtp(cfg: ResolvedEmailProviderConfig, to: string, message: {
  subject: string;
  html: string;
  text: string;
  from?: string;
}) {
  const start = Date.now();
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: cfg.host || "localhost",
    port: cfg.port || 587,
    secure: (cfg.port || 587) === 465,
    auth: { user: cfg.user || "", pass: cfg.pass || "" },
  });
  try {
    const info = await transport.sendMail({
      from: cfg.from || message.from || "hello@example.com",
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return {
      status: "SENT" as EmailStatus,
      messageId: info.messageId || null,
      error: null,
      actuallySent: true,
      latencyMs: Date.now() - start,
    };
  } finally {
    transport.close();
  }
}

/** Dev-mode provider: logs the email instead of sending. Always available. */
function sendDevNull(to: string, message: {
  subject: string;
  html: string;
  text: string;
}) {
  const m = metricFor("dev-null");
  const now = Date.now();
  m.calls++;
  m.successes++;
  m.lastUsedAt = now;
  console.log(
    `[email/dev-null] Would send email to ${to}: "${message.subject}"`
  );
  return {
    status: "PENDING" as EmailStatus,
    messageId: `dev-${now}-${to.split("@")[0]}`,
    error: null,
    actuallySent: false,
  };
}

/**
 * Send an email through the first available provider in the failover loop.
 *
 * @param to Recipient email address
 * @param message { subject, html, text, from? }
 * @param opts.preferredProvider Force a specific provider ("auto" = configured order)
 *
 * @returns EmailSendResult with providerUsed, fallbackTrail, and actuallySent flag
 */
export async function sendEmail(
  to: string,
  message: { subject: string; html: string; text: string; from?: string },
  opts?: { preferredProvider?: EmailProviderId | "auto" }
): Promise<EmailSendResult> {
  const startedAt = Date.now();
  if (!isValidEmail(to)) {
    return {
      status: "FAILED",
      providerUsed: "dev-null",
      providerName: EMAIL_PROVIDER_MAP["dev-null"].name,
      messageId: null,
      error: "Invalid recipient email address.",
      actuallySent: false,
      fallbackTrail: [],
    };
  }
  if (!message.subject || !message.text) {
    return {
      status: "FAILED",
      providerUsed: "dev-null",
      providerName: EMAIL_PROVIDER_MAP["dev-null"].name,
      messageId: null,
      error: "Subject and text body are required.",
      actuallySent: false,
      fallbackTrail: [],
    };
  }

  const { providers, global } = await resolveAllEmailProviderConfigs();
  const providerById = new Map(providers.map((p) => [p.spec.id, p]));

  const orderedIds: EmailProviderId[] = [];
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

  const fallbackTrail: EmailSendResult["fallbackTrail"] = [];
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
      const result = sendDevNull(to, message);
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
      let inner: Awaited<ReturnType<typeof sendSparkPost>>;
      if (providerId === "sparkpost") {
        inner = await sendSparkPost(cfg, to, message);
      } else if (providerId === "mailgun") {
        inner = await sendMailgun(cfg, to, message);
      } else if (providerId === "sendgrid") {
        inner = await sendSendGrid(cfg, to, message);
      } else if (providerId === "mailjet") {
        inner = await sendMailjet(cfg, to, message);
      } else if (providerId === "sendinblue") {
        inner = await sendSendinBlue(cfg, to, message);
      } else if (providerId === "sendpulse") {
        inner = await sendSendPulse(cfg, to, message);
      } else if (providerId === "pepipost") {
        inner = await sendPepipost(cfg, to, message);
      } else if (providerId === "elasticemail") {
        inner = await sendElasticEmail(cfg, to, message);
      } else if (providerId === "resend") {
        inner = await sendResend(cfg, to, message);
      } else if (providerId === "smtp") {
        inner = await sendSmtp(cfg, to, message);
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
      const isRateLimit =
        /rate.limit|429|quota/i.test(errMsg) ||
        errMsg.includes("HTTP 429");
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
    providerName: EMAIL_PROVIDER_MAP["dev-null"].name,
    messageId: null,
    error: "No email provider available.",
    actuallySent: false,
    fallbackTrail,
    latencyMs: Date.now() - startedAt,
  };
}
