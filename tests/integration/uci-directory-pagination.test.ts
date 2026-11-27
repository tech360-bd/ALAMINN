import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const database = execFileSync(process.execPath, ["tests/fixtures/init-sqlite.mjs"], { encoding: "utf8" }).trim();
  process.env.DATABASE_URL = `file:${database}`;
  return { database };
});
import { db } from "@/lib/db";
import { GET } from "@/app/api/uci/institutions/route";

beforeAll(async () => {
  for (let i = 0; i < 24; i++) {
    await db.uciInstitution.create({ data: {
      canonicalName: `Institution ${String(i).padStart(2, "0")}`, country: "Testland",
      institutionType: "UNIVERSITY",
      records: { create: { fieldsJson: JSON.stringify(i < 8 ? { pg_pte: "60" } : { ug_ielts: "6.0", ...(i < 21 ? { scholarship: "Available" } : {}) }), sourceFile: "test", sheet: "test", rowNumber: i } },
    } });
  }
});
afterAll(async () => { await db.$disconnect(); rmSync(dirname(database), { recursive: true, force: true }); });
async function directory(query: string) {
  const response = await GET(new NextRequest(`http://localhost/api/uci/institutions?${query}`));
  expect(response.status).toBe(200);
  return response.json();
}

describe("UCI directory filtered pagination", () => {
  it("filters before pagination and returns the full total across pages", async () => {
    const first = await directory("englishTest=ielts&pageSize=12&page=1");
    const last = await directory("englishTest=ielts&pageSize=12&page=2");
    expect(first.total).toBe(16);
    expect(first.totalPages).toBe(2);
    expect(first.items).toHaveLength(12);
    expect(last.items).toHaveLength(4);
    expect(first.items[0].canonicalName).toBe("Institution 08");
    expect(last.items[0].canonicalName).toBe("Institution 20");
  });
  it("combines filters and reports empty results accurately", async () => {
    const combined = await directory("englishTest=ielts&scholarship=1&country=Testland&pageSize=12&page=2");
    expect(combined.total).toBe(13);
    expect(combined.items).toHaveLength(1);
    const empty = await directory("englishTest=toefl&scholarship=1");
    expect(empty.total).toBe(0);
    expect(empty.items).toHaveLength(0);
  });
});
