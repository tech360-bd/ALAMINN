import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

describe("Task 01, 08, 10, 14, 15, 16 — Provisioning, CI, Portability & Repo Hygiene", () => {
  it("remote-setup.sh contains no hardcoded passwords, does not cat .env, and uses migrations instead of db push or sed schema edits", () => {
    const script = readFileSync(join(ROOT, "remote-setup.sh"), "utf8");
    const executableLines = script
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");

    expect(script).not.toContain("MyStrongPass123");
    expect(script).not.toContain("AlAminn#2026!Owner");
    expect(executableLines).not.toMatch(/\bcat\s+\.env\b/);
    expect(executableLines).not.toContain("prisma db push");
    expect(executableLines).not.toMatch(/sed\s+-i.*prisma\/schema\.prisma/);
    expect(executableLines).toContain("umask 077");
    expect(executableLines).toContain("chmod 600 .env");
    expect(executableLines).toContain("prisma.config.mysql.ts");
    expect(executableLines).toContain("scripts/apply-sqlite-migrations.mjs");
  });

  it("remote-setup.sh fails closed when DATABASE_URL or ADMIN_BOOTSTRAP_PASSWORD is missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alaminn-remote-setup-test-"));
    try {
      let exitCode = 0;
      let output = "";
      try {
        execFileSync("bash", [join(ROOT, "remote-setup.sh")], {
          cwd: tempDir,
          env: {
            PATH: process.env.PATH || "/usr/bin:/bin",
            HOME: tempDir,
          },
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        exitCode = e.status ?? 1;
        output = `${e.stdout || ""}\n${e.stderr || ""}`;
      }
      expect(exitCode).not.toBe(0);
      expect(output).toMatch(/DATABASE_URL must be provided/i);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("start-prod.sh defaults HOSTNAME to 0.0.0.0, uses [start-prod] prefix, and enforces chmod 600", () => {
    const script = readFileSync(join(ROOT, "start-prod.sh"), "utf8");
    expect(script).toContain('export HOSTNAME="${HOSTNAME:-0.0.0.0}"');
    expect(script).not.toContain("[start-pord]");
    expect(script).toContain("[start-prod]");
    expect(script).toContain("umask 077");
    expect(script).toContain("chmod 600");
  });

  it("GitHub workflows use valid action versions (@v4/@v5) and CI blocks on Prisma migration drift", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).not.toContain("@v7");
    expect(ci).toContain("actions/checkout@v4");
    expect(ci).toContain("actions/setup-node@v4");
    expect(ci).toContain("actions/setup-python@v5");
    expect(ci).toContain("SQLite Prisma schema drift detected");
    expect(ci).toContain("MariaDB Prisma schema drift detected");
    expect(ci).not.toContain("::warning::SQLite Prisma catalog drift detected");
    expect(ci).not.toContain("::warning::MariaDB Prisma catalog drift detected");
  });

  it("eliminates hardcoded /home/z/my-project developer paths from runtime, seed, and audit scripts", () => {
    const targets = [
      "src/app/api/uci/audit/route.ts",
      "prisma/seed-verified-universities.ts",
      "scripts/audit_existing_data.py",
      "scripts/extract_alo_dataset.py",
    ];
    for (const rel of targets) {
      const content = readFileSync(join(ROOT, rel), "utf8");
      expect(content, `${rel} must not contain /home/z/my-project`).not.toContain(
        "/home/z/my-project",
      );
    }
  });

  it("enforces single npm lockfile and removes unused submodule gitlinks and root clutter", () => {
    expect(existsSync(join(ROOT, "package-lock.json"))).toBe(true);
    expect(existsSync(join(ROOT, "bun.lock"))).toBe(false);
    expect(existsSync(join(ROOT, ".gitmodules"))).toBe(false);
    expect(existsSync(join(ROOT, "check-db.mjs"))).toBe(false);
    expect(existsSync(join(ROOT, "SHA256SUMS.txt"))).toBe(false);
    expect(existsSync(join(ROOT, "audit-site.js"))).toBe(false);
    expect(existsSync(join(ROOT, "scripts/audit-site.js"))).toBe(true);
  });
});
