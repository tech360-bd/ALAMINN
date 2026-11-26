/**
 * CRM contact hygiene foundation — Phase 0 "CRM Foundation Sprint" (P0 gaps:
 * "lead scoring surfaced on records" and "duplicate detection").
 *
 * Design follows the deterministic-scorer pattern of
 * src/lib/marketing/helpers.ts (scoreLead): no model calls, no randomness,
 * positive-only accumulation — the same input always yields the same score,
 * so scores are reproducible, testable and auditable.
 *
 * Duplicate rule (documented, deterministic):
 *   - email: exact match on the normalized (trimmed, lowercased) address;
 *   - phone: same normalized digit key — all digits of the stored number,
 *     last 10 kept (e.g. "+880 1716-609554" and "01716609554" both normalize
 *     to "1716609554"). Candidates are netted with a suffix query (last 6
 *     digits) and confirmed in code against the full key, so formatted
 *     variants match while coincidental suffixes are dropped.
 */
import type { Contact } from "@prisma/client";

// ─── Contact-level lead scoring ─────────────────────────────────────────────

export type ContactScoreGrade = "A" | "B" | "C" | "D" | "F";

/** Inputs to the deterministic contact scorer (all derivable from the DB). */
export interface ContactScoringInput {
  hasEmail: boolean;
  hasPhone: boolean;
  hasWhatsapp: boolean;
  /** email | phone | whatsapp | null (unknown channels add nothing) */
  preferredChannel: string | null;
  hasSource: boolean;
  hasOrganization: boolean;
  inquiryCount: number;
  opportunityCount: number;
  hasActiveOpportunity: boolean;
}

export interface ContactScoreResult {
  score: number;
  grade: ContactScoreGrade;
  signals: string[];
  explanation: string;
}

/**
 * Deterministic contact score (0-100, positive-only, capped).
 *
 * Signals and weights (documented in the CRM gap analysis, Table 17):
 *   +5   email on record          +15  phone on record
 *   +10  whatsapp on record        +10  preferred channel = whatsapp
 *   +5   preferred channel = phone  +2 preferred channel = email
 *   +5   source attributed        +5   organization on record
 *   +10  first inquiry            +10  second inquiry (capped at 2)
 *   +15  any opportunity          +10  opportunity outside won/lost/on-hold/archived
 *
 * Grade bands mirror scoreLead(): >=75 A, >=55 B, >=35 C, >=15 D, else F.
 */
export function scoreContact(input: ContactScoringInput): ContactScoreResult {
  const signals: string[] = [];
  let score = 0;

  if (input.hasEmail) { score += 5; signals.push("email_reachable"); }
  if (input.hasPhone) { score += 15; signals.push("phone_reachable"); }
  if (input.hasWhatsapp) { score += 10; signals.push("whatsapp_reachable"); }
  if (input.preferredChannel === "whatsapp") { score += 10; signals.push("channel_whatsapp"); }
  else if (input.preferredChannel === "phone") { score += 5; signals.push("channel_phone"); }
  else if (input.preferredChannel === "email") { score += 2; signals.push("channel_email"); }
  if (input.hasSource) { score += 5; signals.push("source_attributed"); }
  if (input.hasOrganization) { score += 5; signals.push("organization_context"); }
  if (input.inquiryCount >= 1) { score += 10; signals.push("inquiry_engaged"); }
  if (input.inquiryCount >= 2) { score += 10; signals.push("inquiry_repeat"); }
  if (input.opportunityCount > 0) { score += 15; signals.push("pipeline_opportunity"); }
  if (input.hasActiveOpportunity) { score += 10; signals.push("pipeline_active"); }

  score = Math.min(score, 100);
  const grade: ContactScoreGrade =
    score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : score >= 15 ? "D" : "F";
  const explanation =
    `Score ${score} (grade ${grade})` +
    (signals.length ? ` — signals: ${signals.join(", ")}` : " — no signals");
  return { score, grade, signals, explanation };
}

// ─── Normalization helpers ──────────────────────────────────────────────────

/** Trim + lowercase an email; null when empty. */
export function normalizeEmailForMatch(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v.length > 0 ? v : null;
}

/** Digits only; when longer than 10 digits keep the last 10; null when none. */
export function normalizePhoneForMatch(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length === 0) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

export interface DuplicateContactMatch {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  matchOn: Array<"email" | "phone">;
}

type DuplicateRow = Pick<Contact, "id" | "fullName" | "email" | "phone">;

/**
 * Minimal structural seam over db.contact.findMany so the real PrismaClient
 * satisfies it and unit tests can pass an in-memory stub.
 */
export interface ContactDuplicateLookup {
  contact: {
    findMany(args?: {
      where?: {
        id?: { not?: string };
        email?: string;
        phone?: { endsWith?: string };
      };
    }): Promise<DuplicateRow[]>;
  };
}

/**
 * Find contacts that duplicate the given email/phone. Both criteria are
 * optional; with none, no query runs and the result is empty.
 */
export async function findDuplicateContacts(
  lookup: ContactDuplicateLookup,
  opts: { email?: string | null; phone?: string | null; excludeId?: string | null },
): Promise<DuplicateContactMatch[]> {
  const email = normalizeEmailForMatch(opts.email);
  const phoneKey = normalizePhoneForMatch(opts.phone);
  if (!email && !phoneKey) return [];

  const excluded = opts.excludeId ?? null;
  type FoundEntry = {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    matchOn: Set<"email" | "phone">;
  };
  const found = new Map<string, FoundEntry>();

  const add = (row: DuplicateRow, on: "email" | "phone"): void => {
    let entry = found.get(row.id);
    if (!entry) {
      entry = {
        id: row.id, fullName: row.fullName, email: row.email, phone: row.phone,
        matchOn: new Set<"email" | "phone">(),
      };
      found.set(row.id, entry);
    }
    entry.matchOn.add(on);
  };

  if (email) {
    const rows = await lookup.contact.findMany({
      where: { email, ...(excluded ? { id: { not: excluded } } : {}) },
    });
    for (const row of rows) {
      if (normalizeEmailForMatch(row.email) === email) add(row, "email");
    }
  }

  if (phoneKey) {
    // Net with a suffix query (last 6 digits, or the whole short key), then
    // confirm against the full 10-digit key so coincidental suffixes drop out.
    const net = phoneKey.length > 6 ? phoneKey.slice(-6) : phoneKey;
    const rows = await lookup.contact.findMany({
      where: { phone: { endsWith: net }, ...(excluded ? { id: { not: excluded } } : {}) },
    });
    for (const row of rows) {
      if (normalizePhoneForMatch(row.phone) === phoneKey) add(row, "phone");
    }
  }

  return [...found.values()].map((entry) => ({ ...entry, matchOn: [...entry.matchOn] }));
}

// ─── Score persistence ──────────────────────────────────────────────────────

type ContactScoreSource = Pick<
  Contact, "id" | "fullName" | "email" | "phone" | "whatsapp" | "preferredChannel" | "source" | "organization"
>;

/** Additive score columns written onto Contact. */
export type ContactScoreUpdateData = {
  leadScore?: number;
  leadScoreGrade?: string;
  leadScoreSignals?: string;
  leadScoreUpdatedAt?: Date | null;
};

/** Structural seam over the PrismaClient pieces recompute needs. */
export interface ContactScoreDb {
  contact: {
    findUnique(args: { where: { id: string } }): Promise<ContactScoreSource | null>;
    update(args: { where: { id: string }; data: ContactScoreUpdateData }): Promise<unknown>;
  };
  inquiry: { count(args: { where: { contactId: string } }): Promise<number> };
  opportunity: {
    count(args: { where: { contactId: string } }): Promise<number>;
    findFirst(args: { where: { contactId: string; stage: { notIn: string[] } } }): Promise<{ id: string } | null>;
  };
}

const OPEN_OPPORTUNITY_STAGES_EXCLUDED = ["won", "lost", "on-hold", "archived"];

/**
 * Recompute and persist the contact score from live DB state (reachability,
 * channel preference, context, engagement and pipeline signals).
 * Returns the fresh score result, or null when the contact does not exist.
 */
export async function recomputeContactScore(
  db: ContactScoreDb,
  contactId: string,
): Promise<ContactScoreResult | null> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return null;

  const [inquiryCount, opportunityCount, activeOpportunity] = await Promise.all([
    db.inquiry.count({ where: { contactId } }),
    db.opportunity.count({ where: { contactId } }),
    db.opportunity.findFirst({
      where: { contactId, stage: { notIn: OPEN_OPPORTUNITY_STAGES_EXCLUDED } },
    }),
  ]);

  const result = scoreContact({
    hasEmail: Boolean(contact.email),
    hasPhone: Boolean(contact.phone),
    hasWhatsapp: Boolean(contact.whatsapp),
    preferredChannel: contact.preferredChannel ?? null,
    hasSource: Boolean(contact.source),
    hasOrganization: Boolean(contact.organization),
    inquiryCount,
    opportunityCount,
    hasActiveOpportunity: activeOpportunity !== null,
  });

  await db.contact.update({
    where: { id: contactId },
    data: {
      leadScore: result.score,
      leadScoreGrade: result.grade,
      leadScoreSignals: JSON.stringify(result.signals),
      leadScoreUpdatedAt: new Date(),
    },
  });

  return result;
}
