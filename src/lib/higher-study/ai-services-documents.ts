/** Serialization helpers for private Higher Study AI Service documents. */
export const AI_SERVICE_DOCUMENT_KIND = "higher-study-ai-service";

export interface AIServiceDocumentContent {
  output: string;
  inputs: Record<string, string>;
  language: "en" | "bn";
  serviceId: string;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface AIServiceDocumentMetadata {
  serviceId: string;
  language: "en" | "bn";
  revision: number;
  rootId: string;
}

export function encodeDocumentContent(content: AIServiceDocumentContent): string {
  return JSON.stringify(content);
}

export function decodeDocumentContent(raw: string): AIServiceDocumentContent {
  try {
    const parsed = JSON.parse(raw) as Partial<AIServiceDocumentContent>;
    if (typeof parsed.output !== "string") throw new Error("missing output");
    return {
      output: parsed.output,
      inputs: parsed.inputs && typeof parsed.inputs === "object" ? parsed.inputs : {},
      language: parsed.language === "bn" ? "bn" : "en",
      serviceId: typeof parsed.serviceId === "string" ? parsed.serviceId : "",
      provider: typeof parsed.provider === "string" ? parsed.provider : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
    };
  } catch {
    return {
      output: raw,
      inputs: {},
      language: "en",
      serviceId: "",
      provider: "",
      model: "",
      generatedAt: "",
    };
  }
}

export function encodeMetadata(metadata: AIServiceDocumentMetadata): string {
  return JSON.stringify(metadata);
}

export function decodeMetadata(raw: string | null): AIServiceDocumentMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AIServiceDocumentMetadata>;
    if (typeof parsed.serviceId !== "string" || typeof parsed.rootId !== "string") return null;
    return {
      serviceId: parsed.serviceId,
      language: parsed.language === "bn" ? "bn" : "en",
      revision: typeof parsed.revision === "number" ? parsed.revision : 1,
      rootId: parsed.rootId,
    };
  } catch {
    return null;
  }
}
