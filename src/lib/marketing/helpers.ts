/**
 * Marketing helpers — office hours, lead scoring, opt-in/out detection,
 * messaging-window checks, and the do-not-contact (DNC) register.
 * =====================================================================
 * Responsibilities:
 *  - Persist + read office-hours configuration from `db.setting`
 *    (single row keyed `social.officeHours`).
 *  - Pure, timezone-aware `isWithinOfficeHours` check (used by the
 *    social command center, WhatsApp auto-reply gate, and the email
 *    scheduler). Defaults to *closed* when office hours are disabled —
 *    callers decide whether "closed" suppresses the action or queues.
 *  - Lead scoring + signal detection: deterministic, rule-based.
 *    Grade A/B/C/D/F, recommended action immediate/queue/nurture/
 *    disqualify. Marketing-consent gate is hard: no consent → 0/F/
 *    disqualify.
 *  - Opt-out / opt-in phrase detection (English + Bangla variants).
 *  - 24-hour messaging window check (matters for WhatsApp business
 *    messaging rules — outside the window requires a template).
 *  - Per-contact do-not-contact register (DNC), keyed `dnc:<contactId>`
 *    on `db.setting`. `shouldSuppressOutbound` is an alias used by the
 *    pipeline to short-circuit outbound sends.
 *
 * All pure helpers are exported separately so they can be unit-tested
 * without a DB. The async DB-backed helpers are thin wrappers.
 */

import { db } from "@/lib/db";

// ─── Setting keys + constants ────────────────────────────────────────

/** `db.setting` key for the office-hours configuration blob (JSON). */
export const OFFICE_HOURS_SETTING_KEY = "social.officeHours";

/** `db.setting` key prefix for per-contact do-not-contact entries. */
export const DNC_SETTING_PREFIX = "dnc:";

/** 24-hour messaging window in milliseconds (WhatsApp business rule). */
export const MESSAGING_WINDOW_MS = 86_400_000; // 24 * 60 * 60 * 1000

// ─── Office hours ────────────────────────────────────────────────────

/**
 * Office-hours configuration. Days are ISO-style: Mon=1 … Sun=7
 * (matches `Intl.DateTimeFormat`'s `weekday: "short"` ordering and the
 * ECMAScript `Date.getUTCDay()` semantics after offsetting for Sunday=0).
 */
export interface OfficeHoursConfig {
  enabled: boolean;
  /** ISO weekday numbers: 1=Mon … 7=Sun. */
  days: number[];
  /** Start hour (0-23), inclusive. */
  startHour: number;
  /** End hour (0-23), exclusive. */
  endHour: number;
  /** IANA timezone (e.g. `"Asia/Dhaka"`). */
  timezone: string;
  /** Message returned to inbound contacts outside office hours. */
  afterHoursMessage: string;
}

/**
 * Default office-hours config: disabled, Mon–Fri 09:00–18:00 Asia/Dhaka,
 * empty after-hours message. Disabled is the safe default — callers
 * must opt in.
 */
export const DEFAULT_OFFICE_HOURS: OfficeHoursConfig = {
  enabled: false,
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  timezone: "Asia/Dhaka",
  afterHoursMessage: "",
};

/**
 * Read the office-hours configuration from `db.setting`. Returns
 * {@link DEFAULT_OFFICE_HOURS} if the setting is missing or unparseable.
 *
 * Never throws — bad rows fall back to the default. This matters because
 * the configuration is read by the WhatsApp auto-reply gate on every
 * inbound message; a corrupt row must not take the whole pipeline down.
 */
export async function getOfficeHoursConfig(): Promise<OfficeHoursConfig> {
  try {
    const row = await db.setting.findUnique({
      where: { key: OFFICE_HOURS_SETTING_KEY },
    });
    if (!row?.value) return { ...DEFAULT_OFFICE_HOURS };
    const parsed = JSON.parse(row.value) as Partial<OfficeHoursConfig>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_OFFICE_HOURS.enabled,
      days: Array.isArray(parsed.days)
        ? parsed.days.filter((d) => typeof d === "number" && d >= 1 && d <= 7)
        : DEFAULT_OFFICE_HOURS.days,
      startHour: typeof parsed.startHour === "number" ? parsed.startHour : DEFAULT_OFFICE_HOURS.startHour,
      endHour: typeof parsed.endHour === "number" ? parsed.endHour : DEFAULT_OFFICE_HOURS.endHour,
      timezone: typeof parsed.timezone === "string" && parsed.timezone ? parsed.timezone : DEFAULT_OFFICE_HOURS.timezone,
      afterHoursMessage:
        typeof parsed.afterHoursMessage === "string"
          ? parsed.afterHoursMessage
          : DEFAULT_OFFICE_HOURS.afterHoursMessage,
    };
  } catch {
    return { ...DEFAULT_OFFICE_HOURS };
  }
}

/**
 * Persist the office-hours configuration to `db.setting` (upsert).
 * The value is serialised as JSON.
 */
export async function setOfficeHoursConfig(config: OfficeHoursConfig): Promise<void> {
  const value = JSON.stringify(config);
  await db.setting.upsert({
    where: { key: OFFICE_HOURS_SETTING_KEY },
    update: { value },
    create: { key: OFFICE_HOURS_SETTING_KEY, value },
  });
}

/**
 * Pure timezone-aware office-hours check.
 *
 * Uses `Intl.DateTimeFormat` with the configured `timeZone` to extract
 * the weekday (1=Mon … 7=Sun) and hour (0-23) of `now` in that timezone,
 * then checks `days.includes(weekday) && startHour <= hour < endHour`.
 *
 * Returns `false` if `enabled` is `false` (the safe default). Callers
 * that want "outside hours = still send, just queue" can branch on
 * `config.enabled` themselves; this function only answers "is this
 * moment inside the configured window?".
 */
export function isWithinOfficeHours(
  config: OfficeHoursConfig,
  now: Date = new Date(),
): boolean {
  if (!config.enabled) return false;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: config.timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
    const hour = Number.parseInt(hourStr, 10);
    const hour24 = Number.isFinite(hour) ? (hour === 24 ? 0 : hour) : 0;
    // Map "Mon".."Sun" to 1..7 (ISO weekday).
    const weekdayMap: Record<string, number> = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    };
    const weekday = weekdayMap[weekdayStr];
    if (weekday === undefined) return false;
    if (!config.days.includes(weekday)) return false;
    return config.startHour <= hour24 && hour24 < config.endHour;
  } catch {
    // Bad timezone → fail closed.
    return false;
  }
}

// ─── Lead scoring ────────────────────────────────────────────────────

/** Channels a lead can arrive on. */
export type LeadChannel =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "web"
  | "email"
  | "social"
  | "other";

/** Inputs to the deterministic lead scorer. */
export interface LeadScoringInput {
  message: string;
  hasContactInfo: boolean;
  mentionsBudget: boolean;
  mentionsSpecificProgramme: boolean;
  isUrgent: boolean;
  hasMarketingConsent: boolean;
  channel: LeadChannel;
}

/** Letter grade A (hot) → F (cold/disqualified). */
export type LeadGrade = "A" | "B" | "C" | "D" | "F";

/** What the pipeline should do with a scored lead. */
export type RecommendedAction =
  | "immediate_followup"
  | "queue"
  | "nurture"
  | "disqualify";

/** Deterministic scoring result. */
export interface LeadScoreResult {
  score: number;
  grade: LeadGrade;
  recommendedAction: RecommendedAction;
  signals: string[];
  explanation: string;
}

/**
 * Deterministic lead scorer.
 *
 * Hard gates (return 0/F/disqualify):
 *  - No marketing consent.
 *  - No contact info AND channel is "social" or "other" (we cannot
 *    follow up).
 *
 * Score accumulation (positive only — never penalise):
 *  - +20  has contact info
 *  - +20  mentions budget / fees / funding
 *  - +20  mentions a specific programme / university / admission
 *  - +15  urgent language (deadline, ASAP, immediately)
 *  - +10  channel = whatsapp (fastest reply path)
 *  - +5   channel = web (form submission — high intent)
 *
 * Grade bands:
 *  - >= 75 → A → immediate_followup
 *  - >= 55 → B → queue (within business hours)
 *  - >= 35 → C → nurture
 *  - >= 15 → D → nurture
 *  - else  → F → disqualify (already covered by hard gates above; here
 *                   for completeness if score happens to be low without
 *                   a hard-gate trigger).
 */
export function scoreLead(input: LeadScoringInput): LeadScoreResult {
  const signals: string[] = [];

  // Hard gate: no marketing consent → never score, never follow up.
  if (!input.hasMarketingConsent) {
    return {
      score: 0,
      grade: "F",
      recommendedAction: "disqualify",
      signals: ["no_marketing_consent"],
      explanation:
        "Lead has not granted marketing consent; no follow-up permitted.",
    };
  }

  // Hard gate: anonymous social/other lead — no way to follow up.
  if (!input.hasContactInfo && (input.channel === "social" || input.channel === "other")) {
    return {
      score: 0,
      grade: "F",
      recommendedAction: "disqualify",
      signals: ["no_contact_info", `channel:${input.channel}`],
      explanation:
        "Lead arrived on a low-context channel with no contact info; " +
        "cannot be followed up.",
    };
  }

  let score = 0;
  if (input.hasContactInfo) {
    score += 20;
    signals.push("contact_info");
  }
  if (input.mentionsBudget) {
    score += 20;
    signals.push("budget");
  }
  if (input.mentionsSpecificProgramme) {
    score += 20;
    signals.push("programme");
  }
  if (input.isUrgent) {
    score += 15;
    signals.push("urgent");
  }
  if (input.channel === "whatsapp") {
    score += 10;
    signals.push("channel:whatsapp");
  } else if (input.channel === "web") {
    score += 5;
    signals.push("channel:web");
  }

  const grade: LeadGrade =
    score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : score >= 15 ? "D" : "F";

  const recommendedAction: RecommendedAction =
    grade === "A"
      ? "immediate_followup"
      : grade === "B"
        ? "queue"
        : grade === "C" || grade === "D"
          ? "nurture"
          : "disqualify";

  return {
    score,
    grade,
    recommendedAction,
    signals,
    explanation:
      `Lead scored ${score}/100 (${grade}) on ${signals.length} signal(s): ` +
      `${signals.join(", ")}. Recommended action: ${recommendedAction}.`,
  };
}

/**
 * Detect budget / programme / urgency signals in a free-text message.
 * Returns three booleans — caller typically feeds these straight into
 * {@link scoreLead}. Pure + regex-based; no external services.
 *
 * Budget signal: budget, tuition, fee(s), cost, afford, scholarship, fund.
 * Programme signal: mba, phd, master, msc, bachelor, course, programme,
 *   university, admission, apply.
 * Urgency signal: urgent, asap, deadline, immediately, soon, quickly.
 */
export function detectLeadSignals(message: string): {
  mentionsBudget: boolean;
  mentionsSpecificProgramme: boolean;
  isUrgent: boolean;
} {
  const text = (message || "").toLowerCase();
  return {
    mentionsBudget:
      /\bbudget\b/.test(text) ||
      /\btuition/.test(text) ||
      /\bfees?\b/.test(text) ||
      /\bcost\b/.test(text) ||
      /\bafford/.test(text) ||
      /\bscholarship/.test(text) ||
      /\bfund/.test(text),
    mentionsSpecificProgramme:
      /\bmba\b/.test(text) ||
      /\bphd\b/.test(text) ||
      /\bmaster/.test(text) ||
      /\bmsc\b/.test(text) ||
      /\bbachelor/.test(text) ||
      /\bcourse\b/.test(text) ||
      /\bprogramme/.test(text) ||
      /\buniversity/.test(text) ||
      /\badmission/.test(text) ||
      /\bapply/.test(text),
    isUrgent:
      /\burgent/.test(text) ||
      /\basap\b/.test(text) ||
      /\bdeadline/.test(text) ||
      /\bimmediately/.test(text) ||
      /\bsoon\b/.test(text) ||
      /\bquickly/.test(text),
  };
}

// ─── Opt-in / opt-out detection ──────────────────────────────────────

/**
 * Detect opt-out requests in English and Bangla.
 * Triggers (case-insensitive, after trim):
 *   stop, unsubscribe, unsub, opt out, opt-out, cancel, end, quit, bandho.
 */
export function isOptOutRequest(message: string): boolean {
  const text = (message || "").toLowerCase().trim();
  if (!text) return false;
  const triggers = [
    "stop",
    "unsubscribe",
    "unsub",
    "opt out",
    "opt-out",
    "cancel",
    "end",
    "quit",
    "bandho",
  ];
  return triggers.some((t) => text === t || text.startsWith(t + " ") || text.includes(" " + t + " "));
}

/**
 * Detect opt-in requests in English and Bangla.
 * Triggers (case-insensitive, after trim):
 *   start, subscribe, opt in, opt-in, yes, begin, shuru.
 */
export function isOptInRequest(message: string): boolean {
  const text = (message || "").toLowerCase().trim();
  if (!text) return false;
  const triggers = [
    "start",
    "subscribe",
    "opt in",
    "opt-in",
    "yes",
    "begin",
    "shuru",
  ];
  return triggers.some((t) => text === t || text.startsWith(t + " ") || text.includes(" " + t + " "));
}

// ─── 24-hour messaging window ────────────────────────────────────────

/**
 * Check whether `now` is within the 24-hour messaging window that opens
 * when the contact last sent us an inbound message.
 *
 * Returns `false` if `lastInboundAt` is `null` (no prior inbound →
 * outside any window) or if the elapsed time is ≥
 * {@link MESSAGING_WINDOW_MS}. Returns `true` only when the elapsed
 * time is strictly less than the window.
 *
 * Matters for WhatsApp business messaging: outside the window, only
 * pre-approved template messages may be sent.
 */
export function isWithinMessagingWindow(
  lastInboundAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  const last = lastInboundAt instanceof Date ? lastInboundAt.getTime() : new Date(lastInboundAt).getTime();
  if (!Number.isFinite(last)) return false;
  const elapsed = now.getTime() - last;
  return elapsed >= 0 && elapsed < MESSAGING_WINDOW_MS;
}

// ─── Do-not-contact (DNC) register ───────────────────────────────────

/**
 * Add `contactId` to the do-not-contact register with a reason. Idempotent
 * upsert — calling twice updates the reason. The reason is stored as the
 * setting value so support staff can see *why* the contact asked to be
 * suppressed.
 */
export async function setDoNotContact(
  contactId: string,
  reason: string,
): Promise<void> {
  const key = `${DNC_SETTING_PREFIX}${contactId}`;
  const payload = JSON.stringify({ reason, at: new Date().toISOString() });
  await db.setting.upsert({
    where: { key },
    update: { value: payload },
    create: { key, value: payload },
  });
}

/**
 * Remove `contactId` from the do-not-contact register. No-op if the
 * contact was not on the register.
 */
export async function clearDoNotContact(contactId: string): Promise<void> {
  const key = `${DNC_SETTING_PREFIX}${contactId}`;
  try {
    await db.setting.delete({ where: { key } });
  } catch {
    // Already absent — treat as success.
  }
}

/**
 * Return `true` if `contactId` is on the do-not-contact register.
 * Never throws — bad rows return `false`.
 */
export async function isDoNotContact(contactId: string): Promise<boolean> {
  try {
    const key = `${DNC_SETTING_PREFIX}${contactId}`;
    const row = await db.setting.findUnique({ where: { key } });
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Alias used by the outbound pipeline. Returns `true` if outbound
 * messaging should be suppressed for `contactId` (DNC registered).
 */
export async function shouldSuppressOutbound(contactId: string): Promise<boolean> {
  return isDoNotContact(contactId);
}
