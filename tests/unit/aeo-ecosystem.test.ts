import { describe, it, expect } from "vitest";
import { computeReadinessAudit, type ReadinessInputs } from "@/lib/aeo/readiness";
import { extractOurCitation } from "@/lib/aeo/tracker";
import { parseSignatureHeader, computeEcosystemSignature } from "@/lib/ecosystem/gateway";
import {
  buildCourse,
  buildCollegeOrUniversity,
  buildFaqPage,
  buildScholarship,
  buildBreadcrumb,
} from "@/lib/json-ld-builders";
import { serializeJsonLd, safeJsonLdStringify } from "@/lib/json-ld";

const fullInputs: ReadinessInputs = {
  publishedUniversities: 120,
  publishedCourses: 400,
  publishedScholarships: 60,
  staleEntities: 10,
  universitiesWithOverview: 110,
  coursesWithDescription: 380,
  articlesPublished: 12,
  faqBlocks: 8,
  llmsTxtPresent: true,
  sitemapRouteCount: 700,
  jsonLdPages: 6,
};

describe("LLM-readiness audit", () => {
  it("scores full evidence highly and reports per-check evidence", () => {
    const audit = computeReadinessAudit(fullInputs);
    expect(audit.score).toBe(100);
    expect(audit.checks.every((c) => c.status === "pass")).toBe(true);
    expect(audit.checks.find((c) => c.id === "content-volume")?.evidence).toContain("120 universities");
  });

  it("degrades honestly: missing llms.txt and stale content lower the score", () => {
    const audit = computeReadinessAudit({ ...fullInputs, llmsTxtPresent: false, staleEntities: 350 });
    const llms = audit.checks.find((c) => c.id === "llms-txt");
    const freshness = audit.checks.find((c) => c.id === "freshness");
    expect(llms?.status).toBe("fail");
    expect(freshness?.status).toBe("fail");
    expect(audit.score).toBeLessThan(80);
    expect(audit.summary).toMatch(/LLM-readiness \d+\/100/);
  });

  it("warns on partial coverage instead of passing", () => {
    const audit = computeReadinessAudit({ ...fullInputs, universitiesWithOverview: 60, coursesWithDescription: 240 });
    expect(audit.checks.find((c) => c.id === "content-depth")?.status).toBe("warn");
  });
});

describe("citation extraction", () => {
  it("finds our domain (and subdomains) among provider URLs and ranks position", () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://alaminn.info";
    try {
    const urls = ["https://example.com/a", "https://www.alaminn.info/higher-study", "https://app.alaminn.info/x"];
    const found = extractOurCitation(urls);
    expect(found.url).toBe("https://www.alaminn.info/higher-study");
    expect(found.position).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });

  it("returns null when our domain is absent", () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://alaminn.info";
    try {
      expect(extractOurCitation(["https://example.com/a"])).toEqual({ url: null, position: null });
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });
});

describe("ecosystem gateway signatures", () => {
  it("parses well-formed signature headers and rejects malformed ones", () => {
    expect(parseSignatureHeader("t=1700000000,v1=" + "a".repeat(64))).toEqual({ t: 1700000000, v1: "a".repeat(64) });
    expect(parseSignatureHeader("garbage")).toBeNull();
    expect(parseSignatureHeader("t=abc,v1=xyz")).toBeNull();
  });

  it("computes deterministic HMAC signatures over timestamp + body", () => {
    const a = computeEcosystemSignature("secret", 1700000000, '{"x":1}');
    const b = computeEcosystemSignature("secret", 1700000000, '{"x":1}');
    const c = computeEcosystemSignature("secret", 1700000001, '{"x":1}');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("JSON-LD builders", () => {
  it("emits only real data (optional fields omitted, never faked)", () => {
    const course = buildCourse({
      title: "MSc Data Science",
      url: "https://alaminn.info/higher-study/courses/msc-data-science",
      description: "One-year research masters.",
      universityName: "Example University",
      studyLevel: "masters",
    });
    expect(course).toMatchObject({ "@type": "Course", name: "MSc Data Science", educationalCredentialAwarded: "masters" });
    expect(course.offers).toBeUndefined(); // no tuition data → no fake offers block
    const uni = buildCollegeOrUniversity({ officialName: "Example University", url: "https://x.io", establishedYear: null, countryName: null });
    expect(uni.foundingDate).toBeUndefined();
  });

  it("builds FAQ and breadcrumb structures", () => {
    const faq = buildFaqPage([{ question: "Q?", answer: "A." }]);
    expect(faq).toMatchObject({ "@type": "FAQPage" });
    const crumb = buildBreadcrumb([{ name: "Home", url: "https://x.io/" }, { name: "Courses", url: "https://x.io/c" }]);
    expect(crumb).toMatchObject({ "@type": "BreadcrumbList", itemListElement: [{ position: 1 }, { position: 2 }] });
  });

  it("renders scholarships as community-standard DefinedTerm with award details", () => {
    const scholarship = buildScholarship({ name: "Global Excellence", url: "https://x.io/s", amount: 5000, currency: "USD", deadline: "2026-12-01" });
    expect(scholarship).toMatchObject({ "@type": "DefinedTerm" });
    expect(scholarship.award).toMatchObject({ value: "5000", currency: "USD" });
  });

  it("serializes XSS-safely through the existing JSON-LD serializer", () => {
    const evil = buildCourse({ title: 'Bad </script><script>alert(1)</script>', url: "https://x.io/c" });
    const json = serializeJsonLd(evil);
    expect(json).not.toContain("</script>");
    expect(safeJsonLdStringify({ a: "<b>" })).toContain("\\u003c");
  });
});
