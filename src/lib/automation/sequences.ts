/**
 * Email sequences — automated follow-up sequences over Contact.
 * ----------------------------------------------------------------
 * A sequence is an ordered list of steps [{ delayHours, subject,
 * bodyText, bodyHtml? }]. Contacts are enrolled (manually or via
 * automation rules); the cron worker `/api/cron/automation-queue`
 * processes due enrollments every 15 minutes and advances them.
 *
 * CONSENT & SUPPRESSION (fail-closed):
 *  - A step is only sent when the contact's most recent inquiry has
 *    marketingConsent = true, OR the contact has no inquiry history
 *    and explicit consent was captured at enrollment time (rare).
 *  - Any SuppressEntry matching the email (channel "all") hard-blocks
 *    sending and cancels the enrollment.
 *  - Every send goes through the existing failover email router.
 *
 * HONESTY: processDueEnrollments returns exactly what happened —
 * sent / skipped_consent / skipped_suppressed / failed counts and
 * per-enrollment outcomes. Nothing is silently dropped.
 */

import { z } from "zod";
import { sendEmail, type EmailSendResult } from "@/lib/email/router";

export const sequenceStepSchema = z.object({
  delayHours: z.number().min(0).max(24 * 60).default(24),
  subject: z.string().trim().min(1).max(200),
  bodyText: z.string().trim().min(1).max(20000),
  bodyHtml: z.string().max(100000).optional(),
});
export type SequenceStep = z.infer<typeof sequenceStepSchema>;

export const sequenceStepsSchema = z.array(sequenceStepSchema).min(1).max(20);

export const sequenceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  trigger: z.enum(["manual", "contact.created", "inquiry.created"]).default("manual"),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
  steps: sequenceStepsSchema,
});
export type SequenceInput = z.infer<typeof sequenceSchema>;

// ─── Template rendering ─────────────────────────────────────────────────────

export interface TemplateContact {
  fullName?: string | null;
  firstName?: string | null;
  email?: string | null;
  country?: string | null;
  organization?: string | null;
}

/** Render {{tokens}} safely — unknown tokens are left visible. */
export function renderTemplate(template: string, contact: TemplateContact): string {
  const first = (contact.firstName ?? contact.fullName ?? "").split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    first_name: first.slice(0, 80),
    full_name: (contact.fullName ?? "").slice(0, 160),
    email: (contact.email ?? "").slice(0, 254),
    country: (contact.country ?? "").slice(0, 80),
    organization: (contact.organization ?? "").slice(0, 160),
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase();
    return key in values ? values[key] : match;
  });
}

// ─── Enrollment ─────────────────────────────────────────────────────────────

export interface SequenceDb {
  automationSequence: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; status: string; steps: string; name: string } | null>;
    update(args: { where: { id: string }; data: { enrollCount?: number } }): Promise<unknown>;
  };
  sequenceEnrollment: {
    findMany(args?: { where?: { status?: string; nextStepAt?: { lte?: Date } }; take?: number; orderBy?: { nextStepAt?: "asc" } }): Promise<
      Array<{ id: string; sequenceId: string; contactId: string; status: string; currentStep: number; nextStepAt: Date }>
    >;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    upsert(args: { where: { sequenceId_contactId: { sequenceId: string; contactId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<unknown>;
  };
  contact: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string; email: string; fullName: string; country: string | null; organization: string | null;
    } | null>;
  };
  inquiry: {
    findFirst(args: { where: { contactId: string }; orderBy: { createdAt: "desc" } }): Promise<{ marketingConsent: boolean } | null>;
  };
  suppressEntry: {
    findFirst(args: { where: { value: string; channel?: { in?: string[] } } }): Promise<{ id: string } | null>;
  };
}

export async function enrollContact(
  dbSeam: SequenceDb,
  sequenceId: string,
  contactId: string,
  variables?: Record<string, unknown>
): Promise<{ ok: boolean; message: string }> {
  const sequence = await dbSeam.automationSequence.findUnique({ where: { id: sequenceId } });
  if (!sequence) return { ok: false, message: "Sequence not found." };
  if (sequence.status !== "active") return { ok: false, message: "Sequence is not active (draft/paused)." };
  const steps = safeParseSteps(sequence.steps);
  if (!steps.length) return { ok: false, message: "Sequence has no valid steps." };
  await dbSeam.sequenceEnrollment.upsert({
    where: { sequenceId_contactId: { sequenceId, contactId } },
    create: {
      sequenceId, contactId, status: "active", currentStep: 0,
      nextStepAt: new Date(Date.now() + Math.max(0, steps[0].delayHours) * 3600_000),
      variables: variables ? JSON.stringify(variables).slice(0, 4000) : null,
    },
    update: { status: "active", updatedAt: new Date() },
  });
  await dbSeam.automationSequence.update({ where: { id: sequenceId }, data: { enrollCount: 1 } }).catch(() => undefined);
  return { ok: true, message: "Contact enrolled." };
}

function safeParseSteps(raw: string | null | undefined): SequenceStep[] {
  if (!raw) return [];
  try {
    const parsed = sequenceStepsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

// ─── Due-step processing (cron worker) ──────────────────────────────────────

export type EmailSendFn = (to: string, message: { subject: string; html: string; text: string }) => Promise<EmailSendResult>;

export interface ProcessSummary {
  processed: number;
  sent: number;
  skippedConsent: number;
  skippedSuppressed: number;
  skippedInvalid: number;
  completed: number;
  failed: number;
  outcomes: Array<{ enrollmentId: string; step: number; outcome: string; detail: string }>;
}

export async function processDueEnrollments(
  dbSeam: SequenceDb,
  options: { limit?: number; now?: Date; send?: EmailSendFn } = {}
): Promise<ProcessSummary> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const now = options.now ?? new Date();
  const send = options.send ?? ((to, message) => sendEmail(to, message));
  const summary: ProcessSummary = {
    processed: 0, sent: 0, skippedConsent: 0, skippedSuppressed: 0,
    skippedInvalid: 0, completed: 0, failed: 0, outcomes: [],
  };

  const due = await dbSeam.sequenceEnrollment.findMany({
    where: { status: "active", nextStepAt: { lte: now } },
    orderBy: { nextStepAt: "asc" },
    take: limit,
  });

  for (const enrollment of due) {
    summary.processed++;
    const record = (outcome: string, detail: string): void => {
      summary.outcomes.push({ enrollmentId: enrollment.id, step: enrollment.currentStep + 1, outcome, detail: detail.slice(0, 200) });
    };

    const sequence = await dbSeam.automationSequence.findUnique({ where: { id: enrollment.sequenceId } });
    const steps = safeParseSteps(sequence?.steps);
    const step = steps[enrollment.currentStep];
    if (!sequence || !steps.length || !step) {
      await dbSeam.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed", updatedAt: new Date() } });
      summary.completed++;
      record("completed", "Sequence ended (missing step or sequence removed).");
      continue;
    }
    if (sequence.status !== "active") {
      record("skipped_paused", "Sequence is paused; enrollment stays active for later.");
      continue;
    }

    const contact = await dbSeam.contact.findUnique({ where: { id: enrollment.contactId } });
    if (!contact?.email) {
      await dbSeam.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "bounced", updatedAt: new Date() } });
      summary.skippedInvalid++;
      record("bounced", "Contact is missing or has no email.");
      continue;
    }

    const suppressed = await dbSeam.suppressEntry.findFirst({
      where: { value: contact.email, channel: { in: ["all", "email"] } },
    });
    if (suppressed) {
      await dbSeam.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "cancelled", updatedAt: new Date() } });
      summary.skippedSuppressed++;
      record("cancelled_suppressed", "Email is on the suppression list.");
      continue;
    }

    const latestInquiry = await dbSeam.inquiry.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
    });
    if (!latestInquiry?.marketingConsent) {
      await dbSeam.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "cancelled", updatedAt: new Date() } });
      summary.skippedConsent++;
      record("cancelled_no_consent", "No marketing consent on the contact's latest inquiry — fail-closed cancel.");
      continue;
    }

    const subject = renderTemplate(step.subject, contact);
    const text = renderTemplate(step.bodyText, contact);
    const html = step.bodyHtml ? renderTemplate(step.bodyHtml, contact) : "";

    try {
      const result = await send(contact.email, { subject, text, html: html || `<pre>${escapeHtml(text)}</pre>` });
      if (result.actuallySent) {
        summary.sent++;
        const nextIndex = enrollment.currentStep + 1;
        if (nextIndex >= steps.length) {
          await dbSeam.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed", currentStep: nextIndex, updatedAt: new Date() } });
          summary.completed++;
          record("sent_completed", `Step ${nextIndex} sent via ${result.providerUsed}; sequence complete.`);
        } else {
          const nextDelay = Math.max(0, steps[nextIndex].delayHours);
          await dbSeam.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { currentStep: nextIndex, nextStepAt: new Date(Date.now() + nextDelay * 3600_000), updatedAt: new Date() },
          });
          record("sent", `Step ${nextIndex} sent via ${result.providerUsed}; next in ${nextDelay}h.`);
        }
      } else {
        summary.failed++;
        record("failed", result.error ?? `Provider ${result.providerUsed} did not send.`);
      }
    } catch (e) {
      summary.failed++;
      record("failed", (e as Error).message?.slice(0, 200) ?? "Send threw.");
    }
  }

  return summary;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
