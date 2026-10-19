/**
 * AI Model Service — Express Server Entry Point
 * ==============================================
 * Runs the authenticated API gateway for the private AI model service.
 *
 * Runs on an isolated port (default 8765) separate from the main Next.js app.
 * Keep model-server ports private to the server or internal network.
 */

import express from "express";
import { ApiGateway } from "./lib/ai/api-gateway";
import { LocalInferenceEngine } from "./lib/ai/inference-engine";
import { ModelRegistry, defaultModelRegistryConfig } from "./lib/ai/model-registry";
import { AuditLogger } from "./lib/middleware/audit-logger";
import { KnowledgeRetrievalService } from "./lib/ai/knowledge-retrieval";

const PORT = parseInt(process.env.AI_SERVICE_PORT || "8765", 10);
const HOST = process.env.AI_SERVICE_HOST || "127.0.0.1";

async function main(): Promise<void> {
  console.log(`[AI Service] Starting AI Model Service on ${HOST}:${PORT}`);

  // 1. Initialize inference engine with default models
  const inferenceEngine = new LocalInferenceEngine();
  await inferenceEngine.initialize([
    ...defaultModelRegistryConfig.localModels,
    ...defaultModelRegistryConfig.externalModels,
  ]);

  console.log(`[AI Service] Inference engine initialized with ${inferenceEngine.getAvailableModels().length} available model(s)`);

  // 2. Initialize model registry
  const modelRegistry = new ModelRegistry(defaultModelRegistryConfig);

  // 2b. Initialize knowledge retrieval service and wire it to the model registry
  const knowledgeService = new KnowledgeRetrievalService(inferenceEngine);
  modelRegistry.setKnowledgeService(knowledgeService);

  // 3. Create API gateway
  // The `auth` parameter is stored but unused by ApiGateway (permissions are enforced via AuthMiddleware)
  const auth = { authSecret: process.env.AUTH_SECRET || "dev-secret" };

  const gateway = new ApiGateway(inferenceEngine, modelRegistry, auth, AuditLogger);
  const app = gateway.getApp();

  // Add request ID middleware (simple)
  app.use((req, res, next) => {
    if (!req.headers["x-request-id"]) {
      req.headers["x-request-id"] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    res.setHeader("X-Request-ID", req.headers["x-request-id"] as string);
    next();
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${req.method} ${req.url} not found`,
      },
      requestId: req.headers["x-request-id"] || "unknown",
    });
  });

  // Start server
  const server = app.listen(PORT, HOST, () => {
    console.log(`[AI Service] API Gateway listening on http://${HOST}:${PORT}`);
    console.log(`[AI Service] Health:        http://${HOST}:${PORT}/health`);
    console.log(`[AI Service] Detailed:      http://${HOST}:${PORT}/health/detailed`);
    console.log(`[AI Service] Models:        http://${HOST}:${PORT}/models`);
    console.log(`[AI Service] Inference:     http://${HOST}:${PORT}/api/v1/inference`);
    console.log(`[AI Service] Knowledge:     http://${HOST}:${PORT}/api/v1/knowledge`);
    console.log(`[AI Service] Model Status:  http://${HOST}:${PORT}/api/v1/model-status`);
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const sig of signals) {
    process.on(sig, async () => {
      console.log(`[AI Service] Received ${sig}, shutting down gracefully...`);
      server.close(async () => {
        try {
          await inferenceEngine.shutdown();
          console.log("[AI Service] Inference engine shut down");
        } catch (err) {
          console.error("[AI Service] Shutdown error:", err);
        }
        process.exit(0);
      });
    });
  }
}

main().catch((err) => {
  console.error("[AI Service] Failed to start:", err);
  process.exit(1);
});
