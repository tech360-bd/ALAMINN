import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for the Ollama Cloud provider (spec §17).
 *
 * These tests cover:
 *   - PII redaction (spec §9)
 *   - Circuit breaker behavior (spec §8)
 *   - Usage tracking (spec §15)
 *   - Model discovery (spec §4)
 *   - Configuration parsing
 *
 * Network calls are mocked — no real requests to ollama.com are made.
 */

// Mock environment variables for each test.
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("Ollama Cloud Provider", () => {
  beforeEach(() => {
    // Reset env + module state before each test.
    setEnv({
      OLLAMA_CLOUD_ENABLED: undefined,
      OLLAMA_CLOUD_API_KEY: undefined,
      OLLAMA_CLOUD_BASE_URL: undefined,
      OLLAMA_CLOUD_TIMEOUT_MS: undefined,
      OLLAMA_CLOUD_MAX_RETRIES: undefined,
    });
    vi.resetModules();
  });

  // ─── Configuration (spec §2, §3) ─────────────────────────────────

  describe("getOllamaCloudConfig", () => {
    it("returns disabled config by default", async () => {
      const { getOllamaCloudConfig } = await import("@/lib/ai/ollama-cloud");
      const cfg = getOllamaCloudConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.apiKey).toBe("");
      expect(cfg.baseUrl).toBe("https://ollama.com/api");
    });

    it("reads configuration from environment", async () => {
      setEnv({
        OLLAMA_CLOUD_ENABLED: "true",
        OLLAMA_CLOUD_API_KEY: "test-key-123",
        OLLAMA_CLOUD_BASE_URL: "https://custom.example/api",
        OLLAMA_CLOUD_TIMEOUT_MS: "15000",
        OLLAMA_CLOUD_MAX_RETRIES: "5",
      });
      const { getOllamaCloudConfig } = await import("@/lib/ai/ollama-cloud");
      const cfg = getOllamaCloudConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.apiKey).toBe("test-key-123");
      expect(cfg.baseUrl).toBe("https://custom.example/api");
      expect(cfg.timeoutMs).toBe(15000);
      expect(cfg.maxRetries).toBe(5);
    });
  });

  describe("isOllamaCloudAvailable", () => {
    it("returns false when disabled", async () => {
      const { isOllamaCloudAvailable } = await import("@/lib/ai/ollama-cloud");
      expect(isOllamaCloudAvailable()).toBe(false);
    });

    it("returns false when enabled but no API key", async () => {
      setEnv({ OLLAMA_CLOUD_ENABLED: "true" });
      const { isOllamaCloudAvailable } = await import("@/lib/ai/ollama-cloud");
      expect(isOllamaCloudAvailable()).toBe(false);
    });

    it("returns true when enabled + API key present", async () => {
      setEnv({ OLLAMA_CLOUD_ENABLED: "true", OLLAMA_CLOUD_API_KEY: "key" });
      const { isOllamaCloudAvailable } = await import("@/lib/ai/ollama-cloud");
      expect(isOllamaCloudAvailable()).toBe(true);
    });
  });

  // ─── PII Redaction (spec §9) ─────────────────────────────────────

  describe("redactPII", () => {
    it("redacts email addresses by default", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted, redactions } = redactPII(
        "Contact me at student@example.com",
        false
      );
      expect(redacted).toContain("[REDACTED_EMAIL]");
      expect(redacted).not.toContain("student@example.com");
      expect(redactions).toContain("email:1");
    });

    it("redacts Bangladesh phone numbers", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted } = redactPII("Call me at 01716609554", false);
      expect(redacted).toContain("[REDACTED_PHONE]");
      expect(redacted).not.toContain("01716609554");
    });

    it("redacts +880 format phone numbers", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted } = redactPII("WhatsApp: +8801716609554", false);
      expect(redacted).toContain("[REDACTED_PHONE]");
    });

    it("redacts passport numbers", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted } = redactPII("Passport: BR1234567", false);
      expect(redacted).toContain("[REDACTED_PASSPORT]");
    });

    it("does NOT redact PII when allowPII is true (explicit consent)", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted, redactions } = redactPII(
        "Email: student@example.com",
        true
      );
      expect(redacted).toContain("student@example.com");
      expect(redactions).toHaveLength(0);
    });

    it("redacts multiple PII types in one message", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted, redactions } = redactPII(
        "Email: a@b.com, Phone: 01716609554",
        false
      );
      expect(redacted).toContain("[REDACTED_EMAIL]");
      expect(redacted).toContain("[REDACTED_PHONE]");
      expect(redactions.length).toBeGreaterThanOrEqual(2);
    });

    it("leaves non-PII text untouched", async () => {
      const { redactPII } = await import("@/lib/ai/ollama-cloud");
      const { redacted, redactions } = redactPII(
        "I want to study MBA in UK",
        false
      );
      expect(redacted).toBe("I want to study MBA in UK");
      expect(redactions).toHaveLength(0);
    });
  });

  // ─── Circuit Breaker (spec §8) ───────────────────────────────────

  describe("circuit breaker", () => {
    it("starts in non-tripped state", async () => {
      const { isCircuitTripped, getCircuitState } = await import("@/lib/ai/ollama-cloud");
      expect(isCircuitTripped()).toBe(false);
      expect(getCircuitState().failures).toBe(0);
    });

    it("trips after 5 consecutive failures", async () => {
      const { recordCircuitFailure, isCircuitTripped, resetCircuit } = await import("@/lib/ai/ollama-cloud");
      resetCircuit();
      for (let i = 0; i < 5; i++) {
        recordCircuitFailure();
      }
      expect(isCircuitTripped()).toBe(true);
    });

    it("does NOT trip before 5 failures", async () => {
      const { recordCircuitFailure, isCircuitTripped, resetCircuit } = await import("@/lib/ai/ollama-cloud");
      resetCircuit();
      for (let i = 0; i < 4; i++) {
        recordCircuitFailure();
      }
      expect(isCircuitTripped()).toBe(false);
    });

    it("resets after a successful request", async () => {
      const { recordCircuitFailure, resetCircuit, isCircuitTripped, getCircuitState } = await import("@/lib/ai/ollama-cloud");
      resetCircuit();
      recordCircuitFailure();
      recordCircuitFailure();
      resetCircuit(); // Simulate successful request
      expect(isCircuitTripped()).toBe(false);
      expect(getCircuitState().failures).toBe(0);
    });
  });

  // ─── Usage Tracking (spec §15) ───────────────────────────────────

  describe("usage tracking", () => {
    it("records and retrieves usage", async () => {
      const { recordUsage, getRecentUsage } = await import("@/lib/ai/ollama-cloud");
      const record = {
        model: "qwen3:8b",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        latencyMs: 1200,
        estimatedCostUsd: 0.001,
        timestamp: new Date().toISOString(),
        redactions: ["email:1"],
        retried: false,
      };
      recordUsage(record);
      const recent = getRecentUsage(10);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].model).toBe("qwen3:8b");
      expect(recent[0].totalTokens).toBe(150);
    });

    it("computes aggregate stats", async () => {
      const { recordUsage, getUsageStats, resetCircuit } = await import("@/lib/ai/ollama-cloud");
      resetCircuit(); // Reset error count
      recordUsage({
        model: "qwen3:8b",
        totalTokens: 100,
        latencyMs: 1000,
        estimatedCostUsd: 0.001,
        timestamp: new Date().toISOString(),
        redactions: [],
        retried: false,
      });
      recordUsage({
        model: "qwen3:8b",
        totalTokens: 200,
        latencyMs: 2000,
        estimatedCostUsd: 0.002,
        timestamp: new Date().toISOString(),
        redactions: [],
        retried: false,
      });
      const stats = getUsageStats();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(2);
      expect(stats.totalTokens).toBeGreaterThanOrEqual(300);
      expect(stats.estimatedTotalCostUsd).toBeGreaterThanOrEqual(0.003);
    });
  });

  // ─── Model Discovery (spec §4) ───────────────────────────────────

  describe("discoverOllamaCloudModels", () => {
    it("returns not-configured error when disabled", async () => {
      const { discoverOllamaCloudModels } = await import("@/lib/ai/ollama-cloud");
      const result = await discoverOllamaCloudModels(true);
      expect(result.ok).toBe(false);
      expect(result.models).toHaveLength(0);
      expect(result.error).toContain("not enabled");
    });

    it("returns empty list when enabled but no API key", async () => {
      setEnv({ OLLAMA_CLOUD_ENABLED: "true" });
      const { discoverOllamaCloudModels } = await import("@/lib/ai/ollama-cloud");
      const result = await discoverOllamaCloudModels(true);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("API key");
    });
  });

  // ─── Health Check (spec §8) ──────────────────────────────────────

  describe("checkOllamaCloudHealth", () => {
    it("returns disabled state when not enabled", async () => {
      const { checkOllamaCloudHealth } = await import("@/lib/ai/ollama-cloud");
      const health = await checkOllamaCloudHealth();
      expect(health.enabled).toBe(false);
      expect(health.reachable).toBe(false);
    });

    it("returns configured=false when enabled but no key", async () => {
      setEnv({ OLLAMA_CLOUD_ENABLED: "true" });
      const { checkOllamaCloudHealth } = await import("@/lib/ai/ollama-cloud");
      const health = await checkOllamaCloudHealth();
      expect(health.enabled).toBe(true);
      expect(health.configured).toBe(false);
      expect(health.error).toContain("OLLAMA_CLOUD_API_KEY");
    });
  });

  // ─── Local Ollama is separate (spec §6) ──────────────────────────

  describe("local Ollama is separate from cloud (spec §6)", () => {
    it("cloud config does not read OLLAMA_BASE_URL (local var)", async () => {
      setEnv({
        OLLAMA_BASE_URL: "http://localhost:11434/v1",
        OLLAMA_ENABLED: "true",
        OLLAMA_CLOUD_ENABLED: "false",
      });
      const { getOllamaCloudConfig } = await import("@/lib/ai/ollama-cloud");
      const cfg = getOllamaCloudConfig();
      // Cloud should use its own base URL, NOT the local one.
      expect(cfg.baseUrl).toBe("https://ollama.com/api");
      expect(cfg.baseUrl).not.toBe("http://localhost:11434/v1");
      expect(cfg.enabled).toBe(false); // Cloud is separate
    });
  });
});
