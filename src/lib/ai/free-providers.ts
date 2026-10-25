/**
 * 100% Free AI Services — Provider Catalog & Configuration Registry
 * =================================================================
 * Comprehensive registry of zero-cost LLM, Embedding, Image, STT, TTS,
 * and Search/Tool providers powering every Admin Dashboard AI Agent.
 *
 * Categories:
 *   - "zero-key"   : Works immediately with no API key or signup (Pollinations, Local Grounded)
 *   - "no-card"    : Truly free API tier, no credit card required (Groq, Gemini, Cerebras, GitHub, Cloudflare, SambaNova, Chutes, Zhipu, ModelScope, SiliconFlow, Mistral, NVIDIA, Hugging Face)
 *   - "aggregator" : OpenRouter `:free` models (20 RPM free, optional $10 unlock for 1k RPD)
 *   - "local"      : Self-hosted offline inference via Ollama / LM Studio / llama.cpp ($0 forever)
 *   - "sdk"        : Platform ZAI SDK integration
 *   - "builtin"    : Deterministic grounded synthesis over live platform database + tools
 */

import { db } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/social/crypto";

export type FreeProviderId =
  | "unorouter"
  | "groq"
  | "gemini"
  | "cerebras"
  | "openrouter"
  | "github"
  | "cloudflare"
  | "sambanova"
  | "chutes"
  | "pollinations"
  | "zhipu"
  | "modelscope"
  | "siliconflow"
  | "mistral"
  | "nvidia"
  | "huggingface"
  | "ollama"
  | "zai"
  | "local-grounded";

export type ProviderTierCategory =
  | "zero-key"
  | "no-card"
  | "aggregator"
  | "local"
  | "sdk"
  | "builtin";

export type ModelSpeedTier = "fast" | "flagship" | "reasoning";

export interface FreeProviderSpec {
  id: FreeProviderId;
  name: string;
  badge?: string;
  category: ProviderTierCategory;
  requiresKey: boolean;
  requiresAccountId?: boolean;
  envKeyNames: string[];
  envBaseUrlName?: string;
  envAccountIdName?: string;
  defaultBaseUrl: string;
  signupUrl: string;
  rateLimitNote: string;
  supportsToolCalling: boolean;
  supportsEmbeddings: boolean;
  supportsImageGen?: boolean;
  supportsStt?: boolean;
  supportsTts?: boolean;
  models: {
    fast: string;
    flagship: string;
    reasoning: string;
    all: string[];
    embeddings?: string[];
    stt?: string[];
    tts?: string[];
  };
  notes: string;
}

export const FREE_AI_PROVIDERS: FreeProviderSpec[] = [
  {
    id: "unorouter",
    name: "UnoRouter AI Gateway",
    badge: "⭐ Primary Preferred",
    category: "aggregator",
    requiresKey: true,
    envKeyNames: ["UNOROUTER_API_KEY"],
    envBaseUrlName: "UNOROUTER_BASE_URL",
    defaultBaseUrl: "https://api.unorouter.com/v1",
    signupUrl: "https://unorouter.com",
    rateLimitNote: "OpenAI-compatible unified gateway (claude-opus-4-6-thinking & frontier models)",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "claude-opus-4-6-thinking",
      flagship: "claude-opus-4-6-thinking",
      reasoning: "claude-opus-4-6-thinking",
      all: [
        "claude-opus-4-6-thinking",
        "claude-sonnet-4-6",
        "gpt-4o",
        "deepseek-r1",
      ],
    },
    notes: "Primary preferred OpenAI-compatible endpoint (https://api.unorouter.com/v1/chat/completions) defaulting to claude-opus-4-6-thinking.",
  },
  {
    id: "groq",
    name: "Groq Cloud",
    badge: "⭐ Fastest",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["GROQ_API_KEY"],
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    signupUrl: "https://console.groq.com/keys",
    rateLimitNote: "~30–100 req/min, generous daily token cap, no card required",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    supportsStt: true,
    supportsTts: false,
    models: {
      fast: "qwen/qwen3-30b-a3b",
      flagship: "qwen/qwen3-32b",
      reasoning: "llama-3.3-70b-versatile",
      all: [
        "qwen/qwen3-32b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "qwen/qwen3-30b-a3b",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "moonshotai/kimi-k2-instruct",
      ],
      stt: ["whisper-large-v3-turbo", "whisper-large-v3"],
    },
    notes: "Ultra-low latency LPU inference + Whisper STT on free tier.",
  },
  {
    id: "gemini",
    name: "Google AI Studio (Gemini)",
    badge: "⭐ 1M Context",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    signupUrl: "https://aistudio.google.com/apikey",
    rateLimitNote: "~15–30 RPM (500+ RPD), 1M token context, no card required",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    supportsImageGen: true,
    models: {
      fast: "gemini-2.5-flash-lite",
      flagship: "gemini-2.5-flash",
      reasoning: "gemini-2.5-flash",
      all: [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
      ],
      embeddings: ["gemini-embedding-001", "text-embedding-004"],
    },
    notes: "Best free long-context Gemini models + free embeddings via OpenAI-compatible endpoint.",
  },
  {
    id: "cerebras",
    name: "Cerebras Inference",
    badge: "⭐ Ultra Fast",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["CEREBRAS_API_KEY"],
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    signupUrl: "https://cloud.cerebras.ai",
    rateLimitNote: "Very generous tiered RPM & daily tokens, no card required",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "llama3.1-8b",
      flagship: "llama-3.3-70b",
      reasoning: "qwen-3-235b-a22b-instruct-2507",
      all: [
        "llama-3.3-70b",
        "llama3.1-8b",
        "qwen-3-235b-a22b-instruct-2507",
        "qwen-3-32b",
        "qwen-3-30b-a3b",
        "gpt-oss-120b",
      ],
    },
    notes: "Wafer-scale inference with 2,000+ tok/s speed — ideal backup & batch engine.",
  },
  {
    id: "openrouter",
    name: "OpenRouter (:free Models)",
    badge: "⭐ Best Aggregator",
    category: "aggregator",
    requiresKey: true,
    envKeyNames: ["OPENROUTER_API_KEY"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    signupUrl: "https://openrouter.ai/keys",
    rateLimitNote: "~20 req/min free (no card); optional one-time $10 unlocks 1,000 req/day on :free",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "openai/gpt-oss-20b:free",
      flagship: "qwen/qwen3-32b:free",
      reasoning: "deepseek/deepseek-r1:free",
      all: [
        "qwen/qwen3-32b:free",
        "deepseek/deepseek-chat-v3-0324:free",
        "deepseek/deepseek-r1:free",
        "openai/gpt-oss-120b:free",
        "openai/gpt-oss-20b:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "qwen/qwen3-235b-a22b:free",
        "google/gemini-2.0-flash-exp:free",
        "mistralai/mistral-small-3.2-24b-instruct:free",
        "microsoft/phi-3.5-mini-instruct:free",
        "google/gemma-2-9b-it:free",
        "nousresearch/hermes-3-llama-3.1-405b:free",
        "moonshotai/kimi-k2-instruct:free",
        "meta-llama/llama-4-scout-17b-16e-instruct:free",
        "nvidia/llama-3.1-nemotron-70b-instruct:free",
      ],
    },
    notes: "One key unlocks dozens of :free models with live model list discovery.",
  },
  {
    id: "github",
    name: "GitHub Models",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["GITHUB_MODELS_TOKEN"],
    defaultBaseUrl: "https://models.inference.ai.azure.com",
    signupUrl: "https://github.com/settings/tokens",
    rateLimitNote: "~10–15 RPM (150 RPD) using a personal GitHub PAT",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    models: {
      fast: "gpt-4o-mini",
      flagship: "gpt-4.1-mini",
      reasoning: "DeepSeek-R1",
      all: [
        "gpt-4o-mini",
        "gpt-4.1-mini",
        "gpt-4.1",
        "Phi-4",
        "Mistral-small",
        "DeepSeek-R1",
        "Llama-3.3-70B-Instruct",
      ],
      embeddings: ["text-embedding-3-small"],
    },
    notes: "Free access to GPT-4o-mini, GPT-4.1, Phi-4, and DeepSeek-R1 with your GitHub account.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    category: "no-card",
    requiresKey: true,
    requiresAccountId: true,
    envKeyNames: ["CLOUDFLARE_API_TOKEN"],
    envAccountIdName: "CLOUDFLARE_ACCOUNT_ID",
    defaultBaseUrl: "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1",
    signupUrl: "https://dash.cloudflare.com",
    rateLimitNote: "10,000 free neurons/day across LLMs, BGE embeddings, Whisper & TTS",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    supportsStt: true,
    supportsTts: true,
    models: {
      fast: "@cf/meta/llama-3.1-8b-instruct",
      flagship: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      reasoning: "@cf/openai/gpt-oss-120b",
      all: [
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "@cf/openai/gpt-oss-120b",
        "@cf/qwen/qwen3-30b-a3b-fp8",
        "@cf/meta/llama-3.1-8b-instruct",
      ],
      embeddings: ["@cf/baai/bge-m3", "@cf/baai/bge-base-en-v1.5", "@cf/baai/bge-large-en-v1.5"],
      stt: ["@cf/openai/whisper", "@cf/meta/mms-1b-asr"],
      tts: ["@cf/facebook/mms-tts-eng"],
    },
    notes: "Edge inference + free BGE embeddings + Whisper STT within 10k daily neurons.",
  },
  {
    id: "sambanova",
    name: "SambaNova Cloud",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["SAMBANOVA_API_KEY"],
    defaultBaseUrl: "https://api.sambanova.ai/v1",
    signupUrl: "https://cloud.sambanova.ai",
    rateLimitNote: "~20 RPM free tier, no card required",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "Meta-Llama-3.3-70B-Instruct",
      flagship: "Meta-Llama-3.3-70B-Instruct",
      reasoning: "DeepSeek-R1-Distill-Llama-70B",
      all: [
        "Meta-Llama-3.3-70B-Instruct",
        "DeepSeek-R1-Distill-Llama-70B",
        "Qwen2.5-72B-Instruct",
      ],
    },
    notes: "Fast RDU hardware running 70B+ Llama, Qwen & DeepSeek models for free.",
  },
  {
    id: "chutes",
    name: "Chutes.ai",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["CHUTES_API_KEY"],
    defaultBaseUrl: "https://llm.chutes.ai/v1",
    signupUrl: "https://chutes.ai",
    rateLimitNote: "Generous decentralized free tier",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "Qwen/Qwen3-32B",
      flagship: "Qwen/Qwen3-32B",
      reasoning: "deepseek-ai/DeepSeek-R1",
      all: [
        "deepseek-ai/DeepSeek-R1",
        "Qwen/Qwen3-32B",
        "unsloth/DeepSeek-R1",
      ],
    },
    notes: "Serverless open-weight DeepSeek-R1 & Qwen3 endpoints.",
  },
  {
    id: "zhipu",
    name: "Zhipu AI (BigModel)",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["ZHIPU_API_KEY"],
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    signupUrl: "https://open.bigmodel.cn",
    rateLimitNote: "glm-4-flash & glm-4.5-flash free unlimited-ish tier",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "glm-4-flash",
      flagship: "glm-4.5-flash",
      reasoning: "glm-4.5-flash",
      all: ["glm-4.5-flash", "glm-4-flash", "glm-4-air"],
    },
    notes: "Official Zhipu GLM Flash models with generous free concurrency.",
  },
  {
    id: "mistral",
    name: "Mistral La Plateforme",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["MISTRAL_API_KEY"],
    defaultBaseUrl: "https://api.mistral.ai/v1",
    signupUrl: "https://console.mistral.ai",
    rateLimitNote: "Experimentation free tier (phone verification)",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    models: {
      fast: "mistral-small-latest",
      flagship: "mistral-small-latest",
      reasoning: "magistral-small-latest",
      all: [
        "mistral-small-latest",
        "magistral-small-latest",
        "codestral-latest",
        "pixtral-12b-2409",
      ],
      embeddings: ["mistral-embed"],
    },
    notes: "Includes Mistral Small, Magistral reasoning, Codestral & mistral-embed.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["NVIDIA_API_KEY"],
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    signupUrl: "https://build.nvidia.com",
    rateLimitNote: "Free developer credits across 100+ NIM microservices",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    models: {
      fast: "meta/llama-3.3-70b-instruct",
      flagship: "qwen/qwen3-235b-a22b",
      reasoning: "deepseek-ai/deepseek-r1",
      all: [
        "meta/llama-3.3-70b-instruct",
        "deepseek-ai/deepseek-r1",
        "qwen/qwen3-235b-a22b",
        "nvidia/llama-3.1-nemotron-70b-instruct",
      ],
      embeddings: ["nvidia/nv-embedqa-e5-v5"],
    },
    notes: "Enterprise NIM endpoints for Llama 3.3, Qwen3-235B, Nemotron & DeepSeek-R1.",
  },
  {
    id: "huggingface",
    name: "Hugging Face Inference",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
    defaultBaseUrl: "https://router.huggingface.co/v1",
    signupUrl: "https://huggingface.co/settings/tokens",
    rateLimitNote: "Free monthly serverless inference credits via HF Router",
    supportsToolCalling: false,
    supportsEmbeddings: false,
    supportsStt: false,
    models: {
      fast: "Qwen/Qwen2.5-72B-Instruct",
      flagship: "meta-llama/Llama-3.3-70B-Instruct",
      reasoning: "deepseek-ai/DeepSeek-R1",
      all: [
        "Qwen/Qwen2.5-72B-Instruct",
        "meta-llama/Llama-3.3-70B-Instruct",
        "deepseek-ai/DeepSeek-R1",
      ],
    },
    notes: "Serverless open-weight LLMs via Hugging Face OpenAI-compatible router.",
  },
  {
    id: "modelscope",
    name: "ModelScope (Alibaba)",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["MODELSCOPE_API_KEY"],
    defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
    signupUrl: "https://modelscope.cn",
    rateLimitNote: "Free daily developer inference quota",
    supportsToolCalling: true,
    supportsEmbeddings: false,
    models: {
      fast: "Qwen/Qwen3-32B",
      flagship: "deepseek-ai/DeepSeek-V3",
      reasoning: "deepseek-ai/DeepSeek-R1",
      all: ["Qwen/Qwen3-32B", "deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"],
    },
    notes: "OpenAI-compatible Alibaba developer API for Qwen3 & DeepSeek.",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    category: "no-card",
    requiresKey: true,
    envKeyNames: ["SILICONFLOW_API_KEY"],
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    signupUrl: "https://siliconflow.cn",
    rateLimitNote: "Selected 7B–9B & embedding models permanently free ($0/1M tokens)",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    models: {
      fast: "Qwen/Qwen3-8B",
      flagship: "Qwen/Qwen3-8B",
      reasoning: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      all: ["Qwen/Qwen3-8B", "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"],
      embeddings: ["BAAI/bge-m3"],
    },
    notes: "Free Qwen3-8B, distilled DeepSeek-R1 & BAAI/bge-m3 embeddings.",
  },
  {
    id: "pollinations",
    name: "Pollinations.ai",
    badge: "✨ No Key Needed",
    category: "zero-key",
    requiresKey: false,
    envKeyNames: [],
    defaultBaseUrl: "https://text.pollinations.ai/openai",
    signupUrl: "https://pollinations.ai",
    rateLimitNote: "100% free, zero API key, zero signup (text + FLUX image generation)",
    supportsToolCalling: false,
    supportsEmbeddings: false,
    supportsImageGen: true,
    models: {
      fast: "openai",
      flagship: "openai",
      reasoning: "qwen-coder",
      all: ["openai", "mistral", "qwen-coder", "llama"],
    },
    notes: "Instant zero-key OpenAI-compatible text endpoint + https://image.pollinations.ai/prompt/{prompt}.",
  },
  {
    id: "ollama",
    name: "Ollama (Local Self-Hosted)",
    badge: "🔒 100% Private & Unlimited",
    category: "local",
    requiresKey: false,
    envKeyNames: ["OLLAMA_API_KEY"],
    envBaseUrlName: "OLLAMA_BASE_URL",
    defaultBaseUrl: "http://localhost:11434/v1",
    signupUrl: "https://ollama.com",
    rateLimitNote: "Unlimited offline inference ($0 forever after hardware)",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    models: {
      fast: "qwen3:8b",
      flagship: "qwen3:30b-a3b",
      reasoning: "deepseek-r1:14b",
      all: [
        "qwen3:30b-a3b",
        "qwen3:32b",
        "qwen3:8b",
        "llama3.3:70b",
        "llama3.2:3b",
        "gemma3:12b",
        "mistral-small3.2:24b",
        "phi4:14b",
        "deepseek-r1:14b",
        "deepseek-r1:32b",
        "qwen2.5-coder:32b",
        "gpt-oss:20b",
      ],
      embeddings: ["bge-m3", "nomic-embed-text", "mxbai-embed-large"],
    },
    notes: "Run `ollama pull qwen3:30b-a3b` & `ollama pull bge-m3` locally for zero-cloud privacy.",
  },
  {
    id: "zai",
    name: "ZAI Platform SDK",
    category: "sdk",
    requiresKey: false,
    envKeyNames: ["ZAI_API_KEY"],
    defaultBaseUrl: "sdk://z-ai-web-dev-sdk",
    signupUrl: "https://open.bigmodel.cn",
    rateLimitNote: "Uses installed z-ai-web-dev-sdk when credentials exist",
    supportsToolCalling: false,
    supportsEmbeddings: false,
    models: {
      fast: "glm-4.6",
      flagship: "glm-4.6",
      reasoning: "glm-4.6",
      all: ["glm-4.6"],
    },
    notes: "Native platform SDK fallback shared with WhatsApp & ai-worker.",
  },
  {
    id: "local-grounded",
    name: "Alaminn Grounded Local Engine",
    badge: "✅ Always Ready",
    category: "builtin",
    requiresKey: false,
    envKeyNames: [],
    defaultBaseUrl: "builtin://local-grounded",
    signupUrl: "",
    rateLimitNote: "Unlimited, 0ms network cost, works 100% airgapped/offline",
    supportsToolCalling: true,
    supportsEmbeddings: true,
    models: {
      fast: "alaminn-grounded-v1",
      flagship: "alaminn-grounded-v1",
      reasoning: "alaminn-grounded-v1",
      all: ["alaminn-grounded-v1"],
      embeddings: ["alaminn-hash-embed-384"],
    },
    notes: "Guaranteed zero-failure fallback: synthesizes structured executive briefings directly from live Prisma database records and tool outputs.",
  },
];

export const FREE_PROVIDER_MAP: Record<FreeProviderId, FreeProviderSpec> = Object.fromEntries(
  FREE_AI_PROVIDERS.map((p) => [p.id, p])
) as Record<FreeProviderId, FreeProviderSpec>;

/** Default priority order: UnoRouter (Primary Preferred) → Groq → Gemini → Cerebras → OpenRouter → GitHub → SambaNova → Zhipu → Mistral → Cloudflare → Pollinations → Ollama → ZAI → Local Grounded */
export const DEFAULT_FALLBACK_ORDER: FreeProviderId[] = [
  "unorouter",
  "groq",
  "gemini",
  "cerebras",
  "openrouter",
  "github",
  "sambanova",
  "zhipu",
  "mistral",
  "cloudflare",
  "chutes",
  "nvidia",
  "huggingface",
  "modelscope",
  "siliconflow",
  "ollama",
  "pollinations",
  "zai",
  "local-grounded",
];

/** Encrypt a provider/tool secret with AES-256-GCM before storing in `Setting`. */
export function encryptStoredAiSecret(plain: string): string {
  const trimmed = plain.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("v1:")) return trimmed;
  return encryptToken(trimmed);
}

/** Decrypt a provider/tool secret stored in `Setting` (supports legacy plaintext during migration). */
export function decryptStoredAiSecret(stored: string | undefined | null): string {
  if (!stored) return "";
  const trimmed = stored.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("v1:")) {
    return decryptToken(trimmed) || "";
  }
  return trimmed;
}

/** Normalize an OpenAI-compatible base URL (strips trailing slashes and accidental `/chat/completions`). */
export function normalizeOpenAiBaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/+$/, "");
}

function isDisallowedInternalHost(hostname: string, allowLoopback: boolean): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (
    h === "metadata.google.internal" ||
    h === "169.254.169.254" ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return true;
  }
  const isLoopback =
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h.startsWith("127.") ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "0.0.0.0";
  if (isLoopback) {
    return !allowLoopback || h === "0.0.0.0";
  }
  // IPv6 ULA / link-local / IPv4-mapped private
  if (h.includes(":")) {
    if (
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("fe80") ||
      h.startsWith("::ffff:127.") ||
      h.startsWith("::ffff:10.") ||
      h.startsWith("::ffff:192.168.") ||
      h.startsWith("::ffff:169.254.") ||
      /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(h)
    ) {
      return true;
    }
  }
  // IPv4 private / link-local / CGNAT / reserved
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a custom provider base URL against SSRF and protocol downgrade attacks.
 */
export function validateProviderBaseUrl(
  providerId: FreeProviderId,
  candidateUrl: string
): { ok: boolean; normalizedUrl: string; error?: string } {
  const spec = FREE_PROVIDER_MAP[providerId];
  if (!spec) {
    return { ok: false, normalizedUrl: "", error: "Unknown provider ID." };
  }
  const normalized = normalizeOpenAiBaseUrl(candidateUrl);
  if (!normalized) {
    return { ok: true, normalizedUrl: "" };
  }
  if (normalized === normalizeOpenAiBaseUrl(spec.defaultBaseUrl)) {
    return { ok: true, normalizedUrl: normalized };
  }
  if (spec.id === "local-grounded" || spec.id === "zai") {
    return { ok: false, normalizedUrl: "", error: `${spec.name} does not accept custom HTTP base URLs.` };
  }

  // Handle Cloudflare `{accountId}` template placeholder during validation
  const urlForParse = normalized.replace(/\{accountId\}/g, "account");
  let parsed: URL;
  try {
    parsed = new URL(urlForParse);
  } catch {
    return { ok: false, normalizedUrl: "", error: "Invalid base URL format." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, normalizedUrl: "", error: "Credentials in base URL are not permitted." };
  }

  const isOllama = providerId === "ollama";
  if (!isOllama && parsed.protocol !== "https:") {
    return { ok: false, normalizedUrl: "", error: "Cloud AI providers must use https:// base URLs." };
  }
  if (isOllama && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, normalizedUrl: "", error: "Ollama base URL must use http:// or https://." };
  }

  if (isDisallowedInternalHost(parsed.hostname, isOllama)) {
    return {
      ok: false,
      normalizedUrl: "",
      error: "Private, loopback, link-local, or metadata hosts are blocked for security.",
    };
  }

  return { ok: true, normalizedUrl: normalized };
}

export interface ResolvedProviderConfig {
  spec: FreeProviderSpec;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  accountId: string;
  customModel: string;
  configured: boolean;
  keySource: "db" | "env" | "none";
}

export interface FreeAiGlobalSettings {
  preferredProvider: FreeProviderId | "auto";
  fallbackOrder: FreeProviderId[];
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  smartTierRouting: boolean;
  enableExternalFreeTools: boolean;
  enablePollinationsTextFallback: boolean;
  tavilyApiKey: string;
  braveSearchApiKey: string;
  jinaApiKey: string;
  elevenlabsApiKey: string;
}

const SETTINGS_CACHE_TTL_MS = 10_000;
let settingsCache: { at: number; map: Record<string, string> } | null = null;

export function invalidateFreeAiSettingsCache(): void {
  settingsCache = null;
}

export async function loadFreeAiRawSettings(): Promise<Record<string, string>> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_TTL_MS) {
    return settingsCache.map;
  }
  const map: Record<string, string> = {};
  try {
    const rows = await db.setting.findMany({
      where: { key: { startsWith: "ai.free." } },
    });
    for (const r of rows) {
      map[r.key] = r.value;
    }
  } catch {
    // Database might not be initialized in unit-test or build contexts — degrade gracefully to env vars
  }
  settingsCache = { at: Date.now(), map };
  return map;
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export async function resolveAllProviderConfigs(): Promise<{
  providers: ResolvedProviderConfig[];
  global: FreeAiGlobalSettings;
}> {
  const raw = await loadFreeAiRawSettings();

  const preferredRaw =
    raw["ai.free.preferredProvider"] ||
    process.env.FREE_AI_PREFERRED_PROVIDER ||
    process.env.AI_PREFERRED_PROVIDER ||
    "unorouter";
  const preferredProvider = (
    preferredRaw === "auto" || preferredRaw in FREE_PROVIDER_MAP ? preferredRaw : "unorouter"
  ) as FreeProviderId | "auto";

  let fallbackOrder = DEFAULT_FALLBACK_ORDER;
  if (raw["ai.free.fallbackOrder"]) {
    try {
      const parsed = JSON.parse(raw["ai.free.fallbackOrder"]) as FreeProviderId[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((id) => id in FREE_PROVIDER_MAP);
        for (const def of DEFAULT_FALLBACK_ORDER) {
          if (!valid.includes(def)) valid.push(def);
        }
        fallbackOrder = valid;
      }
    } catch {
      // keep default
    }
  }

  const global: FreeAiGlobalSettings = {
    preferredProvider,
    fallbackOrder,
    cacheEnabled: raw["ai.free.cacheEnabled"] !== "false",
    cacheTtlSeconds: Math.max(15, Number(raw["ai.free.cacheTtlSeconds"] || "300") || 300),
    smartTierRouting: raw["ai.free.smartTierRouting"] !== "false",
    enableExternalFreeTools: raw["ai.free.enableExternalFreeTools"] !== "false",
    enablePollinationsTextFallback: raw["ai.free.enablePollinationsTextFallback"] !== "false",
    tavilyApiKey:
      decryptStoredAiSecret(raw["ai.free.tool.tavilyApiKey"]) || process.env.TAVILY_API_KEY || "",
    braveSearchApiKey:
      decryptStoredAiSecret(raw["ai.free.tool.braveSearchApiKey"]) ||
      process.env.BRAVE_SEARCH_API_KEY ||
      "",
    jinaApiKey:
      decryptStoredAiSecret(raw["ai.free.tool.jinaApiKey"]) || process.env.JINA_API_KEY || "",
    elevenlabsApiKey:
      decryptStoredAiSecret(raw["ai.free.tool.elevenlabsApiKey"]) ||
      process.env.ELEVENLABS_API_KEY ||
      "",
  };

  const providers: ResolvedProviderConfig[] = FREE_AI_PROVIDERS.map((spec) => {
    const dbEnabled = raw[`ai.free.provider.${spec.id}.enabled`];
    const ollamaEnvEnabled =
      process.env.OLLAMA_ENABLED === "true" ||
      (process.env.OLLAMA_ENABLED !== "false" && Boolean(process.env.OLLAMA_BASE_URL));
    // Ollama defaults to disabled unless explicitly enabled so cloud hosts don't stall on localhost:11434
    const defaultEnabled =
      spec.id === "ollama"
        ? Boolean(ollamaEnvEnabled || dbEnabled === "true")
        : spec.id === "pollinations"
          ? global.enablePollinationsTextFallback
          : true;
    const enabled = dbEnabled !== undefined ? dbEnabled === "true" : defaultEnabled;

    const dbKey = decryptStoredAiSecret(raw[`ai.free.provider.${spec.id}.apiKey`]);
    let envKey = "";
    for (const envName of spec.envKeyNames) {
      if (process.env[envName]?.trim()) {
        envKey = process.env[envName]!.trim();
        break;
      }
    }

    const accountId =
      decryptStoredAiSecret(raw[`ai.free.provider.${spec.id}.accountId`]) ||
      (spec.envAccountIdName ? (process.env[spec.envAccountIdName] || "").trim() : "");

    const rawDbBaseUrl = (raw[`ai.free.provider.${spec.id}.baseUrl`] || "").trim();
    const rawEnvBaseUrl = spec.envBaseUrlName
      ? (process.env[spec.envBaseUrlName] || "").trim()
      : "";

    let baseUrl = normalizeOpenAiBaseUrl(spec.defaultBaseUrl) || spec.defaultBaseUrl;
    let baseUrlSource: "db" | "env" | "default" = "default";

    if (rawDbBaseUrl) {
      const check = validateProviderBaseUrl(spec.id, rawDbBaseUrl);
      if (check.ok && check.normalizedUrl) {
        baseUrl = check.normalizedUrl;
        baseUrlSource = "db";
      }
    } else if (rawEnvBaseUrl) {
      const check = validateProviderBaseUrl(spec.id, rawEnvBaseUrl);
      if (check.ok && check.normalizedUrl) {
        baseUrl = check.normalizedUrl;
        baseUrlSource = "env";
      }
    }

    if (spec.id === "cloudflare" && accountId) {
      baseUrl = baseUrl.replace("{accountId}", accountId);
    }

    // Security guard (SEC-03): Never send server `process.env` API keys to a DB-overridden host
    // that differs from the provider's official hostname.
    let allowEnvKey = true;
    if (!dbKey && envKey && baseUrlSource === "db" && spec.defaultBaseUrl.startsWith("https://")) {
      try {
        const officialHost = new URL(spec.defaultBaseUrl.replace("{accountId}", "account")).hostname;
        const targetHost = new URL(baseUrl.replace("{accountId}", "account")).hostname;
        if (officialHost !== targetHost) {
          allowEnvKey = false;
        }
      } catch {
        allowEnvKey = false;
      }
    }

    const effectiveEnvKey = allowEnvKey ? envKey : "";
    const apiKey = dbKey || effectiveEnvKey;
    const keySource: "db" | "env" | "none" = dbKey ? "db" : effectiveEnvKey ? "env" : "none";

    const customModel = (raw[`ai.free.provider.${spec.id}.model`] || "").trim();

    let configured = false;
    if (!spec.requiresKey) {
      if (spec.id === "ollama") {
        configured = Boolean(raw[`ai.free.provider.ollama.enabled`] === "true" || ollamaEnvEnabled);
      } else {
        configured = true;
      }
    } else if (spec.requiresAccountId) {
      configured = Boolean(apiKey && accountId);
    } else {
      configured = Boolean(apiKey);
    }

    return {
      spec,
      enabled,
      apiKey,
      baseUrl,
      accountId,
      customModel,
      configured,
      keySource,
    };
  });

  return { providers, global };
}

/**
 * Live OpenRouter `:free` model list discovery
 * Mirrors the guide's `GET https://openrouter.ai/api/v1/models` → filter `id.endswith(":free")`.
 */
export async function fetchOpenRouterFreeModels(timeoutMs = 8000): Promise<{
  models: { id: string; name: string; contextLength: number }[];
  source: "live" | "static-fallback";
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; name?: string; context_length?: number }>;
    };
    const free = (json.data || [])
      .filter((m) => typeof m.id === "string" && m.id.endsWith(":free"))
      .map((m) => ({
        id: m.id,
        name: m.name || m.id.replace(":free", ""),
        contextLength: m.context_length || 32768,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (free.length > 0) {
      return { models: free, source: "live" };
    }
    throw new Error("No :free models returned");
  } catch (e) {
    const fallback = FREE_PROVIDER_MAP.openrouter.models.all.map((id) => ({
      id,
      name: id.replace(":free", ""),
      contextLength: 32768,
    }));
    return {
      models: fallback,
      source: "static-fallback",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
