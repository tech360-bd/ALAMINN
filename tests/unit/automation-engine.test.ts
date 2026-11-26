import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  evaluateConditions,
  fireAutomationEvent,
  contactEventFields,
  type AutomationEventPayload,
  type AutomationDb,
} from "@/lib/automation/engine";

const payload = (fields: Record<string, unknown>): AutomationEventPayload => ({
  trigger: "contact.created",
  contactId: "c1",
  fields,
});

describe("condition evaluation", () => {
  it("supports all operators with honest edge behavior", () => {
    const p = payload({ "contact.leadScore": 82, "contact.country": "bangladesh", "contact.tags": "lead, whatsapp", "contact.organization": "" });
    expect(evaluateCondition(p, { field: "contact.leadScore", op: "gte", value: 80 })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.leadScore", op: "lt", value: 80 })).toBe(false);
    expect(evaluateCondition(p, { field: "contact.country", op: "eq", value: "Bangladesh" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.country", op: "neq", value: "india" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.tags", op: "contains", value: "whatsapp" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.tags", op: "not_contains", value: "vip" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.country", op: "in", value: "India,Bangladesh" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.tags", op: "starts_with", value: "lead" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.organization", op: "exists" })).toBe(false);
    expect(evaluateCondition(p, { field: "contact.fullName", op: "exists" })).toBe(false);
    expect(evaluateCondition(p, { field: "contact.leadScore", op: "gt", value: "abc" })).toBe(false);
  });

  it("matches case-insensitively and treats missing values as failures", () => {
    const p = payload({ "contact.status": "Active" });
    expect(evaluateCondition(p, { field: "contact.status", op: "eq", value: "ACTIVE" })).toBe(true);
    expect(evaluateCondition(p, { field: "contact.missing", op: "eq", value: "x" })).toBe(false);
  });

  it("requires ALL conditions to match", () => {
    const p = payload({ "contact.leadScore": 90 });
    expect(evaluateConditions(p, [{ field: "contact.leadScore", op: "gte", value: 80 }])).toBe(true);
    expect(evaluateConditions(p, [{ field: "contact.leadScore", op: "gte", value: 80 }, { field: "contact.leadScore", op: "lte", value: 50 }])).toBe(false);
  });
});

describe("fireAutomationEvent (stub db)", () => {
  function stubDb(): AutomationDb & { state: { tags: Record<string, string>; tasks: unknown[]; notifications: unknown[]; enrollments: unknown[]; stages: Record<string, string>; logs: unknown[] } } {
    const state = {
      tags: { c1: "lead" } as Record<string, string>,
      tasks: [] as unknown[],
      notifications: [] as unknown[],
      enrollments: [] as unknown[],
      stages: { o1: "new" } as Record<string, string>,
      logs: [] as unknown[],
    };
    const rules = [
      {
        id: "r1", name: "Hot lead", trigger: "contact.created",
        conditions: JSON.stringify([{ field: "contact.leadScore", op: "gte", value: 80 }]),
        actions: JSON.stringify([
          { type: "add_tag", params: { tag: "hot-lead" } },
          { type: "create_task", params: { title: "Follow up today", priority: "high" } },
          { type: "notify_staff", params: { roles: "CRM_MANAGER" } },
          { type: "set_status", params: { status: "nurturing" } },
        ]),
      },
      {
        id: "r2", name: "Never matches", trigger: "contact.created",
        conditions: JSON.stringify([{ field: "contact.leadScore", op: "lt", value: 10 }]),
        actions: JSON.stringify([{ type: "add_tag", params: { tag: "cold" } }]),
      },
    ];
    const dbSeam: AutomationDb & { state: typeof state } = {
      state,
      automationRule: {
        findMany: async () => rules,
        update: async () => ({}),
      },
      automationRunLog: { create: async ({ data }) => { state.logs.push(data); return {}; } },
      contact: {
        update: async ({ where: { id }, data }) => { if (data.tags !== undefined) state.tags[id] = data.tags as string; return {}; },
        findUnique: async ({ where: { id } }) => ({ id, tags: state.tags[id] ?? null, status: "active" }),
      },
      task: { create: async ({ data }) => { state.tasks.push(data); return {}; } },
      notification: { createMany: async ({ data }) => { state.notifications.push(...data); return {}; } },
      user: { findMany: async () => [{ id: "u1", role: "CRM_MANAGER" }] },
      sequenceEnrollment: {
        upsert: async ({ create }) => { state.enrollments.push(create); return {}; },
      },
      opportunity: {
        update: async ({ where: { id }, data }) => { state.stages[id] = data.stage as string; return {}; },
      },
    };
    return dbSeam;
  }

  it("runs matching rules, executes actions, records logs, skips non-matching", async () => {
    const dbSeam = stubDb();
    const results = await fireAutomationEvent(
      { trigger: "contact.created", contactId: "c1", fields: contactEventFields({ id: "c1", fullName: "Rahim", email: "r@x.com", tags: "lead", leadScore: 85 }) },
      dbSeam
    );
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.ruleId === "r1")?.status).toBe("success");
    expect(results.find((r) => r.ruleId === "r2")?.status).toBe("skipped");
    expect(dbSeam.state.tags.c1).toContain("hot-lead");
    expect(dbSeam.state.tasks[0]).toMatchObject({ title: "Follow up today", priority: "high" });
    expect(dbSeam.state.notifications).toHaveLength(1);
    expect(dbSeam.state.logs).toHaveLength(2);
  });

  it("rejects invalid action params honestly (status error, logged)", async () => {
    const dbSeam = stubDb();
    (dbSeam.automationRule.findMany as unknown as () => Promise<unknown[]> = async () => [
      { id: "rbad", name: "Bad", trigger: "contact.created", conditions: "[]", actions: JSON.stringify([{ type: "set_status", params: { status: "banana" } }]) },
    ]);
    const results = await fireAutomationEvent({ trigger: "contact.created", contactId: "c1", fields: {} }, dbSeam);
    expect(results[0].status).toBe("error");
    expect(results[0].outcomes[0].detail).toMatch(/Invalid status/i);
    expect(dbSeam.state.logs).toHaveLength(1);
  });
});
