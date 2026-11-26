import { describe, it, expect } from "vitest";
import { renderTemplate, enrollContact, processDueEnrollments, sequenceStepsSchema, type SequenceDb } from "@/lib/automation/sequences";
import type { EmailSendResult } from "@/lib/email/router";

const okSend = async (): Promise<EmailSendResult> => ({
  status: "SENT", providerUsed: "smtp" as never, providerName: "SMTP", messageId: "m1",
  error: null, actuallySent: true, fallbackTrail: [],
});

function stubDb(overrides: Partial<{
  marketingConsent: boolean;
  suppressed: boolean;
  contact: { id: string; email: string; fullName: string } | null;
  steps: string;
  sequenceStatus: string;
}> = {}): SequenceDb & { state: { enrollments: Array<Record<string, unknown>> } } {
  const defaults = {
    marketingConsent: true,
    suppressed: false,
    contact: { id: "c1", email: "lead@example.com", fullName: "Rahim Uddin" },
    steps: JSON.stringify([
      { delayHours: 0, subject: "Welcome {{first_name}}", bodyText: "Hello {{full_name}}, welcome to {{organization}}!" },
      { delayHours: 24, subject: "Day 2", bodyText: "Second email" },
    ]),
    sequenceStatus: "active",
  };
  const opts = { ...defaults, ...overrides };
  const state = { enrollments: [] as Array<Record<string, unknown>> };
  const dbSeam: SequenceDb & { state: typeof state } = {
    state,
    automationSequence: {
      findUnique: async () => ({ id: "s1", name: "Nurture", status: opts.sequenceStatus, steps: opts.steps }),
      update: async () => ({}),
    },
    sequenceEnrollment: {
      findMany: async () => state.enrollments.map((e) => ({ id: e.id as string, sequenceId: "s1", contactId: "c1", status: "active", currentStep: e.currentStep as number, nextStepAt: new Date(Date.now() - 1000) })),
      update: async ({ where: { id }, data }) => {
        const row = state.enrollments.find((e) => e.id === id);
        if (row) Object.assign(row, data);
        return {};
      },
      create: async ({ data }) => { state.enrollments.push(data); return {}; },
      upsert: async ({ where, create }) => {
        const existing = state.enrollments.find((e) => e.sequenceId === where.sequenceId_contactId.sequenceId && e.contactId === where.sequenceId_contactId.contactId);
        if (existing) { Object.assign(existing, create); return {}; }
        state.enrollments.push(create);
        return {};
      },
    },
    contact: { findUnique: async () => opts.contact },
    inquiry: { findFirst: async () => ({ marketingConsent: opts.marketingConsent }) },
    suppressEntry: { findFirst: async () => (opts.suppressed ? { id: "x" } : null) },
  };
  return dbSeam;
}

describe("sequence step schema", () => {
  it("requires at least one step with subject and body", () => {
    expect(sequenceStepsSchema.safeParse([{ delayHours: 24, subject: "Hi", bodyText: "Body" }]).success).toBe(true);
    expect(sequenceStepsSchema.safeParse([]).success).toBe(false);
    expect(sequenceStepsSchema.safeParse([{ delayHours: 24, subject: "", bodyText: "Body" }]).success).toBe(false);
  });
});

describe("renderTemplate", () => {
  it("renders known tokens and leaves unknown tokens visible", () => {
    const out = renderTemplate("Hi {{first_name}} from {{organization}} — {{unknown_token}}", {
      fullName: "Rahim Uddin", email: "r@x.com", organization: "Tech360",
    });
    expect(out).toContain("Hi Rahim from Tech360");
    expect(out).toContain("{{unknown_token}}");
  });
});

describe("enrollContact", () => {
  it("enrolls at the first step's delay and refuses drafts/paused sequences", async () => {
    const dbSeam = stubDb();
    const ok = await enrollContact(dbSeam, "s1", "c1");
    expect(ok.ok).toBe(true);
    expect(dbSeam.state.enrollments[0]).toMatchObject({ status: "active", currentStep: 0 });

    const paused = await enrollContact(stubDb({ sequenceStatus: "paused" }), "s1", "c1");
    expect(paused.ok).toBe(false);
    expect(paused.message).toMatch(/not active/i);
  });
});

describe("processDueEnrollments", () => {
  it("sends due steps, advances and completes the enrollment", async () => {
    const dbSeam = stubDb();
    await enrollContact(dbSeam, "s1", "c1");
    const first = await processDueEnrollments(dbSeam, { send: async (_to, msg) => {
      expect(msg.subject).toBe("Welcome Rahim");
      expect(msg.text).toContain("Hello Rahim Uddin");
      return okSend();
    } });
    expect(first.sent).toBe(1);
    expect(dbSeam.state.enrollments[0]).toMatchObject({ currentStep: 1, status: "active" });

    // Advance the clock conceptually: second pass completes the sequence.
    const second = await processDueEnrollments(dbSeam, { now: new Date(Date.now() + 25 * 3600_000), send: async () => okSend() });
    expect(second.sent).toBe(1);
    expect(second.completed).toBe(1);
    expect(dbSeam.state.enrollments[0]).toMatchObject({ status: "completed", currentStep: 2 });
  });

  it("fail-closed: cancels on suppression, no-consent, and missing contact", async () => {
    const suppressed = stubDb({ suppressed: true });
    await enrollContact(suppressed, "s1", "c1");
    const r1 = await processDueEnrollments(suppressed, { send: async () => okSend() });
    expect(r1.skippedSuppressed).toBe(1);
    expect(r1.sent).toBe(0);

    const noConsent = stubDb({ marketingConsent: false });
    await enrollContact(noConsent, "s1", "c1");
    const r2 = await processDueEnrollments(noConsent, { send: async () => okSend() });
    expect(r2.skippedConsent).toBe(1);

    const noContact = stubDb({ contact: null });
    await enrollContact(noContact, "s1", "c1");
    const r3 = await processDueEnrollments(noContact, { send: async () => okSend() });
    expect(r3.skippedInvalid).toBe(1);
  });

  it("records provider failures honestly without advancing", async () => {
    const dbSeam = stubDb();
    await enrollContact(dbSeam, "s1", "c1");
    const result = await processDueEnrollments(dbSeam, { send: async () => ({
      status: "FAILED", providerUsed: "smtp" as never, providerName: "SMTP", messageId: null,
      error: "SMTP refused", actuallySent: false, fallbackTrail: [],
    }) });
    expect(result.failed).toBe(1);
    expect(result.outcomes[0].outcome).toBe("failed");
    expect(dbSeam.state.enrollments[0]).toMatchObject({ currentStep: 0, status: "active" });
  });
});
