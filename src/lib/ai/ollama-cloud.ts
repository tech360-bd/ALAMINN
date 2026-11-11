/**
 * Ollama Cloud Provider
 * =====================
 *
 * Per spec requirement §2: "Add a server-side Ollama Cloud provider using
 * https://ollama.com/api"
 *
 * This module implements Ollama Cloud as a distinct provider from the
 * existing local Ollama provider (which connects to a self-hosted
 * `ollama serve` at http://localhost:11434).
 *
 * KEY DIFFERENCES from the existing local Ollama:
 *   - Ollama Cloud uses https://ollama.com/api (cloud-hosted, requires API key)
 *   - Local Ollama uses http://localhost:11434/v1 (self-hosted, no key needed)
 *   - Both are configured separately (OLLAMA_CLOUD_* vs OLLAMA_* env vars)
 *   - Both can be enabled independently
 *
 * SECURITY (per spec §9):
 *   - OLLAMA_CLOUD_API_KEY is read from env, NEVER logged, NEVER sent to client.
 *   - Student PII is NOT automatically sent to cloud providers. The caller
 *     must explicitly mark a request as `allowCloudPII: true` after
 *     confirming consent. By default, PII fields are redacted before
 *     the request reaches Ollama Cloud.
 *   - All requests are server-side only.
 *
 * COST AWARENESS (per spec §19):
 *   - Ollama Cloud is a PAID service. This module does NOT claim it is free.
 *   - Usage (token count, latency) is tracked per request and recorded
 *     for budget enforcement.
 *   - The admin interface shows current plan limits and usage.
 */


// ─── Configuration ─────────────────────────────────────────────────

export interface OllamaCloudConfig {
  /** API key from OLLAMA_CLOUD_API_KEY env var. Required for cloud. */
  apiKey: string;
  /** Base URL. Defaults to https://ollama.com/api */
  baseUrl: string;
  /** Request timeout in ms. Default 30s. */
  timeoutMs: number;
  /** Max retries on 5xx/429. Default 2. */
  maxRetries: number;
  /** Whether the cloud provider is enabled (OLLAMA_CLOUD_ENABLED=true). */
  enabled: boolean;
}

const DEFAULT_CONFIG: OllamaCloudConfig = {
  apiKey: "",
  baseUrl: "https://ollama.com/api",
  timeoutMs: 30_000,
  maxRetries: 2,
  enabled: false,
};

/**
 * Read Ollama Cloud config from environment.
 * Server-side only — never call this from client code.
 */
export function getOllamaCloudConfig(): OllamaCloudConfig {
  return {
    apiKey: process.env.OLLAMA_CLOUD_API_KEY || "",
    baseUrl: process.env.OLLAMA_CLOUD_BASE_URL || DEFAULT_CONFIG.baseUrl,
    timeoutMs: process.env.OLLAMA_CLOUD_TIMEOUT_MS
      ? parseInt(process.env.OLLAMA_CLOUD_TIMEOUT_MS, 10)
      : DEFAULT_CONFIG.timeoutMs,
    maxRetries: process.env.OLLAMA_CLOUD_MAX_RETRIES
      ? parseInt(process.env.OLLAMA_CLOUD_MAX_RETRIES, 10)
      : DEFAULT_CONFIG.maxRetries,
    enabled: process.env.OLLAMA_CLOUD_ENABLED === "true",
  };
}

/**
 * Check if Ollama Cloud is configured and enabled.
 */
export function isOllamaCloudAvailable(): boolean {
  const cfg = getOllamaCloudConfig();
  return cfg.enabled && cfg.apiKey.length > 0;
}

// ─── Model Discovery (spec §4) ─────────────────────────────────────

export interface OllamaCloudModel {
  name: string;
  /** Model size in billions of parameters (if published). */
  sizeB?: number;
  /** Context window in tokens (if published). */
  contextLength?: number;
  /** Capabilities the model supports. */
  capabilities: string[];
  /** Pricing per 1M input tokens in USD (if published). */
  inputPricePer1M?: number;
  /** Pricing per 1M output tokens in USD (if published). */
  outputPricePer1M?: number;
}

export interface OllamaCloudModelListResult {
  models: OllamaCloudModel[];
  /** When the list was last fetched. */
  fetchedAt: string;
  /** Whether the fetch succeeded. */
  ok: boolean;
  error?: string;
}

// In-memory cache of discovered models (TTL 5 minutes).
let modelCache: { result: OllamaCloudModelListResult; expiresAt: number } | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Discover available models through the Ollama Cloud API.
 * Per spec §4: "Never assume a model is available."
 *
 * This makes a real GET request to https://ollama.com/api/models
 * (or the configured base URL). The result is cached for 5 minutes.
 */
export async function discoverOllamaCloudModels(
  forceRefresh = false
): Promise<OllamaCloudModelListResult> {
  // Return cached result if still fresh.
  if (!forceRefresh && modelCache && Date.now() < modelCache.expiresAt) {
    return modelCache.result;
  }

  const cfg = getOllamaCloudConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return {
      models: [],
      fetchedAt: new Date().toISOString(),
      ok: false,
      error: "Ollama Cloud is not enabled or API key is missing",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

    const response = await fetch(`${cfg.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        models: [],
        fetchedAt: new Date().toISOString(),
        ok: false,
        error: `Ollama Cloud API returned ${response.status}: ${errorText.substring(0, 200)}`,
      };
    }

    interface RawOllamaModel {
      name?: string;
      model?: string;
      details?: { parameter_size?: string };
      context_length?: number;
      max_context_length?: number;
      capabilities?: string[];
      pricing?: { input?: number; output?: number };
    }
    const data = (await response.json()) as { models?: RawOllamaModel[] };
    const models: OllamaCloudModel[] = (data.models || []).map((m: RawOllamaModel) => ({
      name: m.name || m.model || String(m),
      sizeB: m.details?.parameter_size ? parseFloat(m.details.parameter_size) : undefined,
      contextLength: m.context_length || m.max_context_length,
      capabilities: m.capabilities || ["text"],
      inputPricePer1M: m.pricing?.input,
      outputPricePer1M: m.pricing?.output,
    }));

    const result: OllamaCloudModelListResult = {
      models,
      fetchedAt: new Date().toISOString(),
      ok: true,
    };

    modelCache = { result, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
    return result;
  } catch (err) {
    return {
      models: [],
      fetchedAt: new Date().toISOString(),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if a specific model is available on Ollama Cloud.
 * Per spec §4: "Never assume a model is available."
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
  const result = await discoverOllamaCloudModels();
  if (!result.ok) return false;
  return result.models.some((m) => m.name === modelName);
}

// ─── PII Redaction (spec §9) ───────────────────────────────────────

/**
 * Patterns that indicate student personal information.
 * These are redacted before any request is sent to Ollama Cloud.
 */
const PII_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // Email addresses
  { name: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  // Phone numbers (Bangladesh + international)
  { name: "phone", regex: /(\+?880|0)?1[3-9]\d{8}/g, replacement: "[REDACTED_PHONE]" },
  // Passport numbers (basic pattern)
  { name: "passport", regex: /\b[A-Z]{1,2}\d{7,9}\b/g, replacement: "[REDACTED_PASSPORT]" },
  // National ID (Bangladesh 10 or 13 or 17 digits)
  { name: "nid", regex: /\b\d{10}(\d{3})?(\d{4})?\b/g, replacement: "[REDACTED_NID]" },
  // Credit card numbers
  { name: "credit_card", regex: /\b(?:\d[ -]*?){13,16}\b/g, replacement: "[REDACTED_CC]" },
];

/**
 * Redact PII from a message before sending to a cloud provider.
 * Per spec §9: "Do not automatically send student personal information to cloud providers."
 *
 * @param text The input text that may contain PII.
 * @param allowPII If true (explicit consent), PII is NOT redacted.
 * @returns The redacted text + a list of what was redacted.
 */
export function redactPII(
  text: string,
  allowPII: boolean = false
): { redacted: string; redactions: string[] } {
  if (allowPII) {
    return { redacted: text, redactions: [] };
  }

  let result = text;
  const redactions: string[] = [];

  for (const { name, regex, replacement } of PII_PATTERNS) {
    const matches = result.match(regex);
    if (matches && matches.length > 0) {
      redactions.push(`${name}:${matches.length}`);
      result = result.replace(regex, replacement);
    }
  }

  return { redacted: result, redactions };
}

// ─── Chat Completion (spec §8) ─────────────────────────────────────

export interface OllamaCloudChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaCloudChatOptions {
  model: string;
  messages: OllamaCloudChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Whether PII in the messages may be sent to the cloud. Default false. */
  allowPII?: boolean;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface OllamaCloudChatResult {
  content: string;
  model: string;
  /** Token usage if reported by the API. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Latency in milliseconds. */
  latencyMs: number;
  /** Whether the response came from a retry. */
  retried: boolean;
  /** Number of retries attempted. */
  retryCount: number;
  /** List of PII fields that were redacted. */
  redactions: string[];
}

/**
 * Execute a chat completion against Ollama Cloud.
 *
 * Per spec §8: "Implement provider fallback with health checks, timeouts,
 * retry limits, circuit breakers and usage tracking."
 *
 * This function implements:
 *   - PII redaction (spec §9)
 *   - Timeout enforcement (AbortController)
 *   - Retry on 429/5xx (maxRetries)
 *   - Exponential backoff between retries
 *   - Usage tracking (tokens + latency)
 *
 * @throws Error if the request fails after all retries.
 */
export async function ollamaCloudChat(
  opts: OllamaCloudChatOptions
): Promise<OllamaCloudChatResult> {
  const cfg = getOllamaCloudConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    throw new Error("Ollama Cloud is not enabled or API key is missing");
  }

  // PII redaction (spec §9)
  const redactions: string[] = [];
  const redactedMessages = opts.messages.map((msg) => {
    const { redacted, redactions: r } = redactPII(msg.content, opts.allowPII);
    if (r.length > 0) redactions.push(...r);
    return { ...msg, content: redacted };
  });

  const requestBody = {
    model: opts.model,
    messages: redactedMessages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2000,
    stream: false,
  };

  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

      // Link external signal if provided
      if (opts.signal) {
        opts.signal.addEventListener("abort", () => controller.abort());
      }

      const response = await fetch(`${cfg.baseUrl}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (response.status === 429 || response.status >= 500) {
        // Retryable error
        lastError = new Error(`Ollama Cloud returned ${response.status}`);
        retryCount++;
        if (attempt < cfg.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s...
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        break;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Ollama Cloud API error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      // Handle both response shapes (Ollama native + OpenAI-compatible)
      const content =
        data.message?.content ||
        data.choices?.[0]?.message?.content ||
        "";

      if (!content) {
        throw new Error("Ollama Cloud returned an empty response");
      }

      return {
        content,
        model: opts.model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        latencyMs,
        retried: retryCount > 0,
        retryCount,
        redactions,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retryCount++;
      if (attempt < cfg.maxRetries && lastError.message.includes("abort")) {
        // Don't retry on abort (user cancellation)
        break;
      }
      if (attempt < cfg.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
    }
  }

  throw lastError || new Error("Ollama Cloud request failed after all retries");
}

// ─── Health Check (spec §8) ────────────────────────────────────────

export interface OllamaCloudHealth {
  provider: "ollama-cloud";
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
  modelCount?: number;
  error?: string;
  checkedAt: string;
}

/**
 * Check the health of the Ollama Cloud provider.
 * Per spec §8: "health checks"
 */
export async function checkOllamaCloudHealth(): Promise<OllamaCloudHealth> {
  const cfg = getOllamaCloudConfig();
  const checkedAt = new Date().toISOString();

  if (!cfg.enabled) {
    return {
      provider: "ollama-cloud",
      enabled: false,
      configured: false,
      reachable: false,
      checkedAt,
    };
  }

  if (!cfg.apiKey) {
    return {
      provider: "ollama-cloud",
      enabled: true,
      configured: false,
      reachable: false,
      error: "OLLAMA_CLOUD_API_KEY is not set",
      checkedAt,
    };
  }

  const startTime = Date.now();
  const modelsResult = await discoverOllamaCloudModels(true);
  const latencyMs = Date.now() - startTime;

  return {
    provider: "ollama-cloud",
    enabled: true,
    configured: true,
    reachable: modelsResult.ok,
    latencyMs,
    modelCount: modelsResult.models.length,
    error: modelsResult.error,
    checkedAt,
  };
}

// ─── Circuit Breaker (spec §8) ─────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailureAt: number;
  tripped: boolean;
}

const circuitState: CircuitBreakerState = {
  failures: 0,
  lastFailureAt: 0,
  tripped: false,
};

const CIRCUIT_BREAKER_THRESHOLD = 5; // Trip after 5 consecutive failures
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // Reset after 5 minutes

/**
 * Check if the circuit breaker is tripped.
 * Per spec §8: "circuit breakers"
 */
export function isCircuitTripped(): boolean {
  if (!circuitState.tripped) return false;
  // Auto-reset after cooldown
  if (Date.now() - circuitState.lastFailureAt > CIRCUIT_BREAKER_RESET_MS) {
    circuitState.tripped = false;
    circuitState.failures = 0;
    return false;
  }
  return true;
}

/**
 * Record a failure for the circuit breaker.
 */
export function recordCircuitFailure(): void {
  circuitState.failures++;
  circuitState.lastFailureAt = Date.now();
  if (circuitState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitState.tripped = true;
  }
}

/**
 * Reset the circuit breaker (e.g., after a successful request).
 */
export function resetCircuit(): void {
  circuitState.failures = 0;
  circuitState.tripped = false;
}

/**
 * Get current circuit breaker state (for admin UI).
 */
export function getCircuitState(): CircuitBreakerState {
  return { ...circuitState };
}

// ─── Cost Tracking (spec §15, §19) ─────────────────────────────────

export interface OllamaCloudUsageRecord {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  /** Estimated cost in USD (if pricing is known). */
  estimatedCostUsd?: number;
  timestamp: string;
  redactions: string[];
  retried: boolean;
}

// In-memory usage log (last 1000 requests). For production, persist to DB.
const usageLog: OllamaCloudUsageRecord[] = [];
const MAX_USAGE_LOG = 1000;

/**
 * Record a usage event. Called after every successful request.
 * Per spec §15: "Record model, latency, token usage where available, provider
 * errors and actual costs when measurable."
 */
export function recordUsage(record: OllamaCloudUsageRecord): void {
  usageLog.push(record);
  if (usageLog.length > MAX_USAGE_LOG) {
    usageLog.shift();
  }
}

/**
 * Get recent usage records (for admin UI).
 */
export function getRecentUsage(limit: number = 100): OllamaCloudUsageRecord[] {
  return usageLog.slice(-limit).reverse();
}

/**
 * Get aggregate usage stats.
 */
export function getUsageStats(): {
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  estimatedTotalCostUsd: number;
  errorCount: number;
} {
  const records = usageLog;
  const totalTokens = records.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
  const avgLatencyMs =
    records.length > 0
      ? Math.round(records.reduce((sum, r) => sum + r.latencyMs, 0) / records.length)
      : 0;
  const estimatedTotalCostUsd = records.reduce(
    (sum, r) => sum + (r.estimatedCostUsd || 0),
    0
  );

  return {
    totalRequests: records.length,
    totalTokens,
    avgLatencyMs,
    estimatedTotalCostUsd,
    errorCount: circuitState.failures,
  };
}
