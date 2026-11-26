import { describe, it, expect } from "vitest";
import { parseCsv, autoMapHeaders, rowToContact, runContactImport, customValuesFromRow, type ContactImportDb } from "@/lib/crm/csv-import";
import type { CustomFieldDef } from "@/lib/crm/custom-fields";

function stubDb(existing: Array<{ id: string; email: string; phone: string | null; fullName: string }> = []): ContactImportDb & { created: Array<Record<string, unknown>>; updated: Array<{ id: string }> } {
  const state = { created: [] as Array<Record<string, unknown>>, updated: [] as Array<{ id: string }> };
  const dbSeam: ContactImportDb & typeof state = {
    ...state,
    contact: {
      findMany: async (args) => existing.filter((c) => args?.where?.email ? c.email === args.where.email : true),
      create: async ({ data }) => { const row = { id: `c${state.created.length + 1}` }; state.created.push(data); return row; },
      update: async ({ where }) => { state.updated.push({ id: where.id }); return { id: where.id }; },
    },
    customField: { findMany: async () => [] as CustomFieldDef[] },
    contactImportJob: {
      create: async () => ({ id: "job1" }),
      update: async () => ({ id: "job1" }),
    },
  };
  return dbSeam;
}

describe("CSV parsing (RFC 4180)", () => {
  it("parses headers, quoted cells, embedded quotes, commas and CRLF", () => {
    const csv = 'Name,Email,Notes\n"Uddin, Rahim",rahim@example.com,"He said ""hi""\r\nsecond line"\n';
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(["Name", "Email", "Notes"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0][0]).toBe("Uddin, Rahim");
    expect(parsed.rows[0][2]).toContain('"hi"');
    expect(parsed.rows[0][2]).toContain("second line");
  });

  it("drops fully-empty trailing rows and strips a BOM", () => {
    const parsed = parseCsv("\uFEFFa,b\n1,2\n\n\n");
    expect(parsed.headers).toEqual(["a", "b"]);
    expect(parsed.rows).toEqual([["1", "2"]]);
  });
});

describe("header mapping", () => {
  it("auto-maps common aliases and skips repeated targets", () => {
    const map = autoMapHeaders(["FULL NAME", "E-mail", "Phone number", "Company"]);
    expect(map[0]).toBe("fullName");
    expect(map[1]).toBe("email");
    expect(map[2]).toBe("phone");
    expect(map[3]).toBe("organization");
  });

  it("applies explicit mapping over the auto-map and trims values", () => {
    const row = rowToContact(["Name", "Contact", "Mobile"], [" Rahim ", " rahim@example.com ", "01712345678"], autoMapHeaders(["Name", "Contact", "Mobile"]), { Contact: "email", Mobile: "phone" });
    expect(row.email).toBe("rahim@example.com");
    expect(row.phone).toBe("01712345678");
    expect(row.fullName).toBe("Rahim");
  });
});

describe("runContactImport", () => {
  it("creates new rows with scores and skips invalid rows honestly", async () => {
    const dbSeam = stubDb();
    const summary = await runContactImport(dbSeam, {
      csv: "Full Name,Email,Phone\nRahim,rahim@example.com,01712345678\nKarim,\n",
      filename: "leads.csv",
      strategy: "upsert",
    });
    expect(summary.status).toBe("completed");
    expect(summary.totalRows).toBe(2);
    expect(summary.createdRows).toBe(1);
    expect(summary.skippedRows).toBe(1);
    expect(summary.report[0].outcome).toBe("created");
    expect(summary.report[1].outcome).toBe("skipped_invalid");
    expect(dbSeam.created[0]).toMatchObject({ email: "rahim@example.com", fullName: "Rahim" });
    expect(dbSeam.created[0].leadScore).toBeGreaterThan(0);
    expect(dbSeam.created[0].leadScoreUpdatedAt).toBeInstanceOf(Date);
  });

  it("upserts by email and counts phone-only matches as duplicates", async () => {
    const dbSeam = stubDb([{ id: "existing", email: "rahim@example.com", phone: "01712345678", fullName: "Rahim" }]);
    const upsert = await runContactImport(dbSeam, {
      csv: "Email,Full Name\nrahim@example.com,Rahim Updated\nnew@example.com,New Person\n",
      filename: "a.csv",
      strategy: "upsert",
    });
    expect(upsert.updatedRows).toBe(1);
    expect(upsert.createdRows).toBe(1);

    const dup = stubDb([{ id: "existing", email: "other@example.com", phone: "01712345678", fullName: "Someone" }]);
    const summary = await runContactImport(dup, {
      csv: "Email,Full Name,Phone\nfresh@example.com,Fresh Lead,01712345678\n",
      filename: "b.csv",
      strategy: "upsert",
    });
    expect(summary.duplicateRows).toBe(1);
    expect(summary.report[0].outcome).toBe("skipped_duplicate");
  });

  it("rejects oversized CSVs and rows without a header", async () => {
    await expect(runContactImport(stubDb(), { csv: "\n\n", filename: "x.csv" })).rejects.toThrow(/header/i);
    await expect(
      runContactImport(stubDb(), { csv: "a\n" + "b\n".repeat(5001), filename: "big.csv" })
    ).rejects.toThrow(/limit/i);
  });

  it("collects custom-field-shaped headers into validated custom values", () => {
    const defs: CustomFieldDef[] = [
      { id: "1", entity: "contact", key: "preferred_intake", label: "Preferred intake", type: "select", options: "September,January", required: false, sortOrder: 0, status: "active" },
    ];
    const values = customValuesFromRow(["preferred_intake"], ["September"], defs);
    expect(values).toEqual({ preferred_intake: "September" });
    const invalid = customValuesFromRow(["preferred_intake"], ["June"], defs);
    expect(invalid).toBeNull();
  });
});
