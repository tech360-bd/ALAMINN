/**
 * MySQL/SQLite schema compatibility gate.
 * ----------------------------------------
 * Alaminn.info ships two Prisma schemas that must stay in lock-step:
 *
 *   prisma/schema.prisma        — local/dev runtime (SQLite, libsql adapter)
 *   prisma/schema.mysql.prisma  — production alaminn.info host (MySQL/MariaDB)
 *
 * The MySQL schema is a hand-translated mirror of the SQLite schema
 * (String → @db.VarChar(n) etc.). Nothing in the app guards that mirror
 * automatically, so this test pins the contract:
 *
 *   1. every model present in one schema exists in the other (no drift),
 *   2. every field of every model matches by name in both dialects,
 *   3. each schema declares the correct datasource provider,
 *   4. both datasources read DATABASE_URL from the environment (no
 *      filesystem paths or credentials baked into the repo).
 *
 * If a model or field is added to one schema only, this test fails and the
 * author must mirror the change before merging.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PRISMA_DIR = resolve(__dirname, "../../prisma");
const SQLITE_SCHEMA = resolve(PRISMA_DIR, "schema.prisma");
const MYSQL_SCHEMA = resolve(PRISMA_DIR, "schema.mysql.prisma");

/** Extract declared model names from a Prisma schema file. */
function modelNames(schema: string): string[] {
  const names: string[] = [];
  const re = /^model\s+(\w+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) names.push(m[1]);
  return names;
}

/** Extract the declared field names (columns) of a model body. */
function fieldNames(modelBody: string): string[] {
  const names: string[] = [];
  for (const raw of modelBody.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const m = /^(\w+)\s+\w+[\w\[\]]*(\s|$)/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/** Split a schema into `model Name { body }` map. */
function parseModels(schema: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) map.set(m[1], m[2]);
  return map;
}

/** Extract `provider = "..."` from the datasource block. */
function datasourceProvider(schema: string): string | undefined {
  const m = /datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/.exec(schema);
  return m?.[1];
}

function readSchema(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("mysql schema compatibility", () => {
  const sqlite = readSchema(SQLITE_SCHEMA);
  const mysql = readSchema(MYSQL_SCHEMA);

  it("finds both schema files in the repository", () => {
    expect(sqlite.length).toBeGreaterThan(1000);
    expect(mysql.length).toBeGreaterThan(1000);
  });

  it("declares the correct datasource provider per dialect", () => {
    expect(datasourceProvider(sqlite)).toBe("sqlite");
    expect(datasourceProvider(mysql)).toBe("mysql");
  });

  it("reads DATABASE_URL from the environment in both dialects", () => {
    expect(sqlite).toMatch(/datasource\s+\w+\s*\{[\s\S]*?url\s*=\s*env\("DATABASE_URL"\)/);
    expect(mysql).toMatch(/datasource\s+\w+\s*\{[\s\S]*?url\s*=\s*env\("DATABASE_URL"\)/);
    // No filesystem database paths or inline credentials in either schema.
    expect(mysql).not.toMatch(/file:/);
    expect(mysql).not.toMatch(/mysql:\/\/[^_]/); // env() indirection required
  });

  it("defines the same model set in both dialects (parity, no drift)", () => {
    const sqliteModels = modelNames(sqlite);
    const mysqlModels = modelNames(mysql);
    // Sanity floor: the platform carries 109 models today; a large drop
    // in either schema is always a mistake.
    expect(sqliteModels.length).toBeGreaterThanOrEqual(100);
    expect(mysqlModels.length).toBeGreaterThanOrEqual(100);
    expect(new Set(mysqlModels)).toEqual(new Set(sqliteModels));
  });

  it("mirrors every field of every model across dialects", () => {
    const sqliteModels = parseModels(sqlite);
    const mysqlModels = parseModels(mysql);
    expect(mysqlModels.size).toBe(sqliteModels.size);

    for (const [name, body] of sqliteModels) {
      const mysqlBody = mysqlModels.get(name);
      expect(mysqlBody, `model ${name} missing from schema.mysql.prisma`).toBeDefined();
      const sqliteFields = new Set(fieldNames(body));
      const mysqlFields = new Set(fieldNames(mysqlBody as string));
      const missingInMysql = [...sqliteFields].filter((f) => !mysqlFields.has(f));
      const missingInSqlite = [...mysqlFields].filter((f) => !sqliteFields.has(f));
      expect(
        missingInMysql,
        `model ${name}: fields missing in MySQL schema: ${missingInMysql.join(", ")}`,
      ).toEqual([]);
      expect(
        missingInSqlite,
        `model ${name}: fields missing in SQLite schema: ${missingInSqlite.join(", ")}`,
      ).toEqual([]);
    }
  });
});
