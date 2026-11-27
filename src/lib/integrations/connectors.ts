/**
 * Real, bounded connection tests for connectable integrations.
 * Admin-only (integration_settings.update), same-origin guarded at the route.
 * - Hard timeout, no redirect following (avoids redirect-based SSRF escalation).
 * - Blocks the cloud link-local metadata endpoint.
 * - Never returns raw secrets or full upstream bodies to the client.
 */
import type { IntegrationDefinition } from "./registry";

export interface TestResult { ok: boolean; message: string; status?: number; latencyMs: number; }

const TIMEOUT = 12000;

function guardUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid base URL."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https URLs are allowed.");
  const host = u.hostname.toLowerCase();
  if (host === "169.254.169.254" || host === "metadata.google.internal" || host.endsWith(".internal") && host === "metadata.google.internal") {
    throw new Error("Cloud metadata endpoints are not allowed.");
  }
  return u;
}

async function probe(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) });
}

function trimBase(base: string): string { return base.replace(/\/+$/, ""); }

/** httpSMS: GET /v1/users/me with x-api-key. */
async function testHttpSms(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.apiKey) return { ok: false, message: "Add your httpSMS API key first.", latencyMs: 0 };
  const base = trimBase(cfg.baseUrl || "https://api.httpsms.com");
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/v1/users/me`, { headers: { "x-api-key": cfg.apiKey, Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Connected to httpSMS. Your device API key is valid.", status: r.status, latencyMs };
    if (r.status === 401 || r.status === 403) return { ok: false, message: "httpSMS rejected the API key (unauthorized).", status: r.status, latencyMs };
    return { ok: false, message: `httpSMS responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach httpSMS.", latencyMs: Date.now() - start }; }
}
/** Textbelt: GET /status?key=... to validate a key (free tier: key=TEXTBELT). */
async function testTextbelt(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "https://textbelt.com");
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/status?key=${encodeURIComponent(cfg.apiKey || "TEXTBELT")}`, {
      headers: { Accept: "application/json" },
    });
    const latencyMs = Date.now() - start;
    if (r.ok) {
      const body = (await r.json().catch(() => ({}))) as { success?: boolean; quotaRemaining?: number };
      if (body.success) {
        return { ok: true, message: `Textbelt key is valid (quota remaining: ${body.quotaRemaining ?? "n/a"}).`, status: r.status, latencyMs };
      }
      return { ok: false, message: "Textbelt rejected the key.", status: r.status, latencyMs };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, message: "Textbelt rejected the key (unauthorized).", status: r.status, latencyMs };
    return { ok: false, message: `Textbelt responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach Textbelt.", latencyMs: Date.now() - start }; }
}
/** SparkPost: GET /api/v1/account with x-api-key auth. */
async function testSparkPost(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.apiKey) return { ok: false, message: "Add your SparkPost API key first.", latencyMs: 0 };
  const base = trimBase(cfg.baseUrl || "https://api.sparkpost.com");
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/api/v1/account`, { headers: { "x-api-key": cfg.apiKey, Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Connected to SparkPost. Your API key is valid.", status: r.status, latencyMs };
    if (r.status === 401 || r.status === 403) return { ok: false, message: "SparkPost rejected the API key (unauthorized).", status: r.status, latencyMs };
    return { ok: false, message: `SparkPost responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach SparkPost.", latencyMs: Date.now() - start }; };
}

/** Pepipost: GET /v2/send_mail with api_key header. */
async function testPepipost(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.apiKey) return { ok: false, message: "Add your Pepipost API key first.", latencyMs: 0 };
  const base = trimBase(cfg.baseUrl || "https://api.pepipost.com/v2");
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/send_mail`, { headers: { api_key: cfg.apiKey, Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Connected to Pepipost. Your API key is valid.", status: r.status, latencyMs };
    if (r.status === 401 || r.status === 403) return { ok: false, message: "Pepipost rejected the API key (unauthorized).", status: r.status, latencyMs };
    return { ok: false, message: `Pepipost responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach Pepipost.", latencyMs: Date.now() - start }; };
}

/** Elastic Email: GET /v4/email/send with apikey param. */
async function testElasticEmail(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.apiKey) return { ok: false, message: "Add your Elastic Email API key first.", latencyMs: 0 };
  const base = trimBase(cfg.baseUrl || "https://api.elasticemail.com/v4");
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/email/send?apikey=${encodeURIComponent(cfg.apiKey)}`, { headers: { Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Connected to Elastic Email. Your API key is valid.", status: r.status, latencyMs };
    if (r.status === 401 || r.status === 403) return { ok: false, message: "Elastic Email rejected the API key (unauthorized).", status: r.status, latencyMs };
    return { ok: false, message: `Elastic Email responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach Elastic Email.", latencyMs: Date.now() - start }; };
}

/** OpenRouter: GET /api/v1/key with Bearer. */
async function testOpenRouter(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.apiKey) return { ok: false, message: "Add your OpenRouter API key first.", latencyMs: 0 };
  try {
    const r = await probe("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "OpenRouter key is valid.", status: r.status, latencyMs };
    if (r.status === 401) return { ok: false, message: "OpenRouter rejected the key (unauthorized).", status: r.status, latencyMs };
    return { ok: false, message: `OpenRouter responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach OpenRouter.", latencyMs: Date.now() - start }; }
}

/** Meta Graph: GET /{version}/me?fields=id,name with Bearer. */
async function testMeta(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.accessToken) return { ok: false, message: "Add a Graph access token first.", latencyMs: 0 };
  const version = (cfg.apiVersion || "v21.0").replace(/[^a-z0-9.]/gi, "") || "v21.0";
  try {
    const r = await probe(`https://graph.facebook.com/${version}/me?fields=id,name`, { headers: { Authorization: `Bearer ${cfg.accessToken}`, Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Meta Graph token is valid.", status: r.status, latencyMs };
    if (r.status === 400 || r.status === 401) return { ok: false, message: "Meta rejected the token (expired or invalid).", status: r.status, latencyMs };
    return { ok: false, message: `Meta Graph responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach Meta Graph.", latencyMs: Date.now() - start }; }
}

/**
 * Generic self-hosted service: probe the base URL (or /health, /api/health).
 * Confirms reachability + optional bearer auth. Does not assume a specific API.
 */
async function testGeneric(def: IntegrationDefinition, cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  if (!cfg.baseUrl) return { ok: false, message: `Add the ${def.name} base URL first.`, latencyMs: 0 };
  const base = trimBase(cfg.baseUrl);
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const paths = ["/health", "/api/health", "/"];
  let lastStatus: number | undefined;
  for (const p of paths) {
    try {
      const r = await probe(`${base}${p}`, { headers });
      lastStatus = r.status;
      // 2xx/3xx = reachable; 401/403 = reachable but auth needed.
      if (r.status < 400) return { ok: true, message: `${def.name} is reachable at ${base}.`, status: r.status, latencyMs: Date.now() - start };
      if (r.status === 401 || r.status === 403) return { ok: false, message: `${def.name} is reachable but rejected the credentials (${r.status}).`, status: r.status, latencyMs: Date.now() - start };
    } catch { /* try next path */ }
  }
  return { ok: false, message: `Could not reach ${def.name} at ${base}${lastStatus ? ` (last status ${lastStatus})` : ""}. Check the URL, TLS and that the service is running.`, status: lastStatus, latencyMs: Date.now() - start };
}

/**
 * AI-OS service probes (deploy/ai-os microservices). Each probes a real,
 * documented health endpoint; 401/403 still proves reachability.
 */
/** LiteLLM: GET /health/liveliness (public), then /v1/models with the master key. */
async function testLiteLLM(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "");
  if (!base) return { ok: false, message: "Add the LiteLLM proxy base URL first.", latencyMs: 0 };
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const health = await probe(`${base}/health/liveliness`, { headers: { Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (health.status >= 400) {
      return { ok: false, message: `LiteLLM responded with status ${health.status} on /health/liveliness.`, status: health.status, latencyMs };
    }
    if (cfg.masterKey) {
      const models = await probe(`${base}/v1/models`, { headers: { Authorization: `Bearer ${cfg.masterKey}`, Accept: "application/json" } });
      if (models.status === 401 || models.status === 403) {
        return { ok: false, message: "LiteLLM is reachable but rejected the master key.", status: models.status, latencyMs: Date.now() - start };
      }
      if (models.ok) {
        return { ok: true, message: "Connected to LiteLLM. Proxy is live and the master key is valid.", status: models.status, latencyMs: Date.now() - start };
      }
      return { ok: false, message: `LiteLLM is reachable (/health ${health.status}) but /v1/models returned ${models.status}.`, status: models.status, latencyMs: Date.now() - start };
    }
    return { ok: true, message: "LiteLLM proxy is reachable. Add the master key to verify authentication.", status: health.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach LiteLLM.", latencyMs: Date.now() - start }; }
}
/** LibreChat: GET /api/health → {"ok":true}. */
async function testLibreChat(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "");
  if (!base) return { ok: false, message: "Add the LibreChat base URL first.", latencyMs: 0 };
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/api/health`, { headers: { Accept: "application/json" } });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Connected to LibreChat (health OK).", status: r.status, latencyMs };
    if (r.status === 401 || r.status === 403) return { ok: false, message: "LibreChat is reachable but requires authentication.", status: r.status, latencyMs };
    return { ok: false, message: `LibreChat responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach LibreChat.", latencyMs: Date.now() - start }; }
}
/** Open-WebUI: GET /api/config. */
async function testOpenWebUI(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "");
  if (!base) return { ok: false, message: "Add the Open-WebUI base URL first.", latencyMs: 0 };
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const r = await probe(`${base}/api/config`, { headers });
    const latencyMs = Date.now() - start;
    if (r.ok) return { ok: true, message: "Connected to Open-WebUI.", status: r.status, latencyMs };
    if (r.status === 401 || r.status === 403) return { ok: false, message: "Open-WebUI is reachable but rejected the credentials.", status: r.status, latencyMs };
    return { ok: false, message: `Open-WebUI responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach Open-WebUI.", latencyMs: Date.now() - start }; }
}
/** Activepieces: GET /healthz (also /api/v1/healthz). */
async function testActivepieces(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "");
  if (!base) return { ok: false, message: "Add the Activepieces base URL first.", latencyMs: 0 };
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  for (const path of ["/healthz", "/api/v1/healthz"]) {
    try {
      const r = await probe(`${base}${path}`, { headers });
      const latencyMs = Date.now() - start;
      if (r.status < 400) return { ok: true, message: "Connected to Activepieces.", status: r.status, latencyMs };
      if (r.status === 401 || r.status === 403) return { ok: false, message: "Activepieces is reachable but rejected the API key.", status: r.status, latencyMs };
    } catch { /* try next path */ }
  }
  return { ok: false, message: "Could not reach Activepieces on /healthz or /api/v1/healthz. Check the URL and that the service is running.", latencyMs: Date.now() - start };
}
/** Temporal: GET /health on the frontend service (host:port). */
async function testTemporal(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const raw = (cfg.baseUrl || "").trim();
  if (!raw) return { ok: false, message: "Add the Temporal frontend address (host:port, e.g. 127.0.0.1:7233) first.", latencyMs: 0 };
  const base = /^https?:\/\//i.test(raw) ? trimBase(raw) : `http://${raw.replace(/^\/+/, "")}`;
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid address.", latencyMs: 0 }; }
  try {
    const r = await probe(`${base}/health`, { headers: { Accept: "text/plain, application/json" } });
    const latencyMs = Date.now() - start;
    if (r.status < 400) return { ok: true, message: "Connected to the Temporal frontend service.", status: r.status, latencyMs };
    return { ok: false, message: `Temporal frontend responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach the Temporal frontend.", latencyMs: Date.now() - start }; }
}
/** Directus: GET /server/health → {"status":"ok"}. */
async function testDirectus(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "");
  if (!base) return { ok: false, message: "Add the Directus base URL first.", latencyMs: 0 };
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const r = await probe(`${base}/server/health`, { headers });
    const latencyMs = Date.now() - start;
    if (r.ok) {
      const body = (await r.json().catch(() => ({}))) as { status?: string; database?: boolean };
      if (body.database === false) return { ok: false, message: "Directus is reachable but its database connection is down.", status: r.status, latencyMs };
      return { ok: true, message: "Connected to Directus.", status: r.status, latencyMs };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, message: "Directus is reachable but rejected the token.", status: r.status, latencyMs };
    return { ok: false, message: `Directus responded with status ${r.status}.`, status: r.status, latencyMs };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not reach Directus.", latencyMs: Date.now() - start }; }
}
/** NocoBase: GET /api/app:getInfo (or /api/healthz). */
async function testNocoBase(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "");
  if (!base) return { ok: false, message: "Add the NocoBase base URL first.", latencyMs: 0 };
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  for (const path of ["/api/healthz", "/api/app:getInfo"]) {
    try {
      const r = await probe(`${base}${path}`, { headers });
      const latencyMs = Date.now() - start;
      if (r.status < 400) return { ok: true, message: "Connected to NocoBase.", status: r.status, latencyMs };
      if (r.status === 401 || r.status === 403) return { ok: false, message: "NocoBase is reachable but rejected the API token.", status: r.status, latencyMs };
    } catch { /* try next path */ }
  }
  return { ok: false, message: "Could not reach NocoBase on /api/healthz or /api/app:getInfo.", latencyMs: Date.now() - start };
}

/**
 * ALO Education (source-of-truth education-service partner):
 * verify the referral destination endpoints are reachable.
 * Higher Study referrals point at `{base}/student/register` (the
 * ALO_EDUCATION_REGISTER_URL contract in src/lib/higher-study/constants.ts),
 * so that exact path is probed first, then `/api/health` and `/` as fallbacks.
 * The optional service API key is sent as a Bearer token and NEVER appears
 * in any returned message.
 */
async function testAloEducation(cfg: Record<string, string>): Promise<TestResult> {
  const start = Date.now();
  const base = trimBase(cfg.baseUrl || "https://aloeducation.com");
  try { guardUrl(base); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Invalid base URL.", latencyMs: 0 }; }
  const headers: Record<string, string> = { Accept: "text/html,application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const paths = ["/student/register", "/api/health", "/"];
  let lastStatus: number | undefined;
  for (const p of paths) {
    try {
      const r = await probe(`${base}${p}`, { headers });
      lastStatus = r.status;
      if (r.status < 400) {
        const detail = p === "/student/register" ? " Referral destination endpoint is live." : "";
        return { ok: true, message: `ALO Education is reachable at ${base}${detail}`, status: r.status, latencyMs: Date.now() - start };
      }
      if (r.status === 401 || r.status === 403) return { ok: false, message: `ALO Education is reachable but rejected the service credentials (${r.status}).`, status: r.status, latencyMs: Date.now() - start };
    } catch { /* try next path */ }
  }
  return { ok: false, message: `Could not reach ALO Education at ${base}${lastStatus ? ` (last status ${lastStatus})` : ""}. Referral handoffs will still be recorded and retried, but live routing is blocked. Check the URL and TLS.`, status: lastStatus, latencyMs: Date.now() - start };
}

export async function testIntegration(def: IntegrationDefinition, cfg: Record<string, string>): Promise<TestResult> {
  switch (def.connector) {
    case "alo-education": return testAloEducation(cfg);
    case "httpsms": return testHttpSms(cfg);
    case "textbelt": return testTextbelt(cfg);
    case "sparkpost": return testSparkPost(cfg);
    case "pepipost": return testPepipost(cfg);
    case "elasticemail": return testElasticEmail(cfg);
    case "openrouter": return testOpenRouter(cfg);
    case "meta": return testMeta(cfg);
    case "litellm": return testLiteLLM(cfg);
    case "librechat": return testLibreChat(cfg);
    case "open-webui": return testOpenWebUI(cfg);
    case "activepieces": return testActivepieces(cfg);
    case "temporal": return testTemporal(cfg);
    case "directus": return testDirectus(cfg);
    case "nocobase": return testNocoBase(cfg);
    case "generic": return testGeneric(def, cfg);
    default: return { ok: false, message: "This integration has no runtime connector (reference/desktop only).", latencyMs: 0 };
  }
}
