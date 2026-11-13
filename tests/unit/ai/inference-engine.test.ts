/**
 * tests/unit/ai/inference-engine.test.ts
 *
 * Regression tests for the AI inference engine provider-readiness checks.
 *
 * Covers the three formerly-stubbed loader paths (local / OpenAI / ZAI)
 * that previously returned after a 1-second simulated delay. The stubs
 * were removed in favor of verifyProviderReadiness(), which checks:
 *   - provider registration in the free-router catalog
 *   - API key shape (when explicitly provided)
 *   - base URL validity (when provided, and mandatory for Ollama)
 *   - local-runtime availability (explicitly unsupported)
 *
 * A model that fails readiness must be marked loaded:false / available:false
 * with a structured error — never healthy just because a timer completed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalInferenceEngine,
  InferenceError,
  ModelProvider,
  type ModelConfig,
} from "@/lib/ai/inference-engine";

describe("LocalInferenceEngine — provider readiness", () => {
  let engine: LocalInferenceEngine;

  beforeEach(() => {
    engine = new LocalInferenceEngine();
  });

  describe("registered providers", () => {
    const validProviders: ModelProvider[] = [
      "unorouter",
      "groq",
      "gemini",
      "cerebras",
      "openrouter",
      "github",
      "cloudflare",
      "zai",
      "ollama",
      "openai",
    ];

    for (const provider of validProviders) {
      it(`accepts registered provider: ${provider}`, async () => {
        const config: ModelConfig = {
          provider,
          model: `test-${provider}`,
          capabilities: ["chat"],
        };
        // Ollama requires a base URL — supply one so it passes.
        if (provider === "ollama") {
          config.baseUrl = "http://localhost:11434";
        }
        await expect(engine.loadModel(config)).resolves.toBeUndefined();
        const status = engine.getModelStatus(`test-${provider}`);
        // loadModel itself doesn't set status — initialize() does.
        // But loadModel resolving without throwing is the readiness proof.
        expect(status).toBeUndefined();
      });
    }
  });

  describe("local provider", () => {
    it("rejects local provider with UNSUPPORTED_OPERATION (no local runtime)", async () => {
      const config: ModelConfig = {
        provider: "local",
        model: "local-test",
        capabilities: ["chat"],
      };
      await expect(engine.loadModel(config)).rejects.toThrow(InferenceError);
      await expect(engine.loadModel(config)).rejects.toMatchObject({
        code: "UNSUPPORTED_OPERATION",
      });
    });

    it("error message explains how to configure a real provider", async () => {
      const config: ModelConfig = {
        provider: "local",
        model: "local-test",
        capabilities: ["chat"],
      };
      try {
        await engine.loadModel(config);
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(InferenceError);
        const msg = (e as InferenceError).message;
        expect(msg).toContain("Local model runtime is not configured");
        expect(msg).toContain("cloud provider");
      }
    });
  });

  describe("invalid API key shape", () => {
    it("rejects an API key shorter than 8 characters", async () => {
      const config: ModelConfig = {
        provider: "groq",
        model: "groq-test",
        capabilities: ["chat"],
        apiKey: "short",
      };
      await expect(engine.loadModel(config)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
    });

    it("rejects an empty-string API key", async () => {
      const config: ModelConfig = {
        provider: "zai",
        model: "zai-test",
        capabilities: ["chat"],
        apiKey: "   ",
      };
      await expect(engine.loadModel(config)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
    });

    it("accepts a valid-length API key", async () => {
      const config: ModelConfig = {
        provider: "groq",
        model: "groq-test",
        capabilities: ["chat"],
        apiKey: "test-fake-api-key-1234567890abcdef",
      };
      await expect(engine.loadModel(config)).resolves.toBeUndefined();
    });
  });

  describe("Ollama base URL", () => {
    it("rejects Ollama without a base URL (no env, no config)", async () => {
      const originalEnv = process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_BASE_URL;
      const config: ModelConfig = {
        provider: "ollama",
        model: "ollama-test",
        capabilities: ["chat"],
      };
      await expect(engine.loadModel(config)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
      if (originalEnv) process.env.OLLAMA_BASE_URL = originalEnv;
    });

    it("rejects Ollama with an invalid URL", async () => {
      const config: ModelConfig = {
        provider: "ollama",
        model: "ollama-test",
        capabilities: ["chat"],
        baseUrl: "not-a-url",
      };
      await expect(engine.loadModel(config)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
    });

    it("accepts Ollama with a valid base URL", async () => {
      const config: ModelConfig = {
        provider: "ollama",
        model: "ollama-test",
        capabilities: ["chat"],
        baseUrl: "http://localhost:11434",
      };
      await expect(engine.loadModel(config)).resolves.toBeUndefined();
    });
  });

  describe("invalid base URL for any provider", () => {
    it("rejects a malformed base URL", async () => {
      const config: ModelConfig = {
        provider: "groq",
        model: "groq-test",
        capabilities: ["chat"],
        baseUrl: "ht!tp://[invalid",
      };
      await expect(engine.loadModel(config)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
    });
  });

  describe("initialize + healthCheck integration", () => {
    it("marks a failing provider as not loaded and not available", async () => {
      const configs: ModelConfig[] = [
        { provider: "local", model: "local-1", capabilities: ["chat"] },
        { provider: "groq", model: "groq-1", capabilities: ["chat"], baseUrl: "http://localhost:8080" },
      ];
      await engine.initialize(configs);

      const localStatus = engine.getModelStatus("local-1");
      expect(localStatus?.loaded).toBe(false);
      expect(localStatus?.available).toBe(false);
      expect(localStatus?.error).toContain("Local model runtime");

      const groqStatus = engine.getModelStatus("groq-1");
      expect(groqStatus?.loaded).toBe(true);
      expect(groqStatus?.available).toBe(true);
    });

    it("healthCheck reports unhealthy when any model failed readiness", async () => {
      await engine.initialize([
        { provider: "local", model: "bad", capabilities: ["chat"] },
      ]);
      const health = await engine.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.models[0].error).toBeTruthy();
    });

    it("healthCheck reports healthy when all models passed readiness", async () => {
      await engine.initialize([
        { provider: "groq", model: "ok", capabilities: ["chat"], baseUrl: "http://localhost:8080" },
      ]);
      const health = await engine.healthCheck();
      expect(health.healthy).toBe(true);
    });
  });

  describe("dead code removal verification", () => {
    it("inference-engine.ts no longer contains simulated setTimeout delays in loaders", async () => {
      const source = await import("fs").then(fs =>
        fs.readFileSync("src/lib/ai/inference-engine.ts", "utf8")
      );
      // The old stubs had: await new Promise(resolve => setTimeout(resolve, 1000))
      // These should be gone from the loadModel path.
      expect(source).not.toContain("setTimeout(resolve, 1000)");
      // The TODO markers should be gone.
      expect(source).not.toContain("TODO: Implement actual local model loading");
      expect(source).not.toContain("TODO: Implement actual OpenAI model loading");
      expect(source).not.toContain("TODO: Implement actual ZAI model loading");
    });
  });
});
