import { describe, expect, it } from "vitest";
import {
  AI_SERVICES,
  buildServicePrompt,
  getServiceById,
  parseServiceInputs,
} from "@/lib/higher-study/ai-services";
import {
  AI_SERVICE_DOCUMENT_KIND,
  decodeDocumentContent,
  decodeMetadata,
  encodeDocumentContent,
  encodeMetadata,
} from "@/lib/higher-study/ai-services-documents";
import { clientKey, createRateLimiter } from "@/lib/higher-study/ai-services-rate-limit";

describe("Higher Study AI Services catalogue", () => {
  it("publishes the 18 required services with unique ids and bilingual copy", () => {
    expect(AI_SERVICES).toHaveLength(18);
    expect(new Set(AI_SERVICES.map((s) => s.id)).size).toBe(18);
    for (const service of AI_SERVICES) {
      expect(service.titleEn.length).toBeGreaterThan(3);
      expect(service.titleBn.length).toBeGreaterThan(3);
      expect(service.fields.length).toBeGreaterThan(0);
      expect(getServiceById(service.id)?.id).toBe(service.id);
    }
  });

  it("rejects unknown fields, missing required inputs and oversized values", () => {
    const service = getServiceById("cv-builder")!;
    expect(parseServiceInputs(service, { unexpected: "x" }).ok).toBe(false);
    expect(parseServiceInputs(service, { background: "BSc" }).ok).toBe(false);
    const complete = {
      background: "BSc CS",
      experience: "Engineer, 2022-2024",
      projects: "",
      details: "",
    };
    expect(parseServiceInputs(service, complete)).toEqual({
      ok: true,
      inputs: complete,
    });
    expect(
      parseServiceInputs(service, { ...complete, background: "x".repeat(4001) }).ok
    ).toBe(false);
  });

  it("builds prompts that forbid fabricated facts and respect language", () => {
    const service = getServiceById("research-paper-assistant")!;
    const en = buildServicePrompt(service, { background: "BSc", goal: "PhD", details: "" }, "en");
    expect(en.systemPrompt).toMatch(/Never invent/i);
    expect(en.systemPrompt).toMatch(/DOI/i);
    expect(en.userPrompt).toContain("BSc");

    const bn = buildServicePrompt(service, { background: "বিএসসি", goal: "পিএইচডি", details: "" }, "bn");
    expect(bn.systemPrompt).toContain("উদ্ভাবন");
    expect(bn.userPrompt).toContain("বিএসসি");
  });

  it("round-trips private document content and metadata", () => {
    const content = {
      output: "draft",
      inputs: { background: "BSc" },
      language: "en" as const,
      serviceId: "cv-builder",
      provider: "local",
      model: "test-model",
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(decodeDocumentContent(encodeDocumentContent(content))).toEqual(content);
    const metadata = {
      serviceId: "cv-builder",
      language: "bn" as const,
      revision: 2,
      rootId: "root-1",
    };
    expect(decodeMetadata(encodeMetadata(metadata))).toEqual(metadata);
    expect(decodeMetadata("not-json")).toBeNull();
    expect(decodeDocumentContent("legacy plain text").output).toBe("legacy plain text");
    expect(AI_SERVICE_DOCUMENT_KIND).toBe("higher-study-ai-service");
  });
});

describe("AI Services rate limiter", () => {
  it("allows up to the configured number of requests per window", () => {
    const limiter = createRateLimiter(2, 60_000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(true);
    expect(limiter.check("a", 2).allowed).toBe(false);
    expect(limiter.check("a", 60_001).allowed).toBe(true);
    expect(limiter.check("b", 3).allowed).toBe(true);
  });

  it("hashes identifiers instead of storing raw IP addresses", () => {
    const key = clientKey("203.0.113.10");
    expect(key).toMatch(/^[a-f0-9]{24}$/);
    expect(key).not.toContain("203.0.113.10");
  });
});
