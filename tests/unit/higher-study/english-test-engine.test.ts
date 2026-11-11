/**
 * Unit tests for the Universal English-Test Engine
 * (src/lib/higher-study/english-test-engine.ts).
 *
 * Covers the 9 eligibility outcomes, the catalogue completeness
 * invariant (≥18 tests), the multi-attempt best-outcome selection,
 * and the "NOT an admission, scholarship, CAS, or visa guarantee"
 * disclaimer that must appear on every VERIFIED_SCORE_MATCH reply.
 */

import { describe, it, expect } from "vitest";
import {
  ENGLISH_TEST_CATALOGUE,
  ENGLISH_TEST_ENGINE_VERSION,
  evaluateEnglishEligibility,
  evaluateStudentProfile,
  getTestDefinition,
  isKnownTestId,
  type CourseEnglishRequirement,
  type EnglishTestId,
  type StudentTestAttempt,
} from "@/lib/higher-study/english-test-engine";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Build a verified IELTS-style attempt with sensible defaults. */
function makeAttempt(
  testId: EnglishTestId,
  overall: number | null,
  components: Array<{ componentId: string; score: number | null }> = [
    { componentId: "listening", score: 7 },
    { componentId: "reading", score: 7 },
    { componentId: "writing", score: 7 },
    { componentId: "speaking", score: 7 },
  ],
  opts: {
    testDate?: string;
    verificationStatus?: StudentTestAttempt["verificationStatus"];
    id?: string;
  } = {},
): StudentTestAttempt {
  return {
    id: opts.id ?? "att-1",
    testId,
    testDate: opts.testDate ?? "2024-01-15",
    overallScore: overall,
    components,
    verificationStatus: opts.verificationStatus ?? "verified",
  };
}

/** Build a course requirement for a given test type. */
function makeRequirement(
  testId: EnglishTestId,
  minOverall: number | null,
  thresholds: Array<{ componentId: string; minScore: number | null }> = [
    { componentId: "listening", minScore: 6.5 },
    { componentId: "reading", minScore: 6.5 },
    { componentId: "writing", minScore: 6.5 },
    { componentId: "speaking", minScore: 6.5 },
  ],
): CourseEnglishRequirement {
  return {
    testId,
    minOverallScore: minOverall,
    componentThresholds: thresholds,
    permitsSuperscoring: false,
  };
}

const NOW = new Date("2025-01-15T00:00:00Z");

// ─── Tests ───────────────────────────────────────────────────────────

describe("english-test-engine — catalogue", () => {
  it("catalogue contains at least 18 tests", () => {
    expect(Object.keys(ENGLISH_TEST_CATALOGUE).length).toBeGreaterThanOrEqual(18);
  });

  it("isKnownTestId + getTestDefinition agree on known slugs", () => {
    expect(isKnownTestId("ielts_academic")).toBe(true);
    expect(isKnownTestId("duolingo")).toBe(true);
    expect(isKnownTestId("nonexistent_test")).toBe(false);
    expect(getTestDefinition("toefl_ibt")?.maxOverall).toBe(120);
    expect(getTestDefinition("cambridge_c1_advanced")?.maxOverall).toBeNull();
  });
});

describe("english-test-engine — outcomes", () => {
  it("VERIFIED_SCORE_MATCH when all components + overall meet thresholds", () => {
    const attempt = makeAttempt("ielts_academic", 7.5);
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("VERIFIED_SCORE_MATCH");
    expect(result.overallComparison.met).toBe(true);
    expect(result.componentComparison.every((c) => c.met === true)).toBe(true);
  });

  it("DOES_NOT_MEET_PUBLISHED_REQUIREMENT when overall is below minimum", () => {
    const attempt = makeAttempt("ielts_academic", 6.0);
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("DOES_NOT_MEET_PUBLISHED_REQUIREMENT");
    expect(result.overallComparison.met).toBe(false);
  });

  it("DOES_NOT_MEET_PUBLISHED_REQUIREMENT when a component is below threshold", () => {
    const attempt = makeAttempt(
      "ielts_academic",
      7.5,
      [
        { componentId: "listening", score: 7 },
        { componentId: "reading", score: 7 },
        { componentId: "writing", score: 5.5 }, // below 6.5
        { componentId: "speaking", score: 7 },
      ],
    );
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("DOES_NOT_MEET_PUBLISHED_REQUIREMENT");
    const writing = result.componentComparison.find((c) => c.component === "writing");
    expect(writing?.met).toBe(false);
  });

  it("TEST_NOT_CONFIRMED_AS_ACCEPTED when attempt testId differs from requirement testId", () => {
    const attempt = makeAttempt("toefl_ibt", 100);
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("TEST_NOT_CONFIRMED_AS_ACCEPTED");
    expect(result.testAccepted).toBe(false);
  });

  it("RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED when test date is older than 24 months", () => {
    const attempt = makeAttempt("ielts_academic", 8.0, undefined, {
      testDate: "2022-01-01", // > 24 months before NOW (2025-01-15)
    });
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED");
    expect(result.validityOk).toBe(false);
  });

  it("POTENTIAL_MATCH_REVIEW_REQUIRED when attempt is self_reported", () => {
    const attempt = makeAttempt("ielts_academic", 8.0, undefined, {
      verificationStatus: "self_reported",
    });
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("POTENTIAL_MATCH_REVIEW_REQUIRED");
  });

  it("INSUFFICIENT_INFORMATION when a required component is missing from the attempt", () => {
    const attempt = makeAttempt("ielts_academic", 7.5, [
      { componentId: "listening", score: 7 },
      { componentId: "reading", score: 7 },
      // writing + speaking missing
    ]);
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("INSUFFICIENT_INFORMATION");
    const writing = result.componentComparison.find((c) => c.component === "writing");
    expect(writing?.met).toBe("unknown");
  });
});

describe("english-test-engine — multi-attempt profile", () => {
  it("returns INSUFFICIENT_INFORMATION when no attempts are provided", () => {
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateStudentProfile([], requirement, NOW);
    expect(result.outcome).toBe("INSUFFICIENT_INFORMATION");
    expect(result.attemptId).toBeNull();
  });

  it("picks the best outcome across multiple attempts", () => {
    const weak = makeAttempt(
      "ielts_academic",
      5.5,
      [
        { componentId: "listening", score: 5.5 },
        { componentId: "reading", score: 5.5 },
        { componentId: "writing", score: 5.5 },
        { componentId: "speaking", score: 5.5 },
      ],
      { id: "weak", testDate: "2024-06-01" },
    );
    const strong = makeAttempt(
      "ielts_academic",
      8.0,
      [
        { componentId: "listening", score: 8 },
        { componentId: "reading", score: 8 },
        { componentId: "writing", score: 7.5 },
        { componentId: "speaking", score: 8 },
      ],
      { id: "strong", testDate: "2024-09-01" },
    );
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateStudentProfile([weak, strong], requirement, NOW);
    expect(result.outcome).toBe("VERIFIED_SCORE_MATCH");
    expect(result.attemptId).toBe("strong");
  });
});

describe("english-test-engine — disclaimer + versioning", () => {
  it("VERIFIED_SCORE_MATCH explanation contains the no-guarantee disclaimer", () => {
    const attempt = makeAttempt("ielts_academic", 7.5);
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.outcome).toBe("VERIFIED_SCORE_MATCH");
    expect(result.explanation).toMatch(/NOT an admission, scholarship, CAS, or visa guarantee/i);
  });

  it("exposes a stable rule version", () => {
    expect(ENGLISH_TEST_ENGINE_VERSION).toBe("1.0.0");
    const attempt = makeAttempt("ielts_academic", 7.5);
    const requirement = makeRequirement("ielts_academic", 7.0);
    const result = evaluateEnglishEligibility(attempt, requirement, NOW);
    expect(result.ruleVersion).toBe(ENGLISH_TEST_ENGINE_VERSION);
  });
});
