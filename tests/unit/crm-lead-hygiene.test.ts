/**
 * tests/unit/crm-lead-hygiene.test.ts — contact hygiene foundation
 *
 * Covers the two P0 CRM-foundation capabilities introduced in
 * src/lib/crm/lead-hygiene.ts:
 *   1. Deterministic contact-level lead scoring (scoreContact) — same input
 *      always yields the same score/grade/signals; positive-only; capped.
 *   2. Duplicate detection (findDuplicateContacts + normalization helpers)
 *      — normalized email exact match and normalized phone (last 10 digits)
 *      match, with exclusion and false-positive confirmation.
 *   3. recomputeContactScore — persists score/grade/signals onto the record.
 *
 * Pure in-memory stubs stand in for the database layer; no live server or
 * database is required (mirrors the repo's unit-test conventions).
 */
import { describe, it, expect } from "vitest";
import {
  scoreContact,
  normalizePhoneForMatch,
  normalizeEmailForMatch,
  findDuplicateContacts,
  recomputeContactScore,
  type ContactDuplicateLookup,
  type ContactScoreDb,
} from "@/lib/crm/lead-hygiene";

// ─── scoreContact ────────────────────────────────────────────────────────────

describe("scoreContact (deterministic contact scoring)", () => {
  const base = {
    hasEmail: true,
    hasPhone: false,
    hasWhatsapp: false,
    preferredChannel: null,
    hasSource: false,
    hasOrganization: false,
    inquiryCount: 0,
    opportunityCount: 0,
    hasActiveOpportunity: false,
  };

  it("scores a bare email-only contact at 5 (grade F)", () => {
    const r = scoreContact(base);
    expect(r.score).toBe(5);
    expect(r.grade).toBe("F");
    expect(r.signals).toEqual(["email_reachable"]);
    expect(r.explanation).toContain("5");
    expect(r.explanation).toContain("F");
  });

  it("returns the same result for the same input (deterministic)", () => {
    const input = { ...base, hasPhone: true, hasWhatsapp: true, preferredChannel: "whatsapp", inquiryCount: 1 };
    expect(scoreContact(input)).toEqual(scoreContact(input));
  });

  it("accumulates positive-only signals and caps at 100", () => {
    const r = scoreContact({
      ...base,
      hasPhone: true,
      hasWhatsapp: true,
      preferredChannel: "whatsapp",
      hasSource: true,
      hasOrganization: true,
      inquiryCount: 5, // capped at 2 × 10
      opportunityCount: 3,
      hasActiveOpportunity: true,
    });
    // 5 + 15 + 10 + 10 + 5 + 5 + 20(capped) + 15 + 10 = 95
    expect(r.score).toBe(95);
    expect(r.grade).toBe("A");
  });

  it("maps boundary scores to grade bands (75/55/35/15)", () => {
    // 75 = email + phone + whatsapp + channel:whatsapp + source + org + opportunity + active
    expect(scoreContact({
      ...base, hasPhone: true, hasWhatsapp: true, preferredChannel: "whatsapp",
      hasSource: true, hasOrganization: true, opportunityCount: 1, hasActiveOpportunity: true,
    }).grade).toBe("A");
    // 55 = email + phone + whatsapp + channel:whatsapp + source + org + inquiry
    expect(scoreContact({
      ...base, hasPhone: true, hasWhatsapp: true, preferredChannel: "whatsapp",
      hasSource: true, hasOrganization: true, inquiryCount: 1,
    }).grade).toBe("B");
    // 35 = email + phone + whatsapp + channel:phone
    expect(scoreContact({
      ...base, hasPhone: true, hasWhatsapp: true, preferredChannel: "phone",
    }).grade).toBe("C");
    // 15 = email + whatsapp
    expect(scoreContact({ ...base, hasWhatsapp: true }).grade).toBe("D");
  });

  it("never scores below zero and lists every contributing signal", () => {
    const r = scoreContact({ ...base, preferredChannel: "email", inquiryCount: 0 });
    expect(r.score).toBe(7); // 5 email + 2 channel:email
    expect(r.signals).toEqual(["email_reachable", "channel_email"]);
  });
});

// ─── normalization helpers ──────────────────────────────────────────────────

describe("normalizePhoneForMatch", () => {
  it("returns null for null/empty/blank/non-numeric input", () => {
    expect(normalizePhoneForMatch(null)).toBeNull();
    expect(normalizePhoneForMatch(undefined)).toBeNull();
    expect(normalizePhoneForMatch("")).toBeNull();
    expect(normalizePhoneForMatch("   ")).toBeNull();
    expect(normalizePhoneForMatch("no-digits")).toBeNull();
  });

  it("strips separators and keeps the last 10 digits", () => {
    expect(normalizePhoneForMatch("+880 1716-609554")).toBe("1716609554");
    expect(normalizePhoneForMatch("01716609554")).toBe("1716609554");
  });

  it("keeps shorter digit strings whole", () => {
    expect(normalizePhoneForMatch("9554")).toBe("9554");
  });
});

describe("normalizeEmailForMatch", () => {
  it("trims, lowercases and rejects blank input", () => {
    expect(normalizeEmailForMatch("  Al.Aminn@Example.COM ")).toBe("al.aminn@example.com");
    expect(normalizeEmailForMatch(null)).toBeNull();
    expect(normalizeEmailForMatch("   ")).toBeNull();
  });
});

// ─── findDuplicateContacts ───────────────────────────────────────────────────

interface Row { id: string; fullName: string; email: string; phone: string | null }

function stubLookup(rows: Row[]): ContactDuplicateLookup & { calls: number } {
  const calls = { n: 0 };
  return {
    calls: 0,
    contact: {
      async findMany(args: Parameters<ContactDuplicateLookup["contact"]["findMany"]>[0]) {
        calls.n += 1;
        const where = args?.where ?? {};
        return rows.filter((row) => {
          if (where.id?.not && row.id === where.id.not) return false;
          if (where.email && row.email !== where.email) return false;
          if (where.phone?.endsWith && !(row.phone ?? "").endsWith(where.phone.endsWith)) return false;
          return true;
        });
      },
    },
    get calls() { return calls.n; },
  } as ContactDuplicateLookup & { calls: number };
}

describe("findDuplicateContacts", () => {
  const rows: Row[] = [
    { id: "c1", fullName: "Al Aminn", email: "al@example.com", phone: "+880 1716-609554" },
    { id: "c2", fullName: "A Aminn", email: "other@example.com", phone: "01716609554" },
    { id: "c3", fullName: "Unrelated", email: "x@example.com", phone: "+880 1911-000999" },
    { id: "c4", fullName: "Suffix Trap", email: "y@example.com", phone: "999-609554" },
  ];

  it("finds an exact normalized email match", async () => {
    const out = await findDuplicateContacts(stubLookup(rows), { email: "AL@Example.com " });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "c1", matchOn: ["email"] });
  });

  it("finds phone matches across formats via the digit-key rule and drops false positives", async () => {
    const out = await findDuplicateContacts(stubLookup(rows), { phone: "01716609554" });
    const ids = out.map((m) => m.id).sort();
    expect(ids).toEqual(["c1", "c2"]); // formatted + plain both match
    // c4 shares only the last 6 digits, not the full 10-digit key → excluded
    expect(ids).not.toContain("c4");
    for (const m of out) expect(m.matchOn).toEqual(["phone"]);
  });

  it("merges email and phone hits on the same row into one match with both reasons", async () => {
    const out = await findDuplicateContacts(stubLookup(rows), { email: "al@example.com", phone: "+880 1716-609554" });
    const c1 = out.find((m) => m.id === "c1");
    expect(c1?.matchOn).toEqual(["email", "phone"]);
  });

  it("honors excludeId (used on update)", async () => {
    const out = await findDuplicateContacts(stubLookup(rows), { email: "al@example.com", excludeId: "c1" });
    expect(out.find((m) => m.id === "c1")).toBeUndefined();
  });

  it("short phone keys compare on the whole key", async () => {
    const out = await findDuplicateContacts(stubLookup([{ id: "c9", fullName: "S", email: "s@s.com", phone: "9554" }]), { phone: "9-5-54" });
    expect(out.map((m) => m.id)).toEqual(["c9"]);
  });

  it("returns [] without a query when no criteria are given", async () => {
    const lookup = stubLookup(rows);
    const out = await findDuplicateContacts(lookup, {});
    expect(out).toEqual([]);
    expect(lookup.calls).toBe(0);
  });
});

// ─── recomputeContactScore ──────────────────────────────────────────────────

describe("recomputeContactScore", () => {
  function stubDb(contact: Row | null, counts: { inquiry: number; opportunity: number; active: boolean; stages?: string[] }): ContactScoreDb & { updates: Array<Record<string, unknown>> } {
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      updates,
      contact: {
        async findUnique() { return contact; },
        async update(args: { data: Record<string, unknown> }) { updates.push(args.data); return { ...contact, ...args.data }; },
      },
      inquiry: { async count() { return counts.inquiry; } },
      opportunity: {
        async count() { return counts.opportunity; },
        async findFirst() { return counts.active ? { id: "o1" } : null; },
      },
    };
    return db as unknown as ContactScoreDb & { updates: Array<Record<string, unknown>> };
  }

  it("persists score, grade, signals and timestamp on the contact", async () => {
    const db = stubDb(
      { id: "c1", fullName: "Al Aminn", email: "al@example.com", phone: "01716609554" },
      { inquiry: 2, opportunity: 1, active: true },
    );
    const result = await recomputeContactScore(db, "c1");
    // 5 email + 15 phone + 10 whatsapp? no whatsapp → 5+15+0+0+0+0+20+15+10 = 65 → grade C? 65 >= 55 → B
    expect(result?.score).toBe(65);
    expect(result?.grade).toBe("B");
    expect(db.updates).toHaveLength(1);
    const data = db.updates[0];
    expect(data.leadScore).toBe(65);
    expect(data.leadScoreGrade).toBe("B");
    expect(JSON.parse(data.leadScoreSignals as string)).toContain("phone_reachable");
    expect(data.leadScoreUpdatedAt).toBeInstanceOf(Date);
  });

  it("returns null for a missing contact and writes nothing", async () => {
    const db = stubDb(null, { inquiry: 0, opportunity: 0, active: false });
    expect(await recomputeContactScore(db, "gone")).toBeNull();
    expect(db.updates).toHaveLength(0);
  });
});
