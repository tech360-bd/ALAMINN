/**
 * LinkedIn endorsements — pure types, validation and serialization.
 * ---------------------------------------------------------------
 * Truth policy: endorsements are NEVER generated or invented. The public
 * site renders only items an admin has pasted from LinkedIn and explicitly
 * marked as consented. Anything unconsented stays in the admin draft.
 *
 * No database imports here — this module is safe to import from client
 * components (the admin editor) as well as server code.
 */
import { z } from "zod";

/** Setting key holding the serialized endorsement list. */
export const ENDORSEMENTS_SETTING_KEY = "endorsements.linkedin";
/** Setting key holding the public LinkedIn profile URL. */
export const LINKEDIN_PROFILE_SETTING_KEY = "social.linkedin_url";

/** Hard cap so a bad import can never bloat the DB / homepage. */
export const MAX_ENDORSEMENTS = 24;
/** How many recommendations the homepage shows. */
export const PUBLIC_ENDORSEMENT_LIMIT = 6;

export type LinkedInEndorsement = {
  id: string;
  quote: string;
  name: string;
  role: string;
  organization: string;
  /** Permalink to the recommendation / profile on LinkedIn. May be empty. */
  linkedinUrl: string;
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. May be empty. */
  date: string;
  /** Must be true before the recommendation can appear publicly. */
  consented: boolean;
};

export type EndorsementsPayload = {
  profileUrl: string;
  items: LinkedInEndorsement[];
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Remove control characters, normalise line endings and trim. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

/** True when `value` is an https URL pointing at linkedin.com. */
export function isLinkedInUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

/** Validate + normalise a LinkedIn profile URL. Invalid → "". */
export function normalizeProfileUrl(value: unknown): string {
  const url = cleanText(value, 500);
  return isLinkedInUrl(url) ? url : "";
}

const dateSchema = z
  .string()
  .trim()
  .max(10)
  .refine((v) => v === "" || /^\d{4}(-\d{2}){0,2}$/.test(v), {
    message: "Use YYYY, YYYY-MM or YYYY-MM-DD.",
  });

const optionalLinkedInUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || isLinkedInUrl(v), {
    message: "Must be a LinkedIn https:// URL.",
  });

export const endorsementSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  quote: z
    .string()
    .trim()
    .min(20, "Quote must be at least 20 characters.")
    .max(1200, "Quote must be 1200 characters or fewer."),
  name: z.string().trim().min(2, "Name is required.").max(120),
  role: z.string().trim().min(2, "Role / headline is required.").max(160),
  organization: z.string().trim().max(160).optional().default(""),
  linkedinUrl: optionalLinkedInUrl.optional().default(""),
  date: dateSchema.optional().default(""),
  consented: z.boolean().optional().default(false),
});

export const endorsementsPayloadSchema = z.object({
  profileUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || isLinkedInUrl(v), {
      message: "Profile URL must be a LinkedIn https:// URL.",
    })
    .optional()
    .default(""),
  items: z.array(endorsementSchema).max(MAX_ENDORSEMENTS, `Maximum ${MAX_ENDORSEMENTS} recommendations.`),
});

function newId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Validate one item and force safe, trimmed values. Throws ZodError. */
export function sanitizeEndorsement(input: unknown): LinkedInEndorsement {
  const parsed = endorsementSchema.parse(input);
  return {
    id: parsed.id ?? newId(),
    quote: cleanText(parsed.quote, 1200),
    name: cleanText(parsed.name, 120),
    role: cleanText(parsed.role, 160),
    organization: cleanText(parsed.organization, 160),
    linkedinUrl: parsed.linkedinUrl ? parsed.linkedinUrl.trim() : "",
    date: parsed.date.trim(),
    consented: parsed.consented === true,
  };
}

/**
 * Parse the stored Setting JSON. Tolerates legacy shapes, malformed JSON
 * and individual invalid rows — a corrupt row is dropped, never rendered.
 */
export function parseStoredEndorsements(raw: string | null | undefined): LinkedInEndorsement[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
        : [];
    const out: LinkedInEndorsement[] = [];
    for (const item of list.slice(0, MAX_ENDORSEMENTS)) {
      const result = endorsementSchema.safeParse(item);
      if (!result.success) continue;
      out.push({
        id: result.data.id ?? newId(),
        quote: cleanText(result.data.quote, 1200),
        name: cleanText(result.data.name, 120),
        role: cleanText(result.data.role, 160),
        organization: cleanText(result.data.organization, 160),
        linkedinUrl: result.data.linkedinUrl,
        date: result.data.date,
        consented: result.data.consented === true,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Serialize for storage. */
export function serializeEndorsements(items: LinkedInEndorsement[]): string {
  return JSON.stringify({ version: 1, items: items.slice(0, MAX_ENDORSEMENTS) });
}

/** Sort newest first; undated entries last. Stable. */
function byDateDesc(a: LinkedInEndorsement, b: LinkedInEndorsement): number {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.localeCompare(a.date);
}

/**
 * The ONLY items that may appear on the public site: consented, non-empty,
 * sorted newest-first and capped. Unconsented drafts never leave the admin.
 */
export function publicEndorsements(
  items: LinkedInEndorsement[],
  limit = PUBLIC_ENDORSEMENT_LIMIT
): LinkedInEndorsement[] {
  return items
    .filter((i) => i.consented && i.quote.length >= 20 && i.name.length >= 2)
    .slice()
    .sort(byDateDesc)
    .slice(0, Math.max(0, limit));
}

/** Initials for the avatar (max 2). */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
