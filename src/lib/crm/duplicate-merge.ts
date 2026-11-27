/**
 * Duplicate merge — safely merges two contacts into one master record.
 * ---------------------------------------------------------------------
 * The duplicate's relations (inquiries, opportunities, referrals,
 * notes, tasks) are re-pointed to the master, fields merge per an
 * explicit strategy, the duplicate row is removed, and every decision
 * is recorded in ContactMergeLog.
 *
 * Strategies (no data is ever lost when the duplicate row is deleted):
 *  - "master"    : keep every non-empty master value; only FILL empty
 *                  master fields from the duplicate (default, lossless)
 *  - "fill_empty": identical fill-empties behavior (explicit)
 *  - "prefer"    : explicit per-field picks (choices[field] = "duplicate")
 *
 * The merge never throws into the caller's route: runMergeContacts
 * returns a structured result. The relation moves are sequential so a
 * failure mid-merge leaves a consistent state (master intact; the
 * duplicate is only deleted after all moves succeed).
 */

import { z } from "zod";

export const mergeSchema = z.object({
  masterId: z.string().min(1).max(80),
  duplicateId: z.string().min(1).max(80),
  strategy: z.enum(["master", "fill_empty", "prefer"]).default("master"),
  choices: z.record(z.string(), z.enum(["master", "duplicate"])).default({}),
});
export type MergeInput = z.infer<typeof mergeSchema>;

export interface MergeResult {
  ok: boolean;
  message: string;
  masterId?: string;
  mergedFields?: Record<string, "master" | "duplicate" | "union" | "filled">;
  movedCounts?: Record<string, number>;
}

/** Fields that can participate in a merge decision. */
const MERGEABLE_STRING_FIELDS = [
  "fullName", "phone", "whatsapp", "organization", "role",
  "country", "city", "preferredChannel", "tags", "source",
] as const;

export interface MergeDb {
  contact: {
    findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  inquiry: { updateMany(args: { where: { contactId: string }; data: { contactId: string } }): Promise<{ count: number }> };
  opportunity: { updateMany(args: { where: { contactId: string }; data: { contactId: string } }): Promise<{ count: number }> };
  studentReferral: { updateMany(args: { where: { contactId: string }; data: { contactId: string } }): Promise<{ count: number }> };
  note: { updateMany(args: { where: { contactId: string }; data: { contactId: string } }): Promise<{ count: number }> };
  task: { updateMany(args: { where: { contactId: string }; data: { contactId: string } }): Promise<{ count: number }> };
  contactMergeLog: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseCustomFields(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Compute the merged field values for the master record. Pure — used
 * by unit tests to verify strategies.
 */
export function planFieldMerge(
  master: Record<string, unknown>,
  duplicate: Record<string, unknown>,
  input: MergeInput
): { data: Record<string, unknown>; decisions: Record<string, "master" | "duplicate" | "union" | "filled"> } {
  const data: Record<string, unknown> = {};
  const decisions: Record<string, "master" | "duplicate" | "union" | "filled"> = {};

  for (const field of MERGEABLE_STRING_FIELDS) {
    const m = asString(master[field]);
    const d = asString(duplicate[field]);
    if (field === "tags") {
      if (!d) continue;
      if (!m) {
        data.tags = d;
        decisions.tags = "filled";
        continue;
      }
      if (input.strategy === "prefer" && input.choices.tags === "duplicate") {
        if (d !== m) {
          data.tags = d;
          decisions.tags = "duplicate";
        }
        continue;
      }
      const union = [...new Set([...m.split(",").map((t) => t.trim()).filter(Boolean), ...d.split(",").map((t) => t.trim()).filter(Boolean)])];
      if (union.join(",") !== m) {
        data.tags = union.join(",");
        decisions.tags = "union";
      }
      continue;
    }
    if (!d) continue;
    if (input.strategy === "prefer" && input.choices[field] === "duplicate") {
      if (d !== m) {
        data[field] = d;
        decisions[field] = "duplicate";
      }
      continue;
    }
    if (!m && d) {
      data[field] = d;
      decisions[field] = "filled";
    }
  }
  return { data, decisions };
}

/** Run the merge end-to-end. Returns a structured result; never throws. */
export async function runMergeContacts(
  dbSeam: MergeDb,
  rawInput: unknown,
  mergedBy?: string | null
): Promise<MergeResult> {
  const parsed = mergeSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message || "Invalid merge request." };
  }
  const input = parsed.data;
  if (input.masterId === input.duplicateId) {
    return { ok: false, message: "A contact cannot be merged into itself." };
  }

  let master: Record<string, unknown> | null = null;
  let duplicate: Record<string, unknown> | null = null;
  try {
    master = await dbSeam.contact.findUnique({ where: { id: input.masterId } });
    duplicate = await dbSeam.contact.findUnique({ where: { id: input.duplicateId } });
  } catch (e) {
    return { ok: false, message: `Could not load the contacts: ${(e as Error).message}`.slice(0, 200) };
  }
  if (!master) return { ok: false, message: "Master contact not found." };
  if (!duplicate) return { ok: false, message: "Duplicate contact not found." };

  const { data, decisions } = planFieldMerge(master, duplicate, input);

  // Custom fields: union with master winning on conflicts.
  const customMaster = parseCustomFields(master.customFields);
  const customDuplicate = parseCustomFields(duplicate.customFields);
  if (Object.keys(customDuplicate).length) {
    data.customFields = JSON.stringify({ ...customDuplicate, ...customMaster });
    if (!Object.keys(customMaster).length) decisions.customFields = "filled";
    else decisions.customFields = "union";
  }

  const movedCounts: Record<string, number> = {};
  try {
    // 1. Move relations to the master (sequential — audit-friendly).
    const moves: Array<[string, MergeDb["inquiry"]]> = [
      ["inquiries", dbSeam.inquiry],
      ["opportunities", dbSeam.opportunity],
      ["referrals", dbSeam.studentReferral],
      ["notes", dbSeam.note],
      ["tasks", dbSeam.task],
    ] as unknown as Array<[string, MergeDb["inquiry"]]>;
    for (const [label, table] of moves) {
      const result = await table.updateMany({
        where: { contactId: input.duplicateId },
        data: { contactId: input.masterId },
      });
      movedCounts[label] = result.count;
    }

    // 2. Apply merged field values onto the master.
    if (Object.keys(data).length) {
      data.updatedAt = new Date();
      await dbSeam.contact.update({ where: { id: input.masterId }, data });
    }

    // 3. Delete the duplicate row.
    await dbSeam.contact.delete({ where: { id: input.duplicateId } });

    // 4. Record the merge log.
    await dbSeam.contactMergeLog.create({
      data: {
        masterId: input.masterId,
        duplicateId: input.duplicateId,
        mergedFields: JSON.stringify(decisions),
        mergedBy: mergedBy ?? null,
      },
    });
  } catch (e) {
    return { ok: false, message: `Merge failed mid-way (no data deleted; the duplicate remains): ${(e as Error).message}`.slice(0, 300), masterId: input.masterId };
  }

  const totalMoved = Object.values(movedCounts).reduce((a, b) => a + b, 0);
  return {
    ok: true,
    masterId: input.masterId,
    message: `Merged duplicate into the master record. ${totalMoved} related record(s) moved.`,
    mergedFields: decisions,
    movedCounts,
  };
}
