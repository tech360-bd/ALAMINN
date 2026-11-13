/**
 * AI Gateway API
 * ==============
 * Authenticated API gateway for AI model service with knowledge retrieval.
 * Versioned endpoints with RBAC authentication and rate limiting.
 */

import { z } from "zod";
import type { InferenceResponse, ModelProvider, InferenceRequest } from "./inference-engine";
import { ModelRegistry } from "./model-registry";
import { KnowledgeRetrievalService } from "./knowledge-retrieval";
import type { Auth } from "../auth";
import { AuthMiddleware } from "../middleware/auth-middleware";
import { LocalInferenceEngine } from "./inference-engine";
import { RateLimiter } from "../middleware/rate-limiter";
import { AuditLogger } from "../middleware/audit-logger";

// Express shim (module not installed in this build environment)
/* eslint-disable @typescript-eslint/no-explicit-any -- Express types shimmed for optional dynamic import */
type ExpressApp = any;
type ExpressRequest = any;
type ExpressResponse = any;
type ExpressNextFunction = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ApiRequest {
  userId: string;
  role: string;
  permissions: string[];
  body: unknown;
  query?: unknown;
  headers: Record<string, string | undefined>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export interface KnowledgeRequest {
  query: string;
  category?: string;
  limit?: number;
  context?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface KnowledgeResponse {
  results: KnowledgeResult[];
  totalFound: number;
  searchQuery: string;
  retrievedAt: Date;
}

export interface KnowledgeResult {
  text: string;
  metadata: Record<string, unknown>;
  sourceUrl?: string;
}

export class ApiError extends Error {
  public code: string;
  public status: number;
  constructor(code: string, message: string, public details?: unknown, status: number = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export class ApiGateway {
  private app: ExpressApp;
  private inferenceEngine: LocalInferenceEngine;
  private modelRegistry: ModelRegistry;
  private knowledgeService: KnowledgeRetrievalService;
  private auth: Auth;
  private auditLogger: AuditLogger;

  constructor(
    inferenceEngine: LocalInferenceEngine,
    modelRegistry: ModelRegistry,
    auth: Auth,
    auditLogger: AuditLogger
  ) {
    this.inferenceEngine = inferenceEngine;
    this.modelRegistry = modelRegistry;
    this.knowledgeService = new KnowledgeRetrievalService(inferenceEngine as LocalInferenceEngine);
    this.auth = auth;
    this.auditLogger = auditLogger;

    // Create express app - express module shim via require
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressModule = (globalThis as any).__expressShim || require("express");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const express: any = expressModule;
    this.app = express();
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Middleware
    this.app.use(RateLimiter.middleware());
    this.app.use(AuthMiddleware.authenticate());
    this.app.use(AuditLogger.audit());

    // Routes
    this.setupRoutes();

    // Error handling
    this.app.use((err: any, req: ExpressRequest, res: ExpressResponse, _next: ExpressNextFunction) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- Express ErrorRequestHandler shim
      const apiError = err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR", "Internal server error", { originalError: err });
      AuditLogger.logError(req, err);
      res.status(apiError.status || 500).json({
        success: false,
        data: undefined,
        error: {
          code: apiError.code,
          message: apiError.message,
          details: apiError.details,
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", async (req, res) => {
      const { models } = await this.inferenceEngine.healthCheck();
      res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
        models: models.map(m => ({
          id: m.model,
          provider: m.provider,
          loaded: m.loaded,
          available: m.available,
        })),
      });
    });

    // Health check with detailed status
    this.app.get("/health/detailed", async (req, res) => {
      const { healthy } = await this.inferenceEngine.healthCheck();
      res.json({
        success: true,
        healthy,
        timestamp: new Date().toISOString(),
        services: {
          inference: this.inferenceEngine.getModelStatus("local")?.available || false,
          database: this.modelRegistry.getModelStatus("higher-study-university")?.available || false,
        },
      });
    });

    // Model status endpoint
    this.app.get("/models", (req, res) => {
      const models = Array.from(this.modelRegistry.getAllModels());
      res.json({
        success: true,
        count: models.length,
        models: models.map(m => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          capabilities: m.capabilities,
          status: m.status,
        })),
      });
    });

    // Model status for specific model
    this.app.get("/models/:modelId", (req, res) => {
      const model = this.modelRegistry.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: "Model not found",
            details: { modelId: req.params.modelId }
          }
        });
      }
      res.json({
        success: true,
        model: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          capabilities: model.capabilities,
          status: model.status,
          parameters: model.parameters
            ? {
                maxTokens: model.parameters.maxTokens,
                contextWindow: model.parameters.contextWindow,
                temperature: model.parameters.temperature,
              }
            : undefined,
        }
      });
    });

    // Inference endpoint
    this.app.get("/api/v1/inference", AuthMiddleware.requiresPermission("ai_tasks.create"), (req, res) => {
      this.handleInference(req, res);
    });

    // Knowledge retrieval endpoint
    this.app.post("/api/v1/knowledge", AuthMiddleware.requiresPermission("knowledge.retrieve"), (req, res) => {
      this.handleKnowledgeRequest(req, res);
    });

    // Model status endpoint
    this.app.get("/api/v1/models/:modelId", (req, res) => {
      const model = this.modelRegistry.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: "Model not found",
            details: { modelId: req.params.modelId }
          }
        });
      }
      res.json({
        success: true,
        model: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          capabilities: model.capabilities,
          status: model.status,
          parameters: model.parameters
            ? {
                maxTokens: model.parameters.maxTokens,
                contextWindow: model.parameters.contextWindow,
                temperature: model.parameters.temperature,
              }
            : undefined,
        }
      });
    });

    // Model status endpoint
    this.app.get("/api/v1/model-status", async (req, res) => {
      const { healthy } = await this.inferenceEngine.healthCheck();
      res.json({
        success: true,
        healthy,
        timestamp: new Date().toISOString(),
        services: {
          inference: this.inferenceEngine.getModelStatus("local")?.available || false,
        },
      });
    });
  }

  private handleInference(req: ApiRequest, res: ExpressResponse): void {
    const body = (req.body || {}) as { systemPrompt?: string };

    // Validate request
    const schema = z.object({
      model: z.string().min(1),
      provider: z.enum(["local", "zai", "openai"]),
      prompt: z.string().min(1),
      context: z.any().optional(),
      maxTokens: z.number().optional(),
      temperature: z.number().optional(),
      timeoutMs: z.number().optional(),
      stream: z.boolean().optional(),
      metadata: z.object({}).optional(),
    });

    try {
      const parsed = schema.parse({ ...((req.body || {}) as Record<string, unknown>), ...((req.query || {}) as Record<string, unknown>) });
      const request: InferenceRequest = {
        model: parsed.model,
        provider: parsed.provider as ModelProvider,
        prompt: parsed.prompt,
        systemPrompt: body.systemPrompt,
        context: parsed.context,
        maxTokens: parsed.maxTokens,
        temperature: parsed.temperature,
        timeoutMs: parsed.timeoutMs,
        stream: parsed.stream,
        metadata: parsed.metadata,
      };

      // Validate model exists and is available
      const modelInfo = this.modelRegistry.getModel(request.model);
      if (!modelInfo) {
        return res.status(404).json({
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: `Model ${request.model} not found`,
            details: { modelId: request.model }
          }
        });
      }

      const status = this.modelRegistry.getModelStatus(request.model);
      if (!status?.available) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MODEL_UNAVAILABLE",
            message: `Model ${request.model} is not available`,
            details: { status: modelInfo.status }
          }
        });
      }

      // Authenticate and authorize
      const userId = req.userId;
      const role = req.role;
      const permissions = req.permissions;

      // Log request for audit
      AuditLogger.logRequest(req as unknown as Parameters<typeof AuditLogger.logRequest>[0], {
        userId,
        role,
        model: request.model,
        action: "inference",
        permissions: permissions,
      });

      // Perform inference
      this.inferenceEngine.infer(request).then(result => {
        const response: InferenceResponse = {
          content: result.content,
          model: request.model,
          provider: request.provider as ModelProvider,
          usage: result.usage,
          finishReason: result.finishReason,
          metadata: {
            requestId: req.headers['x-request-id'] as string,
            userId: userId,
            role: role,
          }
        };
        void response;

        AuditLogger.logResponse(req as unknown as Parameters<typeof AuditLogger.logResponse>[0], {
          userId,
          role,
          model: request.model,
          action: "inference",
          success: true,
          responseLength: result.content.length,
        });

        res.json({
          success: true,
          data: result,
          requestId: result.metadata?.requestId || "unknown",
        });
      }).catch(error => {
        res.status(500).json({
          success: false,
          error: {
            code: "API_ERROR",
            message: "Inference failed",
            details: { originalError: error instanceof Error ? error.message : "Unknown" },
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.status || 500).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      } else if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.issues.map(e => e.message),
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: "API_ERROR",
            message: "Internal server error",
            details: { originalError: error instanceof Error ? error.message : "Unknown" },
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      }
    }
  }

  private handleKnowledgeRequest(req: ApiRequest, res: ExpressResponse): void {

    // Validate request
    const schema = z.object({
      query: z.string().min(1),
      category: z.string().optional(),
      limit: z.number().optional().default(5),
      context: z.any().optional(),
      metadata: z.object({}).optional(),
    });

    try {
      const parsed = schema.parse({ ...((req.body || {}) as Record<string, unknown>), ...((req.query || {}) as Record<string, unknown>) });
      const request: KnowledgeRequest = {
        query: parsed.query,
        category: parsed.category,
        limit: parsed.limit,
        context: parsed.context,
        metadata: parsed.metadata,
      };

      // Authenticate and authorize (already done by middleware)
      AuditLogger.logRequest(req as unknown as Parameters<typeof AuditLogger.logRequest>[0], {
        userId: req.userId,
        role: req.role,
        action: "knowledge_retrieval",
        query: request.query,
      });

      // Retrieve knowledge — pass the authenticated user context so
      // ingestion stamps ownership and retrieval enforces access control.
      // searchForUser filters results to documents the caller is
      // authorized to see (own documents, or all if ADMIN role).
      const authContext = req.userId
        ? { userId: req.userId, role: req.role || "VIEWER" }
        : undefined;
      const knowledgePromise = this.knowledgeService.ingestText(
        "Test Document",
        "test",
        "",
        (parsed as { query: string }).query,
        "en",
        authContext
      ).then(() => this.knowledgeService.searchForUser(authContext, request.query, request.limit));

      knowledgePromise.then(knowledge => {
        // Format response
        const response: KnowledgeResponse = {
          results: knowledge.results.map(r => ({
            text: r.text,
            metadata: r.metadata,
            sourceUrl: r.sourceUrl,
          })),
          totalFound: knowledge.totalFound,
          searchQuery: request.query,
          retrievedAt: knowledge.retrievedAt,
        };

        AuditLogger.logResponse(req as unknown as Parameters<typeof AuditLogger.logResponse>[0], {
          userId: req.userId,
          role: req.role,
          action: "knowledge_retrieval",
          query: request.query,
          success: true,
        });

        res.json({
          success: true,
          data: response,
          requestId: req.headers['x-request-id'] || 'unknown',
        });
      }).catch(error => {
        console.error("[API Gateway] Knowledge retrieval error:", error);
        // Fallback to empty results on error
        const response: KnowledgeResponse = {
          results: [],
          totalFound: 0,
          searchQuery: request.query,
          retrievedAt: new Date(),
        };

        AuditLogger.logResponse(req as unknown as Parameters<typeof AuditLogger.logResponse>[0], {
          userId: req.userId,
          role: req.role,
          action: "knowledge_retrieval",
          query: request.query,
          success: true,
        });

        res.json({
          success: true,
          data: response,
          requestId: req.headers['x-request-id'] || 'unknown',
        });
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.status || 500).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      } else if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.issues.map(e => e.message),
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: "API_ERROR",
            message: "Internal server error",
            details: { originalError: error instanceof Error ? error.message : "Unknown" },
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      }
    }
  }

  public getApp(): ExpressApp {
    return this.app;
  }
}