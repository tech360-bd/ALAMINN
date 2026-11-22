/**
 * AI Gateway API
 * ==============
 * Authenticated API gateway for AI model service with knowledge retrieval.
 * Versioned endpoints with RBAC authentication and rate limiting.
 * Runs in-process without requiring an external `express` runtime package.
 */

import { z } from "zod";
import type {
  InferenceResponse,
  ModelProvider,
  InferenceRequest,
} from "./inference-engine";
import { ModelRegistry } from "./model-registry";
import { KnowledgeRetrievalService } from "./knowledge-retrieval";
import type { Auth } from "../auth";
import { AuthMiddleware } from "../middleware/auth-middleware";
import { LocalInferenceEngine } from "./inference-engine";
import { RateLimiter } from "../middleware/rate-limiter";
import { AuditLogger } from "../middleware/audit-logger";

/* eslint-disable @typescript-eslint/no-explicit-any -- Lightweight in-process HTTP router compatible with Express middleware */
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
  params?: Record<string, string>;
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
  constructor(
    code: string,
    message: string,
    public details?: unknown,
    status: number = 500,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface RouteEntry {
  method: "GET" | "POST";
  pattern: string;
  handlers: Array<(req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => unknown>;
}

function matchRoutePattern(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pat = patternParts[i]!;
    const seg = pathParts[i]!;
    if (pat.startsWith(":")) {
      params[pat.slice(1)] = decodeURIComponent(seg);
    } else if (pat !== seg) {
      return null;
    }
  }
  return params;
}

function createInProcessGatewayApp(): ExpressApp {
  const middlewares: Array<
    (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => unknown
  > = [];
  const errorHandlers: Array<
    (
      err: unknown,
      req: ExpressRequest,
      res: ExpressResponse,
      next: ExpressNextFunction,
    ) => unknown
  > = [];
  const routes: RouteEntry[] = [];

  const app: ExpressApp = {
    middlewares,
    routes,
    use(fn: ExpressNextFunction) {
      if (typeof fn === "function") {
        if (fn.length === 4) {
          errorHandlers.push(fn);
        } else {
          middlewares.push(fn);
        }
      }
      return app;
    },
    get(
      pattern: string,
      ...handlers: Array<
        (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => unknown
      >
    ) {
      routes.push({ method: "GET", pattern, handlers });
      return app;
    },
    post(
      pattern: string,
      ...handlers: Array<
        (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => unknown
      >
    ) {
      routes.push({ method: "POST", pattern, handlers });
      return app;
    },
    async dispatch(req: ExpressRequest, res: ExpressResponse): Promise<void> {
      const method = String(req.method || "GET").toUpperCase() as "GET" | "POST";
      const rawUrl = String(req.path || req.url || "/");
      const pathname = rawUrl.split("?")[0] || "/";
      req.path = pathname;
      req.url = req.url || rawUrl;
      req.headers = req.headers || {};

      let matchedRoute: RouteEntry | null = null;
      let matchedParams: Record<string, string> = {};
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchRoutePattern(route.pattern, pathname);
        if (params !== null) {
          matchedRoute = route;
          matchedParams = params;
          break;
        }
      }
      req.params = { ...(req.params || {}), ...matchedParams };

      const stack = matchedRoute
        ? [...middlewares, ...matchedRoute.handlers]
        : [...middlewares];

      let index = 0;
      let finished = false;

      const origJson = res.json?.bind(res);
      const origSend = res.send?.bind(res);
      res.send = (body: unknown) => {
        if (finished || res.headersSent) return res;
        finished = true;
        return origSend ? origSend(body) : body;
      };
      res.json = (body: unknown) => {
        if (finished || res.headersSent) return res;
        finished = true;
        return origJson ? origJson(body) : body;
      };

      const next: ExpressNextFunction = async (err?: unknown) => {
        if (err) {
          if (finished || res.headersSent) return;
          for (const errHandler of errorHandlers) {
            await errHandler(err, req, res, () => undefined);
          }
          return;
        }
        if (finished || res.headersSent) return;
        const handler = stack[index++];
        if (!handler) {
          if (!matchedRoute && !finished && !res.headersSent) {
            res.status(404).json({
              success: false,
              error: {
                code: "NOT_FOUND",
                message: `Route ${method} ${pathname} not found`,
              },
              requestId: req.headers["x-request-id"] || "unknown",
            });
          }
          return;
        }
        try {
          await handler(req, res, next);
        } catch (caught) {
          await next(caught);
        }
      };

      await next();
    },
  };

  return app;
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
    auditLogger: AuditLogger,
  ) {
    this.inferenceEngine = inferenceEngine;
    this.modelRegistry = modelRegistry;
    this.knowledgeService = new KnowledgeRetrievalService(
      inferenceEngine as LocalInferenceEngine,
    );
    this.auth = auth;
    this.auditLogger = auditLogger;

    // Prefer an explicit test shim if injected, otherwise use the built-in
    // framework-agnostic in-process gateway app (never calls require("express")).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressShim = (globalThis as any).__expressShim;
    if (typeof expressShim === "function") {
      this.app = expressShim();
      if (typeof expressShim.json === "function") {
        this.app.use(expressShim.json({ limit: "10mb" }));
      }
      if (typeof expressShim.urlencoded === "function") {
        this.app.use(expressShim.urlencoded({ extended: true, limit: "10mb" }));
      }
    } else {
      this.app = createInProcessGatewayApp();
    }

    // Middleware
    this.app.use(RateLimiter.middleware());
    this.app.use(AuditLogger.audit());

    // Routes
    this.setupRoutes();

    // Error handling
    this.app.use(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handler signature
      (err: any, req: ExpressRequest, res: ExpressResponse, _next: ExpressNextFunction) => {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError("INTERNAL_ERROR", "Internal server error", {
                originalError: err,
              });
        AuditLogger.logError(req, err);
        res.status(apiError.status || 500).json({
          success: false,
          data: undefined,
          error: {
            code: apiError.code,
            message: apiError.message,
            details: apiError.details,
            requestId: req.headers["x-request-id"] || "unknown",
          },
        });
      },
    );
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", async (_req: ExpressRequest, res: ExpressResponse) => {
      const { models } = await this.inferenceEngine.healthCheck();
      res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
        models: models.map((m) => ({
          id: m.model,
          provider: m.provider,
          loaded: m.loaded,
          available: m.available,
        })),
      });
    });

    // Health check with detailed status
    this.app.get("/health/detailed", async (_req: ExpressRequest, res: ExpressResponse) => {
      const { healthy } = await this.inferenceEngine.healthCheck();
      res.json({
        success: true,
        healthy,
        timestamp: new Date().toISOString(),
        services: {
          inference:
            this.inferenceEngine.getModelStatus("local")?.available || false,
          database:
            this.modelRegistry.getModelStatus("higher-study-university")
              ?.available || false,
        },
      });
    });

    // Model status endpoint
    this.app.get("/models", (_req: ExpressRequest, res: ExpressResponse) => {
      const models = Array.from(this.modelRegistry.getAllModels());
      res.json({
        success: true,
        count: models.length,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          capabilities: m.capabilities,
          status: m.status,
        })),
      });
    });

    // Model status for specific model
    this.app.get("/models/:modelId", (req: ExpressRequest, res: ExpressResponse) => {
      const model = this.modelRegistry.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: "Model not found",
            details: { modelId: req.params.modelId },
          },
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
        },
      });
    });

    // Inference endpoints (GET + POST)
    this.app.get(
      "/api/v1/inference",
      AuthMiddleware.authenticate(),
      AuthMiddleware.requiresPermission("ai_tasks.create"),
      (req: ExpressRequest, res: ExpressResponse) => this.handleInference(req, res),
    );
    this.app.post(
      "/api/v1/inference",
      AuthMiddleware.authenticate(),
      AuthMiddleware.requiresPermission("ai_tasks.create"),
      (req: ExpressRequest, res: ExpressResponse) => this.handleInference(req, res),
    );

    // Knowledge retrieval endpoint
    this.app.post(
      "/api/v1/knowledge",
      AuthMiddleware.authenticate(),
      AuthMiddleware.requiresPermission("knowledge.retrieve"),
      (req: ExpressRequest, res: ExpressResponse) =>
        this.handleKnowledgeRequest(req, res),
    );

    // Model status endpoint
    this.app.get("/api/v1/models/:modelId", (req: ExpressRequest, res: ExpressResponse) => {
      const model = this.modelRegistry.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: "Model not found",
            details: { modelId: req.params.modelId },
          },
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
        },
      });
    });

    // Model status endpoint
    this.app.get("/api/v1/model-status", async (_req: ExpressRequest, res: ExpressResponse) => {
      const { healthy } = await this.inferenceEngine.healthCheck();
      res.json({
        success: true,
        healthy,
        timestamp: new Date().toISOString(),
        services: {
          inference:
            this.inferenceEngine.getModelStatus("local")?.available || false,
        },
      });
    });
  }

  private async handleInference(
    req: ApiRequest,
    res: ExpressResponse,
  ): Promise<void> {
    const body = (req.body || {}) as { systemPrompt?: string };

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
      const parsed = schema.parse({
        ...((req.body || {}) as Record<string, unknown>),
        ...((req.query || {}) as Record<string, unknown>),
      });
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

      const modelInfo = this.modelRegistry.getModel(request.model);
      if (!modelInfo) {
        res.status(404).json({
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: `Model ${request.model} not found`,
            details: { modelId: request.model },
          },
        });
        return;
      }

      const status = this.modelRegistry.getModelStatus(request.model);
      if (!status?.available) {
        res.status(400).json({
          success: false,
          error: {
            code: "MODEL_UNAVAILABLE",
            message: `Model ${request.model} is not available`,
            details: { status: modelInfo.status },
          },
        });
        return;
      }

      const userId = req.userId;
      const role = req.role;
      const permissions = req.permissions;

      AuditLogger.logRequest(
        req as unknown as Parameters<typeof AuditLogger.logRequest>[0],
        {
          userId,
          role,
          model: request.model,
          action: "inference",
          permissions,
        },
      );

      try {
        const result = await this.inferenceEngine.infer(request);
        const response: InferenceResponse = {
          content: result.content,
          model: request.model,
          provider: request.provider as ModelProvider,
          usage: result.usage,
          finishReason: result.finishReason,
          metadata: {
            requestId: req.headers["x-request-id"] as string,
            userId,
            role,
          },
        };
        void response;

        AuditLogger.logResponse(
          req as unknown as Parameters<typeof AuditLogger.logResponse>[0],
          {
            userId,
            role,
            model: request.model,
            action: "inference",
            success: true,
            responseLength: result.content.length,
          },
        );

        res.status(200).json({
          success: true,
          data: result,
          requestId: result.metadata?.requestId || "unknown",
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: "API_ERROR",
            message: "Inference failed",
            details: {
              originalError: error instanceof Error ? error.message : "Unknown",
            },
            requestId: req.headers["x-request-id"] || "unknown",
          },
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.status || 500).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId: req.headers["x-request-id"] || "unknown",
          },
        });
      } else if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.issues.map((e) => e.message),
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: "API_ERROR",
            message: "Internal server error",
            details: {
              originalError: error instanceof Error ? error.message : "Unknown",
            },
            requestId: req.headers["x-request-id"] || "unknown",
          },
        });
      }
    }
  }

  private async handleKnowledgeRequest(
    req: ApiRequest,
    res: ExpressResponse,
  ): Promise<void> {
    const schema = z.object({
      query: z.string().min(1),
      category: z.string().optional(),
      limit: z.number().optional().default(5),
      context: z.any().optional(),
      metadata: z.object({}).optional(),
    });

    try {
      const parsed = schema.parse({
        ...((req.body || {}) as Record<string, unknown>),
        ...((req.query || {}) as Record<string, unknown>),
      });
      const request: KnowledgeRequest = {
        query: parsed.query,
        category: parsed.category,
        limit: parsed.limit,
        context: parsed.context,
        metadata: parsed.metadata,
      };

      AuditLogger.logRequest(
        req as unknown as Parameters<typeof AuditLogger.logRequest>[0],
        {
          userId: req.userId,
          role: req.role,
          action: "knowledge_retrieval",
          query: request.query,
        },
      );

      const authContext = req.userId
        ? { userId: req.userId, role: req.role || "VIEWER" }
        : undefined;

      try {
        const knowledge = await this.knowledgeService.searchForUser(
          authContext,
          request.query,
          request.limit,
        );

        const response: KnowledgeResponse = {
          results: knowledge.results.map((r) => ({
            text: r.text,
            metadata: r.metadata,
            sourceUrl: r.sourceUrl,
          })),
          totalFound: knowledge.totalFound,
          searchQuery: request.query,
          retrievedAt: knowledge.retrievedAt,
        };

        AuditLogger.logResponse(
          req as unknown as Parameters<typeof AuditLogger.logResponse>[0],
          {
            userId: req.userId,
            role: req.role,
            action: "knowledge_retrieval",
            query: request.query,
            success: true,
          },
        );

        res.status(200).json({
          success: true,
          data: response,
          requestId: req.headers["x-request-id"] || "unknown",
        });
      } catch (error) {
        console.error("[API Gateway] Knowledge retrieval error:", error);
        const response: KnowledgeResponse = {
          results: [],
          totalFound: 0,
          searchQuery: request.query,
          retrievedAt: new Date(),
        };

        AuditLogger.logResponse(
          req as unknown as Parameters<typeof AuditLogger.logResponse>[0],
          {
            userId: req.userId,
            role: req.role,
            action: "knowledge_retrieval",
            query: request.query,
            success: true,
          },
        );

        res.status(200).json({
          success: true,
          data: response,
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.status || 500).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId: req.headers["x-request-id"] || "unknown",
          },
        });
      } else if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.issues.map((e) => e.message),
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: "API_ERROR",
            message: "Internal server error",
            details: {
              originalError: error instanceof Error ? error.message : "Unknown",
            },
            requestId: req.headers["x-request-id"] || "unknown",
          },
        });
      }
    }
  }

  /**
   * Handle a standard Web / Next.js `Request` and return a `Response`.
   */
  public async handleFetchRequest(request: Request): Promise<Response> {
    const url = new URL(request.url, "http://localhost");
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: unknown = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        body = await request.json();
      } catch {
        body = undefined;
      }
    }

    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    if (request.signal?.aborted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "REQUEST_ABORTED",
            message: "Client aborted the request",
          },
          requestId: headers["x-request-id"] || "unknown",
        }),
        {
          status: 499,
          headers: new Headers({ "content-type": "application/json" }),
        },
      );
    }

    let statusCode = 200;
    let payload: unknown = null;
    let finishEmitted = false;
    const responseHeaders = new Headers({
      "content-type": "application/json",
    });

    const reqLike: ExpressRequest = {
      method: request.method,
      path: url.pathname,
      url: url.pathname + url.search,
      headers,
      body,
      query,
      params: {},
      aborted: Boolean(request.signal?.aborted),
      ip:
        headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        headers["x-real-ip"] ||
        "127.0.0.1",
    };

    const finishListeners: Array<() => void> = [];
    const emitFinish = () => {
      if (finishEmitted) return;
      finishEmitted = true;
      for (const fn of finishListeners.splice(0, finishListeners.length)) {
        try {
          fn();
        } catch {
          // Ensure logging/metrics listeners never interfere with response delivery
        }
      }
    };

    const resLike: ExpressResponse = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      status(code: number) {
        if (this.headersSent) return this;
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string | number) {
        if (this.headersSent) return this;
        responseHeaders.set(name, String(value));
        return this;
      },
      on(event: string, listener: () => void) {
        if (event === "finish" && typeof listener === "function") {
          finishListeners.push(listener);
        }
        return this;
      },
      once(event: string, listener: () => void) {
        return this.on(event, listener);
      },
      off(event: string, listener: () => void) {
        if (event === "finish") {
          const idx = finishListeners.indexOf(listener);
          if (idx >= 0) finishListeners.splice(idx, 1);
        }
        return this;
      },
      send(data: unknown) {
        if (this.writableEnded) return this;
        payload = data;
        this.headersSent = true;
        this.writableEnded = true;
        emitFinish();
        return this;
      },
      json(data: unknown) {
        if (this.writableEnded) return this;
        payload = data;
        this.headersSent = true;
        this.writableEnded = true;
        emitFinish();
        return this;
      },
    };

    if (typeof this.app.dispatch === "function") {
      await this.app.dispatch(reqLike, resLike);
    }
    emitFinish();

    return new Response(
      typeof payload === "string" ? payload : JSON.stringify(payload),
      {
        status: statusCode,
        headers: responseHeaders,
      },
    );
  }

  public getKnowledgeService(): KnowledgeRetrievalService {
    return this.knowledgeService;
  }

  public getApp(): ExpressApp {
    return this.app;
  }
}
