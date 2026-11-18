/**
 * tests/lib/endorsements.test.ts — LinkedIn recommendations
 *
 * Truth policy: no demo/generated endorsements, only consented data, and
 * only linkedin.com URLs. These tests lock that contract down.
 */
import { describe, it, expect } from "vitest";
import {
  cleanText,
  endorsementsPayloadSchema,
  initialsFor,
  isLinkedInUrl,
  normalizeProfileUrl,
  parseStoredEndorsements,
  publicEndorsements,
  sanitizeEndorsement,
  serializeEndorsements,
  type LinkedInEndorsement,
} from "@/lib/endorsements";

const valid = {
  quote:
    "Al Aminn brought structure to our partnership pipeline and made every decision easier to defend.",
  name: "Ayesha Rahman",
  role: "Director, International Partnerships",
  organization: "Example University",
  linkedinUrl: "https://www.linkedin.com/in/ayesha-rahman",
  date: "2025-11",
  consented: true,
};

function item(overrides: Partial<LinkedInEndorsement> = {}): LinkedInEndorsement {
  return {
    id: overrides.id ?? "e1",
    quote: overrides.quote ?? valid.quote,
    name: overrides.name ?? valid.name,
    role: overrides.role ?? valid.role,
    organization: overrides.organization ?? valid.organization,
    linkedinUrl: overrides.linkedinUrl ?? valid.linkedinUrl,
    date: overrides.date ?? valid.date,
    consented: overrides.consented ?? true,
  };
}

describe("LinkedIn URL validation", () => {
  it("accepts https linkedin.com URLs only", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/in/al-aminn")).toBe(true);
    expect(isLinkedInUrl("https://linkedin.com/in/al-aminn")).toBe(true);
    expect(isLinkedInUrl("http://www.linkedin.com/in/al-aminn")).toBe(false);
    expect(isLinkedInUrl("https://linkedin.com.evil.example/in/al-aminn")).toBe(false);
    expect(isLinkedInUrl("https://example.com/linkedin.com")).toBe(false);
    expect(isLinkedInUrl("")).toBe(false);
  });

  it("normalises invalid profile URLs to an empty string", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/al-aminn")).toBe(
      "https://www.linkedin.com/in/al-aminn"
    );
    expect(normalizeProfileUrl("javascript:alert(1)")).toBe("");
    expect(normalizeProfileUrl("https://example.com")).toBe("");
  });
});

describe("endorsementSchema", () => {
  it("accepts a real, consented recommendation", () => {
    const result = endorsementsPayloadSchema.safeParse({
      profileUrl: "https://www.linkedin.com/in/al-aminn",
      items: [valid],
    });
    expect(result.success).toBe(true);
  });

  it("rejects quotes that are too short", () => {
    const result = endorsementsPayloadSchema.safeParse({
      profileUrl: "",
      items: [{ ...valid, quote: "Great work" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-LinkedIn item URLs and bad dates", () => {
    expect(
      endorsementsPayloadSchema.safeParse({
        profileUrl: "",
        items: [{ ...valid, linkedinUrl: "https://evil.example/phish" }],
      }).success
    ).toBe(false);
    expect(
      endorsementsPayloadSchema.safeParse({
        profileUrl: "",
        items: [{ ...valid, date: "November 2025" }],
      }).success
    ).toBe(false);
  });

  it("rejects more than the maximum number of items", () => {
    const items = Array.from({ length: 25 }, () => valid);
    expect(endorsementsPayloadSchema.safeParse({ profileUrl: "", items }).success).toBe(false);
  });
});

describe("sanitizeEndorsement", () => {
  it("trims text, strips control characters and keeps consent explicit", () => {
    const result = sanitizeEndorsement({
      ...valid,
      name: "  Ayesha\u0000 Rahman  ",
      quote: `  ${valid.quote}\u0007  `,
      consented: true,
    });
    expect(result.name).toBe("Ayesha Rahman");
    expect(result.quote).toBe(valid.quote);
    expect(result.consented).toBe(true);
    expect(result.id.length).toBeGreaterThan(0);
  });

  it("rejects a non-boolean consent value instead of guessing", () => {
    expect(() => sanitizeEndorsement({ ...valid, consented: "yes" })).toThrow();
  });

  it("cleanText caps length and collapses excessive newlines", () => {
    expect(cleanText("a\n\n\n\nb", 100)).toBe("a\n\nb");
    expect(cleanText("x".repeat(50), 10)).toHaveLength(10);
  });
});

describe("publicEndorsements — what may appear publicly", () => {
  it("never returns unconsented items", () => {
    const list = [item({ id: "1" }), item({ id: "2", consented: false })];
    const published = publicEndorsements(list);
    expect(published.map((i) => i.id)).toEqual(["1"]);
  });

  it("sorts newest first and puts undated items last", () => {
    const list = [
      item({ id: "old", date: "2024-01" }),
      item({ id: "none", date: "" }),
      item({ id: "new", date: "2026-03" }),
    ];
    expect(publicEndorsements(list).map((i) => i.id)).toEqual(["new", "old", "none"]);
  });

  it("caps the homepage list", () => {
    const list = Array.from({ length: 10 }, (_, i) => item({ id: String(i) }));
    expect(publicEndorsements(list)).toHaveLength(6);
    expect(publicEndorsements(list, 2)).toHaveLength(2);
  });
});

describe("parseStoredEndorsements — tolerant of corrupt data", () => {
  it("returns [] for malformed JSON", () => {
    expect(parseStoredEndorsements("{not json")).toEqual([]);
    expect(parseStoredEndorsements(null)).toEqual([]);
  });

  it("reads the {version, items} envelope and drops invalid rows", () => {
    const stored = JSON.stringify({
      version: 1,
      items: [valid, { quote: "too short", name: "X", role: "Y" }],
    });
    const parsed = parseStoredEndorsements(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Ayesha Rahman");
  });

  it("round-trips through serializeEndorsements", () => {
    const list = [item()];
    expect(parseStoredEndorsements(serializeEndorsements(list))).toEqual(list);
  });
});

describe("initialsFor", () => {
  it("builds 1–2 character initials", () => {
    expect(initialsFor("Ayesha Rahman")).toBe("AR");
    expect(initialsFor("Al Aminn")).toBe("AA");
    expect(initialsFor("Madonna")).toBe("MA");
    expect(initialsFor("   ")).toBe("—");
  });
});
