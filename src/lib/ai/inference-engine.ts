/**
 * Local AI Inference Engine
 * ===========================
 * Provider-independent model service for CPU-only inference.
 *
 * Features:
 *   - Multiple model providers (local, OpenAI, etc.)
 *   - Model selection, context limits, timeout handling
 *   - Request queuing and concurrency control
 *   - Graceful error handling and fallback support
 *
 * This is the foundation for Phase 2 implementation.
 */

import { z } from "zod";
import { runFreeAiRouter, generateFreeEmbeddings } from "./free-router";
import type { FreeProviderId } from "./free-providers";

export const ModelProvider = {
  UNOROUTER: "unorouter",
  LOCAL: "local",
  OPENAI: "openai",
  ZAI: "zai",
  GROQ: "groq",
  GEMINI: "gemini",
  CEREBRAS: "cerebras",
  OPENROUTER: "openrouter",
  GITHUB: "github",
  CLOUDFLARE: "cloudflare",
  POLLINATIONS: "pollinations",
  OLLAMA: "ollama",
} as const;

export type ModelProvider = (typeof ModelProvider)[keyof typeof ModelProvider];

export const ModelCapability = {
  CHAT: "chat",
  COMPLETION: "completion",
  EMBEDDING: "embedding",
} as const;

export type ModelCapability = (typeof ModelCapability)[keyof typeof ModelCapability];

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  capabilities: ModelCapability[];
  maxTokens?: number;
  timeoutMs?: number;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  contextLimit?: number;
}

export interface InferenceRequest {
  model: string;
  provider: ModelProvider;
  prompt: string;
  systemPrompt?: string;
  context?: any[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface InferenceResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: "stop" | "length" | "error" | "content_filter";
  metadata?: Record<string, any>;
}

export interface ModelStatus {
  model: string;
  provider: ModelProvider;
  loaded: boolean;
  available: boolean;
  memoryUsage?: number;
  lastUsed?: number;
  error?: string;
}

export class InferenceError extends Error {
  constructor(
    message: string,
    public code: "MODEL_NOT_LOADED" | "TIMEOUT" | "RATE_LIMIT" | "INVALID_REQUEST" | "INSUFFICIENT_MEMORY" | "UNSUPPORTED_OPERATION",
    public status?: number
  ) {
    super(message);
    this.name = "InferenceError";
  }
}

export interface EmbeddingRequest {
  model: string;
  provider: ModelProvider;
  text: string | string[];
  maxTokens?: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  provider: ModelProvider;
  usage?: {
    totalTokens: number;
  };
}

export class LocalInferenceEngine {
  private models: Map<string, ModelConfig> = new Map();
  private status: Map<string, ModelStatus> = new Map();
  private requestQueue: Array<{ resolve: (value: InferenceResponse) => void; reject: (error: Error) => void; request: InferenceRequest }> = [];
  private maxConcurrent = 5;
  private activeRequests = 0;

  async initialize(configs: ModelConfig[]): Promise<void> {
    console.log(`[InferenceEngine] Initializing with ${configs.length} models`);

    for (const config of configs) {
      this.models.set(config.model, config);
      this.status.set(config.model, {
        model: config.model,
        provider: config.provider,
        loaded: false,
        available: true,
      });

      // Try to load the model
      try {
        await this.loadModel(config);
        this.updateStatus(config.model, { loaded: true, available: true });
      } catch (error) {
        this.updateStatus(config.model, {
          loaded: false,
          available: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.warn(`[InferenceEngine] Failed to load model ${config.model}:`, error);
      }
    }
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    if (this.activeRequests >= this.maxConcurrent) {
      return this.enqueueRequest(request);
    }

    this.activeRequests++;

    try {
      const modelConfig = this.models.get(request.model);
      if (!modelConfig) {
        throw new InferenceError(`Model ${request.model} not configured`, "INVALID_REQUEST");
      }

      const modelStatus = this.status.get(request.model);
      if (!modelStatus?.loaded || !modelStatus?.available) {
        throw new InferenceError(
          `Model ${request.model} is not loaded or available`,
          "MODEL_NOT_LOADED"
        );
      }

      // Add timeout handling
      const timeout = request.timeoutMs || modelConfig.timeoutMs || 30000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new InferenceError("Request timeout", "TIMEOUT", timeout)), timeout)
      );

      const inferencePromise = this.performInference(request, modelConfig);
      const result = await Promise.race([inferencePromise, timeoutPromise]);

      return result;
    } catch (error) {
      if (error instanceof InferenceError) throw error;
      throw new InferenceError(
        `Inference failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "TIMEOUT"
      );
    } finally {
      this.activeRequests--;
    }
  }

  private async performInference(request: InferenceRequest, config: ModelConfig): Promise<InferenceResponse> {
    const providerMap: Record<string, FreeProviderId | "auto"> = {
      local: "auto",
      openai: "github",
      zai: "zai",
      groq: "groq",
      gemini: "gemini",
      cerebras: "cerebras",
      openrouter: "openrouter",
      github: "github",
      cloudflare: "cloudflare",
      pollinations: "pollinations",
      ollama: "ollama",
    };

    const routed = await runFreeAiRouter({
      systemPrompt: request.systemPrompt || "You are Alaminn AI, an executive assistant.",
      messages: [{ role: "user", content: request.prompt }],
      preferredProvider: providerMap[config.provider] || "auto",
      preferredModel: config.provider === "local" ? undefined : request.model,
      temperature: request.temperature ?? config.temperature ?? 0.4,
      maxTokens: request.maxTokens ?? config.maxTokens ?? 1024,
    });

    const promptTokens = Math.max(1, Math.floor(request.prompt.length / 4));
    const completionTokens = Math.max(1, Math.floor(routed.content.length / 4));
    return {
      content: routed.content,
      model: routed.modelUsed || config.model,
      provider: config.provider,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      finishReason: "stop",
      metadata: {
        providerUsed: routed.providerUsed,
        cached: routed.cached,
        latencyMs: routed.latencyMs,
      },
    };
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const texts = Array.isArray(request.text) ? request.text : [request.text];
    const emb = await generateFreeEmbeddings(texts);
    return {
      embeddings: emb.embeddings,
      model: emb.modelUsed || request.model,
      provider: request.provider,
      usage: {
        totalTokens: texts.reduce((sum, text) => sum + Math.floor(text.length / 4), 0),
      },
    };
  }

  async loadModel(config: ModelConfig): Promise<void> {
    console.log(`[InferenceEngine] Ready model: ${config.model} (${config.provider})`);
  }

  private async loadLocalModel(config: ModelConfig): Promise<void> {
    // Local model loading (e.g., llama.cpp, Hugging Face transformers)
    console.log(`[InferenceEngine] Loading local model: ${config.model}`);
    // TODO: Implement actual local model loading
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate loading time
  }

  private async loadOpenAIModel(config: ModelConfig): Promise<void> {
    // OpenAI model loading
    if (!config.apiKey) {
      throw new InferenceError("OpenAI API key required to load model", "INVALID_REQUEST");
    }
    console.log(`[InferenceEngine] Loading OpenAI model: ${config.model}`);
    // TODO: Implement actual OpenAI model loading
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate loading time
  }

  private async loadZAIModel(config: ModelConfig): Promise<void> {
    // ZAI model loading
    if (!config.apiKey) {
      throw new InferenceError("ZAI API key required to load model", "INVALID_REQUEST");
    }
    console.log(`[InferenceEngine] Loading ZAI model: ${config.model}`);
    // TODO: Implement actual ZAI model loading
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate loading time
  }

  updateStatus(model: string, updates: Partial<ModelStatus>): void {
    const current = this.status.get(model);
    if (current) {
      this.status.set(model, { ...current, ...updates });
    }
  }

  getModelStatus(model: string): ModelStatus | undefined {
    return this.status.get(model);
  }

  getAvailableModels(): ModelConfig[] {
    return Array.from(this.models.values()).filter(config =>
      this.status.get(config.model)?.available && this.status.get(config.model)?.loaded
    );
  }

  private async enqueueRequest(request: InferenceRequest): Promise<InferenceResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, request });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrent || this.requestQueue.length === 0) {
      return;
    }

    const queuedRequest = this.requestQueue.shift();
    if (!queuedRequest) return;

    try {
      const result = await this.infer(queuedRequest.request);
      queuedRequest.resolve(result);
    } catch (error) {
      queuedRequest.reject(error instanceof Error ? error : new Error("Unknown error"));
    }

    // Process more queued requests
    setImmediate(() => this.processQueue());
  }

  async healthCheck(): Promise<{ healthy: boolean; models: ModelStatus[] }> {
    const modelStatuses = Array.from(this.status.values());
    const healthy = modelStatuses.every(status => status.loaded && status.available);

    return {
      healthy,
      models: modelStatuses,
    };
  }

  async shutdown(): Promise<void> {
    console.log("[InferenceEngine] Shutting down - cleaning up resources");
    this.requestQueue = [];
    this.models.clear();
    this.status.clear();
    this.activeRequests = 0;
  }
}

// Export singleton instance
export const inferenceEngine = new LocalInferenceEngine();

// Export helper functions
export async function loadInferenceModels(configs: ModelConfig[]): Promise<void> {
  return inferenceEngine.initialize(configs);
}

export async function chatCompletion(request: InferenceRequest): Promise<InferenceResponse> {
  return inferenceEngine.infer(request);
}

export async function createEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  return inferenceEngine.generateEmbedding(request);
}

export async function getModelStatus(model: string): Promise<ModelStatus | undefined> {
  return inferenceEngine.getModelStatus(model);
}

export async function getSystemStatus(): Promise<{ healthy: boolean; models: ModelStatus[] }> {
  return inferenceEngine.healthCheck();
}