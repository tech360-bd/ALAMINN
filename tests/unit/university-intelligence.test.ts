import { describe, it, expect } from "vitest";
import {
  INTELLIGENCE_STATUSES,
  canTransition,
  isIntelligenceStatus,
  isVerified,
  needsHumanReview,
  toCatalogueVerificationStatus,
  outranks,
} from "@/lib/higher-study/intelligence/statuses";
import { parseRobots, decideByRules, canFetch, clearRobotsCache } from "@/lib/higher-study/intelligence/robots";
import { SOURCE_ORG_DEFINITIONS, resolveSourceLevel } from "@/lib/higher-study/intelligence/sources";
import { normaliseForComparison } from "@/lib/higher-study/intelligence/conflicts";
import { normaliseName, similarity } from "@/lib/higher-study/intelligence/duplicates";
import { excerpt, detectAcademicYear, normaliseSignalValue, findWordingExcerpt, statusForCollectedFact } from "@/lib/higher-study/intelligence/collector";
import { toCsv, type ExportResult } from "@/lib/higher-study/intelligence/exporter";
import { DISPLAYED_FIELDS } from "@/lib/higher-study/intelligence/publication";

describe("intelligence status vocabulary (§4)", () => {
  it("defines exactly the eight spec statuses", () => {
    expect([...INTELLIGENCE_STATUSES]).toEqual([
      "DISCOVERED",
      "SOURCE_CHECK_REQUIRED",
      "OFFICIAL_SOURCE_VERIFIED",
      "CONFLICTING_INFORMATION",
      "OUTDATED",
      "UNAVAILABLE",
      "HUMAN_REVIEW_REQUIRED",
      "APPROVED_FOR_PUBLICATION",
    ]);
  });
  it("discovery cannot jump straight to publication", () => {
    expect(canTransition("DISCOVERED", "APPROVED_FOR_PUBLICATION")).toBe(false);
    expect(canTransition("DISCOVERED", "OFFICIAL_SOURCE_VERIFIED")).toBe(false);
    expect(canTransition("DISCOVERED", "SOURCE_CHECK_REQUIRED")).toBe(true);
  });
  it("only verified facts may be approved for publication", () => {
    expect(canTransition("OFFICIAL_SOURCE_VERIFIED", "APPROVED_FOR_PUBLICATION")).toBe(true);
    expect(canTransition("SOURCE_CHECK_REQUIRED", "APPROVED_FOR_PUBLICATION")).toBe(false);
    expect(canTransition("CONFLICTING_INFORMATION", "APPROVED_FOR_PUBLICATION")).toBe(false);
  });
  it("rejects unknown statuses", () => {
    expect(isIntelligenceStatus("LIVE")).toBe(false);
    expect(canTransition("DISCOVERED", "LIVE")).toBe(false);
  });
  it("verified = official or approved; conflicts always need human review", () => {
    expect(isVerified("OFFICIAL_SOURCE_VERIFIED")).toBe(true);
    expect(isVerified("APPROVED_FOR_PUBLICATION")).toBe(true);
    expect(isVerified("DISCOVERED")).toBe(false);
    expect(needsHumanReview("CONFLICTING_INFORMATION")).toBe(true);
    expect(needsHumanReview("HUMAN_REVIEW_REQUIRED")).toBe(true);
  });
  it("maps onto the existing catalogue lifecycle without rewriting it", () => {
    expect(toCatalogueVerificationStatus("APPROVED_FOR_PUBLICATION")).toBe("verified");
    expect(toCatalogueVerificationStatus("OFFICIAL_SOURCE_VERIFIED")).toBe("pending-review");
    expect(toCatalogueVerificationStatus("DISCOVERED")).toBe("needs-update");
  });
  it("Level 1 official sources outrank discovery platforms", () => {
    expect(outranks("L1_OFFICIAL", "L2_DISCOVERY")).toBe(true);
    expect(outranks("L2_DISCOVERY", "L1_OFFICIAL")).toBe(false);
  });
});

describe("robots.txt gate — restrictions are never bypassed (§2, §5)", () => {
  it("parses agent groups: exact agent group replaces `*`; longest-match rules inside it", () => {
    const robots = `User-agent: *\nDisallow: /private/\nDisallow: /courses/x\nUser-agent: ALO-Education-Intelligence\nDisallow: /private/\nAllow: /courses/x\n`;
    const { rules } = parseRobots(robots);
    // Our exact agent group applies — not the merged `*` group.
    expect(rules).toHaveLength(2);
    expect(decideByRules("/private/secret", rules).allowed).toBe(false);
    expect(decideByRules("/courses/x", rules).allowed).toBe(true); // longer allow rule wins inside the group
    expect(decideByRules("/public/page", rules).allowed).toBe(true);
  });
  it("falls back to the `*` group when no exact agent group exists", () => {
    const { rules } = parseRobots("User-agent: *\nDisallow: /admin/\n");
    expect(rules).toHaveLength(1);
    expect(decideByRules("/admin/tool", rules).allowed).toBe(false);
    expect(decideByRules("/course", rules).allowed).toBe(true);
  });
  it("empty robots → no rules → allowed", () => {
    const { rules } = parseRobots("User-agent: *\n");
    expect(rules).toHaveLength(0);
    expect(decideByRules("/anything", rules).allowed).toBe(true);
  });
  it("respects crawl-delay for our agent", () => {
    const { delayMs } = parseRobots("User-agent: ALO-Education-Intelligence\nCrawl-delay: 5\n");
    expect(delayMs).toBe(5000);
  });
  it("blocked path → canFetch denies with known certainty", async () => {
    clearRobotsCache();
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      }
      return new Response("should not be fetched", { status: 200 });
    }) as typeof fetch;
    const decision = await canFetch("https://example.org/courses/msc-cs", fetchImpl);
    expect(decision.allowed).toBe(false);
    expect(decision.certainty).toBe("known");
  });
  it("unreachable robots.txt → unknown → fetch skipped (conservative)", async () => {
    clearRobotsCache();
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const decision = await canFetch("https://example.org/programme", fetchImpl);
    expect(decision.allowed).toBe(false);
    expect(decision.certainty).toBe("unknown");
  });
  it("404 robots.txt → crawling permitted", async () => {
    clearRobotsCache();
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/robots.txt")) return new Response("not found", { status: 404 });
      return new Response("<html></html>", { status: 200 });
    }) as typeof fetch;
    const decision = await canFetch("https://example.org/page", fetchImpl);
    expect(decision.allowed).toBe(true);
    expect(decision.certainty).toBe("known");
  });
});

describe("documented source registry (§1, §3)", () => {
  it("registers the five named discovery platforms + official + credible tiers", () => {
    const keys = SOURCE_ORG_DEFINITIONS.map((d) => d.key);
    expect(keys).toContain("applyboard-assist");
    expect(keys).toContain("edvoy");
    expect(keys).toContain("ahz-associates");
    expect(keys).toContain("idp-education");
    expect(keys).toContain("marge");
    expect(SOURCE_ORG_DEFINITIONS.filter((d) => d.level === "L1_OFFICIAL").map((d) => d.key)).toContain("official-university");
  });
  it("MARGE is documented as URL-to-be-confirmed and not collectable", () => {
    const marge = SOURCE_ORG_DEFINITIONS.find((d) => d.key === "marge")!;
    expect(marge.baseUrl).toBeNull();
    expect(marge.collectable).toBe(false);
    expect(marge.permissionNote).toMatch(/to be confirmed/i);
  });
  it("resolves Level 2 platforms, official university domains and everything else", () => {
    const l2 = resolveSourceLevel("https://www.applyboard.com/programme/123", []);
    expect(l2).toMatchObject({ level: "L2_DISCOVERY", orgKey: "applyboard-assist" });
    const l1 = resolveSourceLevel("https://www.cardiff.ac.uk/course/123", ["www.cardiff.ac.uk"]);
    expect(l1).toMatchObject({ level: "L1_OFFICIAL", orgKey: "official-university" });
    const unknown = resolveSourceLevel("https://random.example.org/course", []);
    expect(unknown.level).toBe("L3_CREDIBLE");
    expect(unknown.orgKey).toBeNull();
  });
});

describe("conflict comparison (§3)", () => {
  it("normalises case and whitespace before comparing, keeping digits/currency intact", () => {
    expect(normaliseForComparison("  £21,500  per year ")).toBe("£21,500 per year");
    expect(normaliseForComparison("IELTS 6.5")).toBe("ielts 6.5");
    expect(normaliseForComparison("IELTS  6.5")).not.toBe(normaliseForComparison("ielts 6.0"));
  });
});

describe("duplicate detection heuristics (§8)", () => {
  it("strips noise words and unifies ampersand for name comparison", () => {
    expect(normaliseName("The University of Cardiff")).toBe(normaliseName("Cardiff University"));
    expect(normaliseName("RMIT & University")).not.toBe("");
  });
  it("same university name scores above threshold; different ones below", () => {
    const a = normaliseName("University of Birmingham");
    const b = normaliseName("Birmingham University");
    const c = normaliseName("Aston University");
    expect(similarity(a, b)).toBeGreaterThanOrEqual(0.82);
    expect(similarity(a, c)).toBeLessThan(0.82);
  });
});

describe("collector honesty (§2, §4)", () => {
  it("bounds original-wording excerpts", () => {
    const long = "x".repeat(2000);
    const e = excerpt(long);
    expect(e!.length).toBeLessThanOrEqual(600);
    expect(excerpt(null)).toBeNull();
    expect(excerpt("   ")).toBeNull();
  });
  it("unknown signal values stay unknown", () => {
    expect(normaliseSignalValue(null)).toBeNull();
    expect(normaliseSignalValue(undefined)).toBeNull();
    expect(normaliseSignalValue("   ")).toBeNull();
    expect(normaliseSignalValue(6.5)).toBe("6.5");
    expect(normaliseSignalValue("IELTS 6.5 overall")).toBe("IELTS 6.5 overall");
  });
  it("detects academic year strings and stores null when absent", () => {
    expect(detectAcademicYear("Entry for 2026/27 academic year")).toMatch(/2026\/27/);
    expect(detectAcademicYear("Apply now")).toBeNull();
  });
  it("finds an excerpt around a value only when the value really appears (never fabricates)", () => {
    const html = "<p>International tuition fee for 2026 entry is £24,500 per year.</p>";
    const ex = findWordingExcerpt(html, "£24,500");
    expect(ex).toContain("£24,500");
    expect(findWordingExcerpt(html, "£99,999")).toBeNull();
  });
  it("facts from official pages verify; discovery-platform facts always need an official check", () => {
    expect(statusForCollectedFact("L1_OFFICIAL")).toBe("OFFICIAL_SOURCE_VERIFIED");
    expect(statusForCollectedFact("L2_DISCOVERY")).toBe("SOURCE_CHECK_REQUIRED");
  });
});

describe("export with source attribution (§8)", () => {
  it("escapes commas, quotes and newlines in CSV cells", () => {
    const result: ExportResult = {
      generatedAt: "2026-11-27T00:00:00Z",
      rowCount: 1,
      rows: [
        {
          entityType: "course", entityId: "c1", label: 'MSc "Data" Science, Advanced', field: "tuitionFee",
          value: "£24,500 per year", intelligenceStatus: "OFFICIAL_SOURCE_VERIFIED", sourceLevel: "L1_OFFICIAL",
          sourceOrg: "official-university", sourceUrl: "https://example.ac.uk/fees", academicYear: "2026/27",
          lastCheckedAt: "2026-11-20T00:00:00Z", lastVerifiedAt: "2026-11-21T00:00:00Z", originalWording: "fee is £24,500",
        },
      ],
    };
    const csv = toCsv(result);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("intelligence_status");
    expect(lines[1]).toContain('"MSc ""Data"" Science, Advanced"');
    expect(lines[1]).toContain("OFFICIAL_SOURCE_VERIFIED");
  });
});

describe("publication gate covers the facts students see (§6, §8)", () => {
  it("the displayed-field list contains fees, deadlines and requirements", () => {
    for (const field of ["tuitionFee", "applicationDeadline", "englishRequirements", "academicEntryRequirements"]) {
      expect(DISPLAYED_FIELDS).toContain(field);
    }
  });
});
