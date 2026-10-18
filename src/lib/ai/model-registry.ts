/**
 * Model Registry
 * ===============
 * Central registry for managing available AI models and their configurations.
 * Supports local CPU inference models and external provider models.
 */

import { ModelConfig, ModelProvider, ModelCapability } from "./inference-engine";
import { KnowledgeRetrievalService, KnowledgeRetrievalResult } from "./knowledge-retrieval";

export interface ModelRegistryConfig {
  // Local models (CPU inference)
  localModels: ModelConfig[];
  // External provider models
  externalModels: ModelConfig[];
  // Default model for each capability
  defaults: {
    chat?: string;
    completion?: string;
    embedding?: string;
  };
  // Resource limits
  resourceLimits: {
    maxMemoryMB: number;
    maxConcurrentRequests: number;
    defaultTimeoutMs: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  capabilities: ModelCapability[];
  description?: string;
  parameters?: {
    maxTokens: number;
    contextWindow: number;
    temperature?: number;
  };
  status: "available" | "loading" | "error" | "unloaded";
  sizeMB?: number;
  hardwareRequirements?: {
    minRAMMB: number;
    recommendedRAMMB: number;
    gpuRequired: boolean;
  };
}

export class ModelRegistry {
  private models: Map<string, ModelInfo> = new Map();
  private config: ModelRegistryConfig;

  constructor(config: ModelRegistryConfig) {
    this.config = config;
    this.initialize();
  }

  private initialize(): void {
    // Register local models
    for (const model of this.config.localModels) {
      this.registerLocalModel(model);
    }

    // Register external models
    for (const model of this.config.externalModels) {
      this.registerExternalModel(model);
    }
  }

  private registerLocalModel(config: ModelConfig): void {
    const info: ModelInfo = {
      id: config.model,
      name: config.model,
      provider: config.provider,
      capabilities: config.capabilities,
      description: `Local CPU inference model: ${config.model}`,
      parameters: {
        maxTokens: config.maxTokens || 4096,
        contextWindow: config.contextLimit || 4096,
        temperature: config.temperature,
      },
      status: "unloaded",
      hardwareRequirements: {
        minRAMMB: 4096,
        recommendedRAMMB: 8192,
        gpuRequired: false,
      },
    };
    this.models.set(config.model, info);
  }

  private registerExternalModel(config: ModelConfig): void {
    const info: ModelInfo = {
      id: config.model,
      name: config.model,
      provider: config.provider,
      capabilities: config.capabilities,
      description: `External provider model: ${config.model} (${config.provider})`,
      parameters: {
        maxTokens: config.maxTokens || 4096,
        contextWindow: config.contextLimit || 4096,
        temperature: config.temperature,
      },
      status: "available",
    };
    this.models.set(config.model, info);
  }

  registerModel(config: ModelConfig, info?: Partial<ModelInfo>): void {
    const modelInfo: ModelInfo = {
      id: config.model,
      name: info?.name || config.model,
      provider: config.provider,
      capabilities: config.capabilities,
      description: info?.description,
      parameters: {
        maxTokens: config.maxTokens || 4096,
        contextWindow: config.contextLimit || 4096,
        temperature: config.temperature,
        ...info?.parameters,
      },
      status: "available",
      ...info,
    };
    this.models.set(config.model, modelInfo);
  }

  unregisterModel(modelId: string): boolean {
    return this.models.delete(modelId);
  }

  getModel(modelId: string): ModelInfo | undefined {
    return this.models.get(modelId);
  }

  getAllModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }

  getModelsByProvider(provider: ModelProvider): ModelInfo[] {
    return Array.from(this.models.values()).filter(m => m.provider === provider);
  }

  getModelsByCapability(capability: ModelCapability): ModelInfo[] {
    return Array.from(this.models.values()).filter(m => m.capabilities.includes(capability));
  }

  getDefaultModel(capability: ModelCapability): string | undefined {
    return this.config.defaults[capability];
  }

  getAvailableModelsForCapability(capability: ModelCapability): ModelInfo[] {
    return this.getModelsByCapability(capability).filter(m => m.status === "available");
  }

  setModelStatus(modelId: string, status: ModelInfo["status"]): boolean {
    const model = this.models.get(modelId);
    if (model) {
      model.status = status;
      this.models.set(modelId, model);
      return true;
    }
    return false;
  }

  getResourceLimits(): ModelRegistryConfig["resourceLimits"] {
    return this.config.resourceLimits;
  }

  getConfig(): ModelRegistryConfig {
    return { ...this.config };
  }

  // Validate model availability for a request
  validateModelForRequest(modelId: string, capability: ModelCapability): { valid: boolean; error?: string } {
    const model = this.models.get(modelId);
    if (!model) {
      return { valid: false, error: `Model ${modelId} not found in registry` };
    }
    if (!model.capabilities.includes(capability)) {
      return { valid: false, error: `Model ${modelId} does not support ${capability}` };
    }
    if (model.status !== "available") {
      return { valid: false, error: `Model ${modelId} is not available (status: ${model.status})` };
    }
    return { valid: true };
  }

  // Knowledge retrieval interface
  private knowledgeService: KnowledgeRetrievalService | null = null;

  /**
   * Inject the knowledge retrieval service for use in retrieveKnowledge().
   */
  setKnowledgeService(service: KnowledgeRetrievalService): void {
    this.knowledgeService = service;
  }

  async retrieveKnowledge(query: string, limit: number = 5): Promise<KnowledgeRetrievalResult> {
    if (this.knowledgeService) {
      return this.knowledgeService.search(query, limit);
    }
    // Fallback: return empty result if no knowledge service is configured
    return {
      results: [],
      totalFound: 0,
      query,
      retrievedAt: new Date(),
    };
  }

  // Model status methods for API gateway
  getModelStatus(modelId: string): { available: boolean; status: ModelInfo["status"] } | undefined {
    const model = this.models.get(modelId);
    if (!model) return undefined;
    return {
      available: model.status === "available",
      status: model.status,
    };
  }
}

// Default configuration for development
export const defaultModelRegistryConfig: ModelRegistryConfig = {
  localModels: [
    {
      provider: "local",
      model: "glm-4.6-cpu",
      capabilities: ["chat", "completion", "embedding"],
      maxTokens: 4096,
      contextLimit: 8192,
      temperature: 0.4,
    },
  ],
  externalModels: [
    {
      provider: "zai",
      model: "glm-4.6",
      capabilities: ["chat", "completion"],
      maxTokens: 4096,
      contextLimit: 8192,
      temperature: 0.4,
    },
    {
      provider: "openai",
      model: "gpt-4o-mini",
      capabilities: ["chat", "completion", "embedding"],
      maxTokens: 4096,
      contextLimit: 128000,
      temperature: 0.4,
    },
  ],
  defaults: {
    chat: "glm-4.6-cpu",
    completion: "glm-4.6-cpu",
    embedding: "glm-4.6-cpu",
  },
  resourceLimits: {
    maxMemoryMB: 8192,
    maxConcurrentRequests: 5,
    defaultTimeoutMs: 30000,
  },
};

// Production configuration (separate file, not committed)
export interface ProductionModelRegistryConfig extends ModelRegistryConfig {
  localModels: ModelConfig[];
  externalModels: ModelConfig[];
}

export function createModelRegistry(config?: Partial<ModelRegistryConfig>): ModelRegistry {
  const fullConfig = {
    ...defaultModelRegistryConfig,
    ...config,
    localModels: config?.localModels || defaultModelRegistryConfig.localModels,
    externalModels: config?.externalModels || defaultModelRegistryConfig.externalModels,
    defaults: { ...defaultModelRegistryConfig.defaults, ...config?.defaults },
    resourceLimits: { ...defaultModelRegistryConfig.resourceLimits, ...config?.resourceLimits },
  };
  return new ModelRegistry(fullConfig);
}