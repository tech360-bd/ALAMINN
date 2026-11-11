/**
 * Unit tests for the marketing helpers
 * (src/lib/marketing/helpers.ts).
 *
 * Covers the pure helpers only — office-hours check, lead scoring,
 * signal detection, opt-in/out detection, and the 24-hour messaging
 * window. DB-backed helpers (getOfficeHoursConfig, setDoNotContact, …)
 * are exercised by integration tests, not here.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_OFFICE_HOURS,
  MESSAGING_WINDOW_MS,
  detectLeadSignals,
  isOptInRequest,
  isOptOutRequest,
  isWithinMessagingWindow,
  isWithinOfficeHours,
  scoreLead,
  type LeadScoringInput,
  type OfficeHoursConfig,
} from "@/lib/marketing/helpers";

// ─── isWithinOfficeHours ─────────────────────────────────────────────

describe("isWithinOfficeHours", () => {
  it("returns false when disabled (default)", () => {
    expect(isWithinOfficeHours(DEFAULT_OFFICE_HOURS, new Date())).toBe(false);
  });

  it("returns true during a weekday business hour", () => {
    const config: OfficeHoursConfig = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startHour: 9,
      endHour: 18,
      timezone: "Asia/Dhaka",
      afterHoursMessage: "",
    };
    // 2025-01-15 is a Wednesday. 10:00 UTC = 16:00 Asia/Dhaka (UTC+6).
    const wed = new Date("2025-01-15T10:00:00Z");
    expect(isWithinOfficeHours(config, wed)).toBe(true);
  });

  it("returns false on a weekend even if enabled", () => {
    const config: OfficeHoursConfig = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startHour: 0,
      endHour: 24,
      timezone: "Asia/Dhaka",
      afterHoursMessage: "",
    };
    // 2025-01-18 is a Saturday.
    const sat = new Date("2025-01-18T10:00:00Z");
    expect(isWithinOfficeHours(config, sat)).toBe(false);
  });

  it("returns false after endHour on a weekday", () => {
    const config: OfficeHoursConfig = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startHour: 9,
      endHour: 18,
      timezone: "Asia/Dhaka",
      afterHoursMessage: "",
    };
    // 13:00 UTC = 19:00 Asia/Dhaka — past endHour 18.
    const evening = new Date("2025-01-15T13:00:00Z");
    expect(isWithinOfficeHours(config, evening)).toBe(false);
  });
});

// ─── scoreLead ───────────────────────────────────────────────────────

describe("scoreLead", () => {
  const hotBase: LeadScoringInput = {
    message: "I need an MBA urgently, budget £30k, apply this month",
    hasContactInfo: true,
    mentionsBudget: true,
    mentionsSpecificProgramme: true,
    isUrgent: true,
    hasMarketingConsent: true,
    channel: "whatsapp",
  };

  it("scores a hot lead as A with immediate_followup", () => {
    const result = scoreLead(hotBase);
    // 20 contact + 20 budget + 20 programme + 15 urgent + 10 whatsapp = 85
    expect(result.score).toBe(85);
    expect(result.grade).toBe("A");
    expect(result.recommendedAction).toBe("immediate_followup");
  });

  it("disqualifies a lead without marketing consent regardless of other signals", () => {
    const result = scoreLead({ ...hotBase, hasMarketingConsent: false });
    expect(result.score).toBe(0);
    expect(result.grade).toBe("F");
    expect(result.recommendedAction).toBe("disqualify");
    expect(result.signals).toContain("no_marketing_consent");
  });

  it("disqualifies an anonymous social lead (no contact info)", () => {
    const result = scoreLead({
      ...hotBase,
      hasContactInfo: false,
      channel: "social",
    });
    expect(result.score).toBe(0);
    expect(result.grade).toBe("F");
    expect(result.recommendedAction).toBe("disqualify");
  });

  it("grades a cold lead as C or D", () => {
    const cold: LeadScoringInput = {
      message: "Hi, just exploring options for higher study",
      hasContactInfo: true,
      mentionsBudget: false,
      mentionsSpecificProgramme: false,
      isUrgent: false,
      hasMarketingConsent: true,
      channel: "email",
    };
    // 20 contact + 0 + 0 + 0 + 0 (email) = 20 → D
    const result = scoreLead(cold);
    expect(result.score).toBe(20);
    expect(result.grade).toBe("D");
    expect(result.recommendedAction).toBe("nurture");
  });
});

// ─── detectLeadSignals ───────────────────────────────────────────────

describe("detectLeadSignals", () => {
  it("detects budget signals", () => {
    expect(detectLeadSignals("What is the tuition fee for an MBA?").mentionsBudget).toBe(true);
    expect(detectLeadSignals("Do you have any scholarships available?").mentionsBudget).toBe(true);
    expect(detectLeadSignals("Hello, how are you?").mentionsBudget).toBe(false);
  });

  it("detects programme signals", () => {
    expect(detectLeadSignals("I want to apply for a PhD programme").mentionsSpecificProgramme).toBe(true);
    expect(detectLeadSignals("Looking for an MSc in Data Science").mentionsSpecificProgramme).toBe(true);
    expect(detectLeadSignals("What is the weather like?").mentionsSpecificProgramme).toBe(false);
  });

  it("detects urgency signals", () => {
    expect(detectLeadSignals("This is urgent, deadline is tomorrow!").isUrgent).toBe(true);
    expect(detectLeadSignals("Please reply ASAP").isUrgent).toBe(true);
    expect(detectLeadSignals("Tell me more about courses").isUrgent).toBe(false);
  });

  it("returns all-false for unrelated messages", () => {
    const result = detectLeadSignals("Thank you for your time");
    expect(result.mentionsBudget).toBe(false);
    expect(result.mentionsSpecificProgramme).toBe(false);
    expect(result.isUrgent).toBe(false);
  });
});

// ─── isOptOutRequest / isOptInRequest ────────────────────────────────

describe("isOptOutRequest", () => {
  it("detects STOP and UNSUBSCRIBE", () => {
    expect(isOptOutRequest("STOP")).toBe(true);
    expect(isOptOutRequest("stop")).toBe(true);
    expect(isOptOutRequest("Unsubscribe")).toBe(true);
    expect(isOptOutRequest("UNSUB")).toBe(true);
  });

  it("detects Bangla bandho", () => {
    expect(isOptOutRequest("bandho koro")).toBe(true);
  });

  it("does not false-positive on casual messages", () => {
    expect(isOptOutRequest("Can you send me the deadline?")).toBe(false);
    expect(isOptOutRequest("I want to begin my application")).toBe(false);
    expect(isOptOutRequest("")).toBe(false);
  });
});

describe("isOptInRequest", () => {
  it("detects START and SUBSCRIBE", () => {
    expect(isOptInRequest("START")).toBe(true);
    expect(isOptInRequest("subscribe")).toBe(true);
    expect(isOptInRequest("yes")).toBe(true);
  });

  it("detects Bangla shuru", () => {
    expect(isOptInRequest("shuru koro")).toBe(true);
  });

  it("does not false-positive on casual messages", () => {
    expect(isOptInRequest("I am stopping by tomorrow")).toBe(false);
    expect(isOptInRequest("When does the course end?")).toBe(false);
  });
});

// ─── isWithinMessagingWindow ─────────────────────────────────────────

describe("isWithinMessagingWindow", () => {
  it("returns false for null lastInboundAt", () => {
    expect(isWithinMessagingWindow(null, new Date())).toBe(false);
  });

  it("returns true when last inbound was 1 hour ago", () => {
    const now = new Date("2025-01-15T12:00:00Z");
    const lastInbound = new Date("2025-01-15T11:00:00Z"); // 1h ago
    expect(isWithinMessagingWindow(lastInbound, now)).toBe(true);
  });

  it("returns false when last inbound was 2 days ago (> 24h window)", () => {
    const now = new Date("2025-01-15T12:00:00Z");
    const lastInbound = new Date("2025-01-13T12:00:00Z"); // 2d ago
    expect(isWithinMessagingWindow(lastInbound, now)).toBe(false);
  });

  it("exposes MESSAGING_WINDOW_MS as 24 hours", () => {
    expect(MESSAGING_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
