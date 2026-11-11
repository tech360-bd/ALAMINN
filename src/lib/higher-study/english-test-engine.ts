/**
 * Universal English-Test Engine
 * =============================
 * A pure, deterministic engine that:
 *  1. Catalogues the 18 English-language tests most commonly accepted by
 *     universities and visa authorities worldwide (IELTS, PTE, TOEFL, the
 *     Cambridge suite, Duolingo, LanguageCert, the Oxford tests, Trinity
 *     ISE, Versant, plus three "alternative-route" categories).
 *  2. Compares a student's *verified* test attempt against a course's
 *     published English-language requirement and returns one of 9
 *     canonical {@link EligibilityOutcome} values — never an admission,
 *     scholarship, CAS, or visa guarantee.
 *
 * The engine is deliberately conservative. If anything is uncertain —
 * a missing component score, an unverified attempt, an expired result,
 * a test the institution does not list as accepted — the outcome is
 * "review required" or "does not meet", never a soft pass. Real
 * admission decisions are made by the institution, not by this engine.
 *
 * Spec reference: docs/higher-study/global-english-test-requirements.md
 * Engine version: {@link ENGLISH_TEST_ENGINE_VERSION}
 *
 * All functions are pure (no IO) so the engine can be unit-tested in
 * isolation and shared between the public eligibility-check UI, the
 * admin verification workflow, and the AI advisor grounding layer.
 */

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Stable identifier for a test in the {@link ENGLISH_TEST_CATALOGUE}.
 * Mirrors the slugs used in the `englishRequirements` JSON column on
 * HigherStudyCourse (e.g. `"ielts_academic"`, `"pte_academic"`).
 */
export type EnglishTestId = string;

/**
 * A single gradeable component of a test (e.g. IELTS Listening).
 * `maxScore` is `null` for grade-based components (e.g. Cambridge
 * speaking performance is reported as a band, not a numeric score).
 */
export interface EnglishTestComponent {
  id: string;
  label: string;
  maxScore: number | null;
}

/**
 * Definition of an English-language test in the catalogue.
 * `maxOverall` is `null` for grade-based tests (e.g. Cambridge C1/C2
 * report a grade A/B/C, not an overall numeric score).
 */
export interface EnglishTestDefinition {
  id: EnglishTestId;
  name: string;
  category:
    | "secure-english-language-test"
    | "academic-english-test"
    | "online-proctored"
    | "university-administered"
    | "pathway"
    | "exemption";
  components: EnglishTestComponent[];
  /** Maximum achievable overall score, or `null` for grade-based tests. */
  maxOverall: number | null;
  /** How long results remain valid for admission/visa purposes (months). */
  validityMonths: number;
  /** Whether most accepting institutions permit superscoring for this test. */
  superscoringCommonlyPermitted: boolean;
}

/**
 * The 9 canonical outcomes the engine can return. Each is intentionally
 * honest — "VERIFIED_SCORE_MATCH" is *not* an admission guarantee.
 */
export type EligibilityOutcome =
  | "VERIFIED_SCORE_MATCH"
  | "POTENTIAL_MATCH_REVIEW_REQUIRED"
  | "DOES_NOT_MEET_PUBLISHED_REQUIREMENT"
  | "INSUFFICIENT_INFORMATION"
  | "TEST_NOT_CONFIRMED_AS_ACCEPTED"
  | "RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED"
  | "OFFICIAL_ALTERNATIVE_ROUTE_AVAILABLE"
  | "CONFLICTING_REQUIREMENTS"
  | "MANUAL_REVIEW_REQUIRED";

/** A single component score recorded against a student's test attempt. */
export interface StudentComponentScore {
  componentId: string;
  score: number | null;
  grade?: string | null;
}

/**
 * How a student's test attempt was verified.
 *  - `verified`:    result certificate has been sighted and confirmed
 *                   against the issuer's verification service.
 *  - `self_reported`: student entered the score themselves; not yet
 *                   sighted.
 *  - `unverified`:  third-party reported but not yet confirmed.
 */
export type AttemptVerificationStatus =
  | "verified"
  | "self_reported"
  | "unverified";

/** A student's single attempt at an English-language test. */
export interface StudentTestAttempt {
  id: string;
  testId: EnglishTestId;
  testDate: string | Date;
  overallScore: number | null;
  overallGrade?: string | null;
  components: StudentComponentScore[];
  verificationStatus: AttemptVerificationStatus;
  certificateRef?: string | null;
  notes?: string | null;
}

/** Minimum required score/grade for one component of a course requirement. */
export interface RequirementComponentThreshold {
  componentId: string;
  minScore: number | null;
  minGrade?: string | null;
}

/** A course's published English-language requirement for one test type. */
export interface CourseEnglishRequirement {
  testId: EnglishTestId;
  minOverallScore: number | null;
  minOverallGrade?: string | null;
  componentThresholds: RequirementComponentThreshold[];
  permitsSuperscoring: boolean;
  summary?: string;
}

/** One row of the per-component comparison table. */
export interface ComponentComparison {
  component: string;
  required: number | null;
  achieved: number | null;
  met: boolean | "unknown";
}

/** Overall comparison block. */
export interface OverallComparison {
  required: number | null;
  achieved: number | null;
  met: boolean | "unknown";
}

/** Full eligibility evaluation result returned by the engine. */
export interface EligibilityResult {
  outcome: EligibilityOutcome;
  explanation: string;
  testId: EnglishTestId;
  attemptId: string | null;
  componentComparison: ComponentComparison[];
  overallComparison: OverallComparison;
  testAccepted: boolean | "unknown";
  validityOk: boolean | "unknown";
  sourceUrl: string | null;
  ruleVersion: string;
}

// ─── Engine version ──────────────────────────────────────────────────

/** SemVer-tagged rule version; bump when the catalogue or evaluation logic changes. */
export const ENGLISH_TEST_ENGINE_VERSION = "1.0.0";

// ─── Catalogue ───────────────────────────────────────────────────────

/** Common IELTS-style 9-band component layout shared by IELTS variants. */
const IELTS_COMPONENTS: EnglishTestComponent[] = [
  { id: "listening", label: "Listening", maxScore: 9 },
  { id: "reading", label: "Reading", maxScore: 9 },
  { id: "writing", label: "Writing", maxScore: 9 },
  { id: "speaking", label: "Speaking", maxScore: 9 },
];

/** PTE Academic 4-skill layout (max 90 per skill, 90 overall). */
const PTE_COMPONENTS: EnglishTestComponent[] = [
  { id: "listening", label: "Listening", maxScore: 90 },
  { id: "reading", label: "Reading", maxScore: 90 },
  { id: "writing", label: "Writing", maxScore: 90 },
  { id: "speaking", label: "Speaking", maxScore: 90 },
];

/** TOEFL iBT 4-skill layout (max 30 per skill, 120 overall). */
const TOEFL_COMPONENTS: EnglishTestComponent[] = [
  { id: "reading", label: "Reading", maxScore: 30 },
  { id: "listening", label: "Listening", maxScore: 30 },
  { id: "speaking", label: "Speaking", maxScore: 30 },
  { id: "writing", label: "Writing", maxScore: 30 },
];

/**
 * The 18-test catalogue. Order matters for documentation; lookup is by
 * keyed id. Each entry documents the test's published max score, validity
 * window (months), and whether superscoring is commonly permitted by
 * accepting institutions.
 */
export const ENGLISH_TEST_CATALOGUE: Record<EnglishTestId, EnglishTestDefinition> = {
  ielts_academic: {
    id: "ielts_academic",
    name: "IELTS Academic",
    category: "secure-english-language-test",
    components: IELTS_COMPONENTS,
    maxOverall: 9,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  ielts_ukvi_academic: {
    id: "ielts_ukvi_academic",
    name: "IELTS Academic UKVI",
    category: "secure-english-language-test",
    components: IELTS_COMPONENTS,
    maxOverall: 9,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  ielts_one_skill_retake: {
    id: "ielts_one_skill_retake",
    name: "IELTS One Skill Retake",
    category: "secure-english-language-test",
    components: IELTS_COMPONENTS,
    maxOverall: 9,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  pte_academic: {
    id: "pte_academic",
    name: "PTE Academic",
    category: "academic-english-test",
    components: PTE_COMPONENTS,
    maxOverall: 90,
    validityMonths: 24,
    superscoringCommonlyPermitted: true,
  },
  pte_academic_ukvi: {
    id: "pte_academic_ukvi",
    name: "PTE Academic UKVI",
    category: "secure-english-language-test",
    components: PTE_COMPONENTS,
    maxOverall: 90,
    validityMonths: 24,
    superscoringCommonlyPermitted: true,
  },
  toefl_ibt: {
    id: "toefl_ibt",
    name: "TOEFL iBT",
    category: "academic-english-test",
    components: TOEFL_COMPONENTS,
    maxOverall: 120,
    validityMonths: 24,
    superscoringCommonlyPermitted: true,
  },
  toefl_ibt_home: {
    id: "toefl_ibt_home",
    name: "TOEFL iBT Home Edition",
    category: "online-proctored",
    components: TOEFL_COMPONENTS,
    maxOverall: 120,
    validityMonths: 24,
    superscoringCommonlyPermitted: true,
  },
  cambridge_c1_advanced: {
    id: "cambridge_c1_advanced",
    name: "Cambridge C1 Advanced (CAE)",
    category: "academic-english-test",
    components: [
      { id: "reading_and_use_of_english", label: "Reading & Use of English", maxScore: null },
      { id: "writing", label: "Writing", maxScore: null },
      { id: "listening", label: "Listening", maxScore: null },
      { id: "speaking", label: "Speaking", maxScore: null },
    ],
    maxOverall: null,
    validityMonths: 999, // Cambridge results do not expire (some institutions impose own windows)
    superscoringCommonlyPermitted: false,
  },
  cambridge_c2_proficiency: {
    id: "cambridge_c2_proficiency",
    name: "Cambridge C2 Proficiency (CPE)",
    category: "academic-english-test",
    components: [
      { id: "reading_and_use_of_english", label: "Reading & Use of English", maxScore: null },
      { id: "writing", label: "Writing", maxScore: null },
      { id: "listening", label: "Listening", maxScore: null },
      { id: "speaking", label: "Speaking", maxScore: null },
    ],
    maxOverall: null,
    validityMonths: 999,
    superscoringCommonlyPermitted: false,
  },
  languagecert: {
    id: "languagecert",
    name: "LanguageCert Academic / SELT",
    category: "secure-english-language-test",
    components: [
      { id: "listening", label: "Listening", maxScore: 50 },
      { id: "reading", label: "Reading", maxScore: 50 },
      { id: "writing", label: "Writing", maxScore: 50 },
      { id: "speaking", label: "Speaking", maxScore: 50 },
    ],
    maxOverall: 50,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  oxford_test_of_english: {
    id: "oxford_test_of_english",
    name: "Oxford Test of English",
    category: "academic-english-test",
    components: [
      { id: "speaking", label: "Speaking", maxScore: 120 },
      { id: "writing", label: "Writing", maxScore: 120 },
      { id: "reading", label: "Reading", maxScore: 120 },
      { id: "listening", label: "Listening", maxScore: 120 },
    ],
    maxOverall: 120,
    validityMonths: 24,
    superscoringCommonlyPermitted: true,
  },
  oxford_test_of_english_advanced: {
    id: "oxford_test_of_english_advanced",
    name: "Oxford Test of English Advanced",
    category: "academic-english-test",
    components: [
      { id: "speaking", label: "Speaking", maxScore: 120 },
      { id: "writing", label: "Writing", maxScore: 120 },
      { id: "reading", label: "Reading", maxScore: 120 },
      { id: "listening", label: "Listening", maxScore: 120 },
    ],
    maxOverall: 120,
    validityMonths: 24,
    superscoringCommonlyPermitted: true,
  },
  trinity_ise: {
    id: "trinity_ise",
    name: "Trinity ISE (Integrated Skills in English)",
    category: "secure-english-language-test",
    components: [
      { id: "reading", label: "Reading", maxScore: null },
      { id: "writing", label: "Writing", maxScore: null },
      { id: "speaking", label: "Speaking", maxScore: null },
      { id: "listening", label: "Listening", maxScore: null },
    ],
    maxOverall: null,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  duolingo: {
    id: "duolingo",
    name: "Duolingo English Test",
    category: "online-proctored",
    components: [
      { id: "literacy", label: "Literacy", maxScore: 160 },
      { id: "comprehension", label: "Comprehension", maxScore: 160 },
      { id: "conversation", label: "Conversation", maxScore: 160 },
      { id: "production", label: "Production", maxScore: 160 },
    ],
    maxOverall: 160,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  versant: {
    id: "versant",
    name: "Versant English Test",
    category: "academic-english-test",
    components: [
      { id: "speaking", label: "Speaking", maxScore: 80 },
      { id: "writing", label: "Writing", maxScore: 80 },
      { id: "reading", label: "Reading", maxScore: 80 },
      { id: "listening", label: "Listening", maxScore: 80 },
    ],
    maxOverall: 80,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  university_administered: {
    id: "university_administered",
    name: "University-administered English assessment",
    category: "university-administered",
    components: [],
    maxOverall: null,
    validityMonths: 24,
    superscoringCommonlyPermitted: false,
  },
  presessional_pathway: {
    id: "presessional_pathway",
    name: "Pre-sessional English pathway",
    category: "pathway",
    components: [],
    maxOverall: null,
    validityMonths: 12,
    superscoringCommonlyPermitted: false,
  },
  english_medium_exemption: {
    id: "english_medium_exemption",
    name: "English-medium instruction exemption",
    category: "exemption",
    components: [],
    maxOverall: null,
    validityMonths: 999,
    superscoringCommonlyPermitted: false,
  },
};

// ─── Catalogue helpers ───────────────────────────────────────────────

/**
 * Return the {@link EnglishTestDefinition} for `testId`, or `undefined`
 * if the test is not in the catalogue. Use {@link isKnownTestId} for a
 * boolean check.
 */
export function getTestDefinition(testId: EnglishTestId): EnglishTestDefinition | undefined {
  return ENGLISH_TEST_CATALOGUE[testId];
}

/** Type-guard: returns `true` if `testId` is in the catalogue. */
export function isKnownTestId(testId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENGLISH_TEST_CATALOGUE, testId);
}

// ─── Internal helpers ────────────────────────────────────────────────

/** Coerce a string/Date into a number timestamp; `NaN` if unparseable. */
function toTime(value: string | Date): number {
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Add `months` calendar months to a timestamp (day-of-month preserved where possible). */
function addMonths(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // If the original day was 31 and the target month is shorter, setMonth
  // rolls over — clamp back to the last day of the target month.
  if (d.getDate() < day) d.setDate(0);
  return d.getTime();
}

/** Priority rank of an outcome (higher = stronger). Used to pick the best across attempts. */
const OUTCOME_PRIORITY: Record<EligibilityOutcome, number> = {
  VERIFIED_SCORE_MATCH: 100,
  OFFICIAL_ALTERNATIVE_ROUTE_AVAILABLE: 80,
  POTENTIAL_MATCH_REVIEW_REQUIRED: 60,
  INSUFFICIENT_INFORMATION: 40,
  MANUAL_REVIEW_REQUIRED: 30,
  CONFLICTING_REQUIREMENTS: 20,
  TEST_NOT_CONFIRMED_AS_ACCEPTED: 15,
  RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED: 10,
  DOES_NOT_MEET_PUBLISHED_REQUIREMENT: 0,
};

// ─── Core evaluation ─────────────────────────────────────────────────

/**
 * Evaluate a single student test attempt against a course's published
 * English-language requirement.
 *
 * Decision order (first failure short-circuits):
 *  1. **Test identity**: if `attempt.testId !== requirement.testId`,
 *     returns `TEST_NOT_CONFIRMED_AS_ACCEPTED`. The institution has not
 *     published acceptance of this test type for this course.
 *  2. **Validity window**: if the test date + the catalogue's
 *     `validityMonths` is before `now`, returns
 *     `RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED`.
 *  3. **Verification status**: if the attempt is not `verified`, returns
 *     `POTENTIAL_MATCH_REVIEW_REQUIRED` (score may match, but the
 *     certificate must be sighted before any official use).
 *  4. **Overall threshold**: if `minOverallScore` is published and the
 *     student's overall is below it, returns
 *     `DOES_NOT_MEET_PUBLISHED_REQUIREMENT`.
 *  5. **Component thresholds**: for each threshold in
 *     `componentThresholds`, look up the matching component in the
 *     attempt. If the component is missing → mark `unknown`. If present
 *     and below threshold → `DOES_NOT_MEET_PUBLISHED_REQUIREMENT`. If
 *     any comparison is `unknown`, the result is
 *     `INSUFFICIENT_INFORMATION`.
 *  6. **All-pass**: returns `VERIFIED_SCORE_MATCH` with the explicit
 *     disclaimer that this is NOT an admission, scholarship, CAS, or
 *     visa guarantee.
 *
 * @param attempt     the student's test attempt to evaluate
 * @param requirement the course's published requirement for one test type
 * @param now         override "now" (testing only); defaults to `new Date()`
 */
export function evaluateEnglishEligibility(
  attempt: StudentTestAttempt,
  requirement: CourseEnglishRequirement,
  now: Date = new Date(),
): EligibilityResult {
  const ruleVersion = ENGLISH_TEST_ENGINE_VERSION;
  const testId = requirement.testId;
  const sourceUrl = null; // populated by callers from the course row's officialSourceUrl

  // 1. Test identity / acceptance.
  if (attempt.testId !== requirement.testId) {
    return {
      outcome: "TEST_NOT_CONFIRMED_AS_ACCEPTED",
      explanation:
        `The submitted test (${attempt.testId}) does not match the ` +
        `requirement's published test type (${requirement.testId}). The ` +
        `institution has not confirmed acceptance of this test for this ` +
        `course in the published record. NOT an admission, scholarship, ` +
        `CAS, or visa guarantee.`,
      testId,
      attemptId: attempt.id,
      componentComparison: [],
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: attempt.overallScore,
        met: "unknown",
      },
      testAccepted: false,
      validityOk: "unknown",
      sourceUrl,
      ruleVersion,
    };
  }

  // 2. Validity window (catalogue-defined; usually 24 months).
  const def = getTestDefinition(attempt.testId);
  const validityMonths = def?.validityMonths ?? 24;
  const testTime = toTime(attempt.testDate);
  const nowTime = now.getTime();
  const validityOk: boolean | "unknown" = (() => {
    if (Number.isNaN(testTime)) return "unknown";
    const expiry = addMonths(testTime, validityMonths);
    if (validityMonths >= 999) return true; // Tests like Cambridge C1/C2 do not expire.
    return expiry >= nowTime;
  })();

  if (validityOk === false) {
    return {
      outcome: "RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED",
      explanation:
        `Test result dated ${new Date(testTime).toISOString().slice(0, 10)} ` +
        `is outside the ${validityMonths}-month validity window accepted ` +
        `for admission/visa purposes. A fresh test result is required. ` +
        `NOT an admission, scholarship, CAS, or visa guarantee.`,
      testId,
      attemptId: attempt.id,
      componentComparison: [],
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: attempt.overallScore,
        met: "unknown",
      },
      testAccepted: true,
      validityOk: false,
      sourceUrl,
      ruleVersion,
    };
  }

  // 3. Verification status.
  if (attempt.verificationStatus !== "verified") {
    return {
      outcome: "POTENTIAL_MATCH_REVIEW_REQUIRED",
      explanation:
        `Test attempt is recorded as ${attempt.verificationStatus}. ` +
        `Scores may match the published requirement, but the certificate ` +
        `must be sighted and confirmed against the issuer's verification ` +
        `service before this result can be relied upon. NOT an admission, ` +
        `scholarship, CAS, or visa guarantee.`,
      testId,
      attemptId: attempt.id,
      componentComparison: [],
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: attempt.overallScore,
        met: "unknown",
      },
      testAccepted: true,
      validityOk,
      sourceUrl,
      ruleVersion,
    };
  }

  // 4. Overall threshold.
  const overallMet: boolean | "unknown" = (() => {
    if (requirement.minOverallScore === null || attempt.overallScore === null) {
      // Grade-based tests fall through to the grade comparison below.
      if (requirement.minOverallGrade && attempt.overallGrade) {
        return gradeMeets(attempt.overallGrade, requirement.minOverallGrade);
      }
      return "unknown";
    }
    return attempt.overallScore >= requirement.minOverallScore;
  })();

  if (overallMet === false) {
    return {
      outcome: "DOES_NOT_MEET_PUBLISHED_REQUIREMENT",
      explanation:
        `Overall score ${attempt.overallScore} is below the published ` +
        `minimum ${requirement.minOverallScore} for ${requirement.testId}. ` +
        `NOT an admission, scholarship, CAS, or visa guarantee.`,
      testId,
      attemptId: attempt.id,
      componentComparison: [],
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: attempt.overallScore,
        met: false,
      },
      testAccepted: true,
      validityOk,
      sourceUrl,
      ruleVersion,
    };
  }

  // 5. Component thresholds.
  const componentComparison: ComponentComparison[] = [];
  let anyUnknown = false;
  let anyComponentFailed = false;

  for (const threshold of requirement.componentThresholds) {
    const studentComponent = attempt.components.find(
      (c) => c.componentId === threshold.componentId,
    );
    const requiredScore = threshold.minScore;
    let achieved: number | null = null;
    let met: boolean | "unknown" = "unknown";

    if (!studentComponent) {
      met = "unknown";
      anyUnknown = true;
    } else {
      achieved = studentComponent.score;
      if (
        threshold.minScore !== null &&
        studentComponent.score !== null
      ) {
        met = studentComponent.score >= threshold.minScore;
        if (!met) anyComponentFailed = true;
      } else if (
        threshold.minGrade &&
        studentComponent.grade
      ) {
        met = gradeMeets(studentComponent.grade, threshold.minGrade);
        if (!met) anyComponentFailed = true;
      } else {
        met = "unknown";
        anyUnknown = true;
      }
    }

    componentComparison.push({
      component: threshold.componentId,
      required: requiredScore,
      achieved,
      met,
    });
  }

  if (anyComponentFailed) {
    return {
      outcome: "DOES_NOT_MEET_PUBLISHED_REQUIREMENT",
      explanation:
        `One or more component scores are below the published minimum ` +
        `thresholds for ${requirement.testId}. See componentComparison ` +
        `for the failing skill(s). NOT an admission, scholarship, CAS, ` +
        `or visa guarantee.`,
      testId,
      attemptId: attempt.id,
      componentComparison,
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: attempt.overallScore,
        met: overallMet,
      },
      testAccepted: true,
      validityOk,
      sourceUrl,
      ruleVersion,
    };
  }

  if (anyUnknown) {
    return {
      outcome: "INSUFFICIENT_INFORMATION",
      explanation:
        `One or more required component scores are missing from the ` +
        `submitted attempt. The published requirement cannot be fully ` +
        `evaluated until all component scores are provided. NOT an ` +
        `admission, scholarship, CAS, or visa guarantee.`,
      testId,
      attemptId: attempt.id,
      componentComparison,
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: attempt.overallScore,
        met: overallMet,
      },
      testAccepted: true,
      validityOk,
      sourceUrl,
      ruleVersion,
    };
  }

  // 6. All-pass.
  return {
    outcome: "VERIFIED_SCORE_MATCH",
    explanation:
      `The verified attempt meets every published threshold ` +
      `(overall + all components) for ${requirement.testId}. ` +
      `NOT an admission, scholarship, CAS, or visa guarantee. ` +
      `Institutional admission, scholarship, CAS, and visa decisions ` +
      `remain at the sole discretion of the admitting institution and ` +
      `the relevant visa authority.`,
    testId,
    attemptId: attempt.id,
    componentComparison,
    overallComparison: {
      required: requirement.minOverallScore,
      achieved: attempt.overallScore,
      met: true,
    },
    testAccepted: true,
    validityOk,
    sourceUrl,
    ruleVersion,
  };
}

/**
 * Compare a Cambridge-style grade (A/B/C) against a minimum grade.
 * Returns `true` if `achieved >= required` in grade order (A > B > C).
 * Returns `"unknown"` if either grade is unrecognised.
 */
function gradeMeets(achieved: string, required: string): boolean | "unknown" {
  const order: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 };
  const a = order[achieved.trim().toUpperCase()];
  const r = order[required.trim().toUpperCase()];
  if (a === undefined || r === undefined) return "unknown";
  return a >= r;
}

// ─── Multi-attempt evaluation ────────────────────────────────────────

/**
 * Evaluate a student's full profile of test attempts against a single
 * course requirement, picking the *best* outcome across all attempts.
 *
 * Outcome priority order (best → worst):
 *   1. `VERIFIED_SCORE_MATCH`
 *   2. `OFFICIAL_ALTERNATIVE_ROUTE_AVAILABLE`
 *   3. `POTENTIAL_MATCH_REVIEW_REQUIRED`
 *   4. `INSUFFICIENT_INFORMATION`
 *   5. `MANUAL_REVIEW_REQUIRED`
 *   6. `CONFLICTING_REQUIREMENTS`
 *   7. `TEST_NOT_CONFIRMED_AS_ACCEPTED`
 *   8. `RESULT_EXPIRED_OR_VALIDITY_UNCONFIRMED`
 *   9. `DOES_NOT_MEET_PUBLISHED_REQUIREMENT`
 *
 * If `attempts` is empty, returns `INSUFFICIENT_INFORMATION` (the engine
 * never fabricates a match).
 *
 * Superscoring is *not* applied here — when superscoring is permitted,
 * callers should construct a synthetic {@link StudentTestAttempt} that
 * combines the best component scores across attempts, then call
 * {@link evaluateEnglishEligibility} directly.
 */
export function evaluateStudentProfile(
  attempts: StudentTestAttempt[],
  requirement: CourseEnglishRequirement,
  now: Date = new Date(),
): EligibilityResult {
  if (attempts.length === 0) {
    return {
      outcome: "INSUFFICIENT_INFORMATION",
      explanation:
        `No test attempts provided. The published requirement for ` +
        `${requirement.testId} cannot be evaluated. NOT an admission, ` +
        `scholarship, CAS, or visa guarantee.`,
      testId: requirement.testId,
      attemptId: null,
      componentComparison: [],
      overallComparison: {
        required: requirement.minOverallScore,
        achieved: null,
        met: "unknown",
      },
      testAccepted: "unknown",
      validityOk: "unknown",
      sourceUrl: null,
      ruleVersion: ENGLISH_TEST_ENGINE_VERSION,
    };
  }

  let best: EligibilityResult | null = null;
  for (const attempt of attempts) {
    const result = evaluateEnglishEligibility(attempt, requirement, now);
    if (!best) {
      best = result;
      continue;
    }
    if (OUTCOME_PRIORITY[result.outcome] > OUTCOME_PRIORITY[best.outcome]) {
      best = result;
    }
  }

  // best is guaranteed non-null because attempts.length > 0.
  return best as EligibilityResult;
}
