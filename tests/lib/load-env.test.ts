import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvConfig, resetEnvConfigLoader } from "@/lib/load-env";

const savedEnv = { ...process.env };

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "alaminn-env-"));
}

describe("loadEnvConfig", () => {
  beforeEach(() => {
    process.env = { ...savedEnv, NODE_ENV: "test", LOAD_ENV_CONFIG_IN_TEST: "1" };
    delete process.env.TEST_CANONICAL;
    delete process.env.TEST_LEGACY;
    delete process.env.TEST_PRECEDENCE;
    resetEnvConfigLoader();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    resetEnvConfigLoader();
    vi.restoreAllMocks();
  });

  it("loads canonical .env.config when present", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, ".env.config"), "TEST_CANONICAL=from-config\n");
    const res = loadEnvConfig(dir);
    expect(process.env.TEST_CANONICAL).toBe("from-config");
    expect(res.loaded).toContain(".env.config");
  });

  it("prefers process env over files", () => {
    const dir = tmpDir();
    process.env.TEST_PRECEDENCE = "from-process";
    fs.writeFileSync(path.join(dir, ".env.config"), "TEST_PRECEDENCE=from-file\n");
    loadEnvConfig(dir);
    expect(process.env.TEST_PRECEDENCE).toBe("from-process");
  });

  it("falls back to legacy .env only when canonical files are absent", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, ".env"), "TEST_LEGACY=from-legacy\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = loadEnvConfig(dir);
    expect(process.env.TEST_LEGACY).toBe("from-legacy");
    expect(res.legacyLoaded).toContain(".env");
    expect(warn).toHaveBeenCalled();
  });
});
