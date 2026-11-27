/**
 * Automation engine — event-triggered rules over CRM records.
 * ----------------------------------------------------------------
 * Trigger events (fired from CRM routes + the ecosystem bridge):
 *   contact.created | contact.updated | inquiry.created |
 *   opportunity.stage_changed | lead.score_changed
 *
 * A rule = trigger + conditions[] + actions[].
 *  - Conditions: { field, op, value } evaluated against the event
 *    payload (contact fields, score, stage, tags...). Ops: eq, neq,
 *    contains, not_contains, gt, gte, lt, lte, in, starts_with, exists.
 *  - Actions (all bounded + audited): add_tag, remove_tag, set_status,
 *    set_channel, create_task, notify_staff, enroll_sequence,
 *    move_stage, emit_webhook.
 *
 * HONESTY: every run is recorded in AutomationRunLog with the outcome
 * of each action. The engine NEVER throws into the caller's request
 * path — a broken rule logs an error row and stops.
 */

import { db } from "@/lib/db";
import { emitWebhookEvent } from "@/lib/api-platform/webhooks";

export const AUTOMATION_TRIGGERS = [
  "contact.created",
  "contact.updated",
  "inquiry.created",
  "opportunity.stage_changed",
  "lead.score_changed",
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_OPS = ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "in", "starts_with", "exists"] as const;
export type AutomationOp = (typeof AUTOMATION_OPS)[number];

export const AUTOMATION_ACTIONS = [
  "add_tag",
  "remove_tag",
  "set_status",
  "set_channel",
  "create_task",
  "notify_staff",
  "enroll_sequence",
  "move_stage",
  "emit_webhook",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number];

export interface AutomationCondition {
  field: string;
  op: AutomationOp;
  value?: string | number | boolean | null;
}

export interface AutomationAction {
  type: AutomationActionType;
  params?: Record<string, string | number | boolean | null>;
}

export interface AutomationEventPayload {
  trigger: AutomationTrigger;
  contactId?: string | null;
  /** Flat, dotted-path readable snapshot (e.g. { "contact.leadScore": 82 }). */
  fields: Record<string, unknown>;
  actorId?: string | null;
}

export interface ActionOutcome {
  action: AutomationActionType;
  ok: boolean;
  detail: string;
}

export interface RuleRunResult {
  ruleId: string;
  status: "success" | "skipped" | "error";
  outcomes: ActionOutcome[];
}

function readPath(payload: AutomationEventPayload, field: string): unknown {
  const rawKey = field.trim();
  if (rawKey in payload.fields) return payload.fields[rawKey];
  const normalized = rawKey.toLowerCase().replace(/\./g, "_");
  for (const [k, v] of Object.entries(payload.fields)) {
    if (k.toLowerCase().replace(/\./g, "_") === normalized) return v;
  }
  return undefined;
}

export function evaluateCondition(
  payload: AutomationEventPayload,
  condition: AutomationCondition
): boolean {
  const actual = readPath(payload, condition.field);
  const expected = condition.value;
  const actualStr = actual === null || actual === undefined ? null : String(actual).toLowerCase();
  const expectedStr = expected === null || expected === undefined ? null : String(expected).toLowerCase();
  const actualNum = typeof actual === "number" ? actual : Number(actual);
  const expectedNum = typeof expected === "number" ? expected : Number(expected);

  switch (condition.op) {
    case "eq":
      return actualStr !== null && expectedStr !== null && actualStr === expectedStr;
    case "neq":
      return actualStr === null || actualStr !== expectedStr;
    case "contains":
      return actualStr !== null && expectedStr !== null && actualStr.includes(expectedStr);
    case "not_contains":
      return actualStr === null || expectedStr === null || !actualStr.includes(expectedStr);
    case "starts_with":
      return actualStr !== null && expectedStr !== null && actualStr.startsWith(expectedStr);
    case "gt":
      return Number.isFinite(actualNum) && Number.isFinite(expectedNum) && actualNum > expectedNum;
    case "gte":
      return Number.isFinite(actualNum) && Number.isFinite(expectedNum) && actualNum >= expectedNum;
    case "lt":
      return Number.isFinite(actualNum) && Number.isFinite(expectedNum) && actualNum < expectedNum;
    case "lte":
      return Number.isFinite(actualNum) && Number.isFinite(expectedNum) && actualNum <= expectedNum;
    case "in": {
      if (expectedStr === null || actualStr === null) return false;
      const list = expectedStr.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.toLowerCase());
      return list.includes(actualStr);
    }
    case "exists":
      return actual !== null && actual !== undefined && actual !== "";
    default:
      return false;
  }
}

export function evaluateConditions(
  payload: AutomationEventPayload,
  conditions: AutomationCondition[]
): boolean {
  return conditions.every((c) => evaluateCondition(payload, c));
}

// ─── Action execution (structural seam over db for testability) ─────────────

export interface AutomationDb {
  automationRule: {
    findMany(args?: { where?: { status?: string; trigger?: string } }): Promise<
      Array<{ id: string; name: string; trigger: string; conditions: string; actions: string }>
    >;
    update(args: { where: { id: string }; data: { runCount?: number | { increment: number }; lastRunAt?: Date } }): Promise<unknown>;
  };
  automationRunLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  contact: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    findUnique(args: { where: { id: string } }): Promise<{ id: string; tags: string | null; status: string } | null>;
  };
  task: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  notification: { createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> };
  user: { findMany(args?: { where?: { role?: { in?: string[] } } }): Promise<Array<{ id: string; role: string }>> };
  sequenceEnrollment: {
    upsert(args: { where: { sequenceId_contactId: { sequenceId: string; contactId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<unknown>;
  };
  opportunity: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

function parseArray<T>(raw: string | undefined | null, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

async function executeAction(
  dbSeam: AutomationDb,
  action: AutomationAction,
  payload: AutomationEventPayload
): Promise<ActionOutcome> {
  const params = action.params ?? {};
  const contactId = payload.contactId ?? null;
  try {
    switch (action.type) {
      case "add_tag":
      case "remove_tag": {
        if (!contactId) return { action: action.type, ok: false, detail: "No contact in the event payload." };
        const tag = String(params.tag ?? "").trim();
        if (!tag) return { action: action.type, ok: false, detail: "Missing tag parameter." };
        const contact = await dbSeam.contact.findUnique({ where: { id: contactId } });
        if (!contact) return { action: action.type, ok: false, detail: "Contact no longer exists." };
        const current = (contact.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
        const next = action.type === "add_tag"
          ? (current.includes(tag) ? current : [...current, tag])
          : current.filter((t) => t !== tag);
        await dbSeam.contact.update({ where: { id: contactId }, data: { tags: next.join(",") || null } });
        return { action: action.type, ok: true, detail: `Tags now: ${next.join(", ") || "(none)"}.` };
      }
      case "set_status": {
        if (!contactId) return { action: action.type, ok: false, detail: "No contact in the event payload." };
        const status = String(params.status ?? "").trim();
        if (!["active", "nurturing", "converted", "archived"].includes(status)) {
          return { action: action.type, ok: false, detail: `Invalid status "${status}".` };
        }
        await dbSeam.contact.update({ where: { id: contactId }, data: { status } });
        return { action: action.type, ok: true, detail: `Status set to ${status}.` };
      }
      case "set_channel": {
        if (!contactId) return { action: action.type, ok: false, detail: "No contact in the event payload." };
        const channel = String(params.channel ?? "").trim();
        if (!["email", "phone", "whatsapp"].includes(channel)) {
          return { action: action.type, ok: false, detail: `Invalid channel "${channel}".` };
        }
        await dbSeam.contact.update({ where: { id: contactId }, data: { preferredChannel: channel } });
        return { action: action.type, ok: true, detail: `Preferred channel set to ${channel}.` };
      }
      case "create_task": {
        const title = String(params.title ?? "Follow up").trim().slice(0, 200);
        if (!title) return { action: action.type, ok: false, detail: "Missing task title." };
        const dueInHours = Number(params.dueInHours ?? 24);
        const dueDate = Number.isFinite(dueInHours) && dueInHours > 0 && dueInHours < 24 * 90
          ? new Date(Date.now() + dueInHours * 3600_000)
          : new Date(Date.now() + 24 * 3600_000);
        await dbSeam.task.create({
          data: {
            title,
            description: String(params.description ?? "").slice(0, 2000) || null,
            priority: ["low", "medium", "high", "critical"].includes(String(params.priority)) ? String(params.priority) : "medium",
            contactId,
            dueDate,
          },
        });
        return { action: action.type, ok: true, detail: `Task created: "${title}".` };
      }
      case "notify_staff": {
        const rolesParam = String(params.roles ?? "SUPER_ADMIN,CRM_MANAGER");
        const roles = rolesParam.split(",").map((r) => r.trim()).filter(Boolean);
        const users = await dbSeam.user.findMany({ where: { role: { in: roles } } });
        if (!users.length) return { action: action.type, ok: false, detail: `No users with roles ${roles.join(", ")} found.` };
        await dbSeam.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            type: "contact",
            title: String(params.title ?? "Automation notification").slice(0, 200),
            message: String(params.message ?? `Triggered by ${payload.trigger}`).slice(0, 500),
            link: contactId ? "/admin/contacts" : null,
          })),
        });
        return { action: action.type, ok: true, detail: `Notified ${users.length} staff member(s).` };
      }
      case "enroll_sequence": {
        const sequenceId = String(params.sequenceId ?? "").trim();
        if (!sequenceId) return { action: action.type, ok: false, detail: "Missing sequenceId parameter." };
        if (!contactId) return { action: action.type, ok: false, detail: "No contact in the event payload." };
        await dbSeam.sequenceEnrollment.upsert({
          where: { sequenceId_contactId: { sequenceId, contactId } },
          create: { sequenceId, contactId, status: "active", currentStep: 0, nextStepAt: new Date() },
          update: { status: "active", updatedAt: new Date() },
        });
        return { action: action.type, ok: true, detail: `Contact enrolled into sequence ${sequenceId}.` };
      }
      case "move_stage": {
        const opportunityId = String(params.opportunityId ?? payload.fields["opportunity.id"] ?? "").trim();
        const stage = String(params.stage ?? "").trim();
        if (!opportunityId) return { action: action.type, ok: false, detail: "No opportunity in the event payload." };
        const VALID = ["new", "review-required", "qualified", "discovery-scheduled", "discovery-completed", "scope-required", "proposal-drafting", "proposal-sent", "negotiation", "approved", "in-progress", "won", "lost", "on-hold", "archived"];
        if (!VALID.includes(stage)) return { action: action.type, ok: false, detail: `Invalid stage "${stage}".` };
        await dbSeam.opportunity.update({ where: { id: opportunityId }, data: { stage } });
        return { action: action.type, ok: true, detail: `Opportunity moved to ${stage}.` };
      }
      case "emit_webhook": {
        const event = String(params.event ?? "").trim() as Parameters<typeof emitWebhookEvent>[0];
        const result = await emitWebhookEvent(event, { contactId, trigger: payload.trigger });
        return { action: action.type, ok: true, detail: `Webhook ${event} → ${result.delivered}/${result.endpoints} delivered.` };
      }
      default:
        return { action: action.type, ok: false, detail: "Unknown action type." };
    }
  } catch (e) {
    return { action: action.type, ok: false, detail: (e as Error).message?.slice(0, 200) ?? "Action failed." };
  }
}

/**
 * Fire an automation event: load matching active rules, evaluate
 * conditions, run actions, record the run. Never throws.
 */
export async function fireAutomationEvent(
  payload: AutomationEventPayload,
  dbSeam: AutomationDb = db as unknown as AutomationDb
): Promise<RuleRunResult[]> {
  const results: RuleRunResult[] = [];
  let rules: Array<{ id: string; name: string; trigger: string; conditions: string; actions: string }> = [];
  try {
    rules = await dbSeam.automationRule.findMany({
      where: { status: "active", trigger: payload.trigger },
    });
  } catch {
    return results; // DB unavailable — nothing to run
  }

  for (const rule of rules) {
    const conditions = parseArray<AutomationCondition>(rule.conditions, []);
    const actions = parseArray<AutomationAction>(rule.actions, []);
    const outcomes: ActionOutcome[] = [];
    let status: RuleRunResult["status"] = "success";

    try {
      if (!evaluateConditions(payload, conditions)) {
        status = "skipped";
      } else {
        for (const action of actions) {
          const outcome = await executeAction(dbSeam, action, payload);
          outcomes.push(outcome);
          if (!outcome.ok) status = "error";
        }
        await dbSeam.automationRule
          .update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } })
          .catch(() => undefined);
      }
    } catch (e) {
      status = "error";
      outcomes.push({ action: "add_tag", ok: false, detail: (e as Error).message?.slice(0, 200) ?? "Rule failed." });
    }

    try {
      await dbSeam.automationRunLog.create({
        data: {
          ruleId: rule.id,
          trigger: payload.trigger,
          contactId: payload.contactId ?? null,
          status,
          detail: JSON.stringify(outcomes).slice(0, 4000),
        },
      });
    } catch {
      /* non-fatal */
    }

    results.push({ ruleId: rule.id, status, outcomes });
  }
  return results;
}

/** Build the standard event payload for a contact. */
export function contactEventFields(contact: {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  tags?: string | null;
  country?: string | null;
  organization?: string | null;
  leadScore?: number | null;
  leadScoreGrade?: string | null;
  source?: string | null;
}): Record<string, unknown> {
  return {
    "contact.id": contact.id,
    "contact.fullName": contact.fullName ?? "",
    "contact.email": contact.email ?? "",
    "contact.phone": contact.phone ?? "",
    "contact.status": contact.status ?? "",
    "contact.tags": contact.tags ?? "",
    "contact.country": contact.country ?? "",
    "contact.organization": contact.organization ?? "",
    "contact.leadScore": contact.leadScore ?? 0,
    "contact.leadScoreGrade": contact.leadScoreGrade ?? "",
    "contact.source": contact.source ?? "",
  };
}
