import { describe, it, expect } from "vitest";
import { planFieldMerge, runMergeContacts, type MergeDb } from "@/lib/crm/duplicate-merge";

const master = { id: "m1", fullName: "Rahim Uddin", email: "rahim@example.com", phone: "", organization: "Tech360", tags: "lead,whatsapp", country: "Bangladesh", customFields: "{\"intake\":\"September\"}" };
const duplicate = { id: "d1", fullName: "Rahim U.", email: "rahimuddin@example.com", phone: "01712345678", organization: "", tags: "hot-lead", country: "", customFields: "{\"budget\":\"5000\"}" };

describe("planFieldMerge", () => {
  it("keeps master values with strategy=master and unions tags", () => {
    const { data, decisions } = planFieldMerge(master, duplicate, { masterId: "m1", duplicateId: "d1", strategy: "master", choices: {} });
    expect(data.phone).toBe("01712345678"); // empty master field still fills from duplicate
    expect(data.tags).toBe("lead,whatsapp,hot-lead");
    expect(decisions.tags).toBe("union");
    expect(data.organization).toBeUndefined();
  });

  it("fills only empty master fields with strategy=fill_empty", () => {
    const { data } = planFieldMerge(master, duplicate, { masterId: "m1", duplicateId: "d1", strategy: "fill_empty", choices: {} });
    expect(data.phone).toBe("01712345678");
    expect(data.organization).toBeUndefined(); // master already has one
    expect(data.country).toBeUndefined();
  });

  it("respects explicit per-field choices with strategy=prefer", () => {
    const { data, decisions } = planFieldMerge(master, duplicate, { masterId: "m1", duplicateId: "d1", strategy: "prefer", choices: { fullName: "duplicate", tags: "duplicate" } });
    expect(data.fullName).toBe("Rahim U.");
    expect(data.tags).toBe("hot-lead");
    expect(decisions.fullName).toBe("duplicate");
  });
});

function stubDb(): MergeDb & { moves: Array<[string, string]>; deleted: string[]; logs: Array<Record<string, unknown>> } {
  const state = { moves: [] as Array<[string, string]>, deleted: [] as string[], logs: [] as Array<Record<string, unknown>> };
  const rows: Record<string, unknown> = { m1: { ...master }, d1: { ...duplicate } };
  const updateMany = (label: string) => async (args: { where: { contactId: string }; data: { contactId: string } }) => {
    state.moves.push([label, args.where.contactId]);
    return { count: args.where.contactId === "d1" ? 1 : 0 };
  };
  const dbSeam: MergeDb & typeof state = {
    ...state,
    contact: {
      findUnique: async ({ where: { id } }) => rows[id] ?? null,
      update: async () => ({}),
      delete: async ({ where: { id } }) => { state.deleted.push(id); return {}; },
    },
    inquiry: { updateMany: updateMany("inquiries") },
    opportunity: { updateMany: updateMany("opportunities") },
    studentReferral: { updateMany: updateMany("referrals") },
    note: { updateMany: updateMany("notes") },
    task: { updateMany: updateMany("tasks") },
    contactMergeLog: { create: async ({ data }) => { state.logs.push(data); return {}; } },
  };
  return dbSeam;
}

describe("runMergeContacts", () => {
  it("merges a duplicate: relations move, duplicate is deleted, log written", async () => {
    const dbSeam = stubDb();
    const result = await runMergeContacts(dbSeam, { masterId: "m1", duplicateId: "d1", strategy: "fill_empty", choices: {} }, "user1");
    expect(result.ok).toBe(true);
    expect(result.masterId).toBe("m1");
    expect(dbSeam.moves.every(([, from]) => from === "d1")).toBe(true);
    expect(dbSeam.deleted).toEqual(["d1"]);
    expect(dbSeam.logs[0]).toMatchObject({ masterId: "m1", duplicateId: "d1", mergedBy: "user1" });
  });

  it("rejects self-merges and unknown contacts honestly", async () => {
    const dbSeam = stubDb();
    const self = await runMergeContacts(dbSeam, { masterId: "m1", duplicateId: "m1", strategy: "master", choices: {} });
    expect(self.ok).toBe(false);
    expect(self.message).toMatch(/itself/i);
    const missing = await runMergeContacts(dbSeam, { masterId: "m1", duplicateId: "nope", strategy: "master", choices: {} });
    expect(missing.ok).toBe(false);
    expect(missing.message).toMatch(/not found/i);
    expect(dbSeam.deleted).toEqual([]);
  });

  it("reports failure and keeps the duplicate when a mid-merge step throws", async () => {
    const dbSeam = stubDb();
    (dbSeam.task.updateMany as unknown as () => Promise<never>) = async () => { throw new Error("db exploded"); };
    const result = await runMergeContacts(dbSeam, { masterId: "m1", duplicateId: "d1", strategy: "master", choices: {} });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Merge failed mid-way/i);
    expect(dbSeam.deleted).toEqual([]); // duplicate intact
  });
});
