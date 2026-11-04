import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Deployment workflow tests (per spec §17).
 *
 * These tests validate the deploy.yml + versioned-release.yml YAML files
 * for correctness WITHOUT requiring a live server or GitHub Actions runner.
 * They check:
 *   - Deployment-disabled behavior (DEPLOY_ENABLED gate)
 *   - Required secrets presence (YAML references)
 *   - PM2 app name + port correctness (no alaminn-info/3076)
 *   - Pinned host key usage (no ssh-keyscan)
 *   - Tailscale auth step presence
 *   - Health check endpoint correctness
 *   - Rollback behavior (last-known-good marker, not arbitrary mtime)
 *   - Tag generation validity (no %n, no git rev-short)
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const DEPLOY_YML = readFileSync(join(REPO_ROOT, ".github/workflows/deploy.yml"), "utf8");
const VERSIONED_RELEASE_YML = readFileSync(join(REPO_ROOT, ".github/workflows/versioned-release.yml"), "utf8");

// Helper: strip YAML comments (# ...) so tests check actual code, not documentation.
function stripComments(yaml: string): string {
  return yaml.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
}

describe("deploy.yml — production CI/CD spec compliance", () => {
  describe("spec §3 — DEPLOY_ENABLED gate", () => {
    it("references the DEPLOY_ENABLED variable", () => {
      expect(DEPLOY_YML).toContain("DEPLOY_ENABLED");
    });
    it("checks that DEPLOY_ENABLED is 'true' before proceeding", () => {
      expect(DEPLOY_YML).toContain("vars.DEPLOY_ENABLED");
      expect(DEPLOY_YML).toMatch(/if.*\$VALUE.*!=.*true/i);
    });
    it("fails the guard job when DEPLOY_ENABLED is not true", () => {
      expect(DEPLOY_YML).toMatch(/exit 1/);
    });
  });

  describe("spec §2 — required secrets", () => {
    const requiredSecrets = [
      "DEPLOY_HOST", "DEPLOY_HOST_KEY", "DEPLOY_SSH_KEY", "DEPLOY_USER",
      "DEPLOY_PORT", "TS_OAUTH_CLIENT_ID", "TS_OAUTH_SECRET",
    ];
    for (const secret of requiredSecrets) {
      it(`references secret ${secret}`, () => {
        expect(DEPLOY_YML).toContain(`secrets.${secret}`);
      });
    }
  });

  describe("spec §4 — Tailscale authentication", () => {
    it("uses the tailscale/github-action", () => {
      expect(DEPLOY_YML).toContain("tailscale/github-action");
    });
    it("passes TS_OAUTH_CLIENT_ID and TS_OAUTH_SECRET", () => {
      expect(DEPLOY_YML).toContain("TS_OAUTH_CLIENT_ID");
      expect(DEPLOY_YML).toContain("TS_OAUTH_SECRET");
    });
    it("uses an authorized tag", () => {
      expect(DEPLOY_YML).toContain("tags:");
      expect(DEPLOY_YML).toMatch(/TS_TAG|ci-deploy/);
    });
  });

  describe("spec §5 — pinned SSH host key (no ssh-keyscan)", () => {
    it("references DEPLOY_HOST_KEY secret", () => {
      expect(DEPLOY_YML).toContain("DEPLOY_HOST_KEY");
    });
    it("does NOT use ssh-keyscan in code", () => {
      expect(stripComments(DEPLOY_YML)).not.toMatch(/ssh-keyscan/);
    });
    it("writes the pinned key to known_hosts", () => {
      expect(DEPLOY_YML).toContain("known_hosts");
      expect(DEPLOY_YML).toContain("DEPLOY_HOST_KEY");
    });
    it("uses StrictHostKeyChecking=yes", () => {
      expect(DEPLOY_YML).toContain("StrictHostKeyChecking=yes");
    });
  });

  describe("spec §6 — correct PM2 app name + port", () => {
    it("uses PM2 app name 'alaminn' (not 'alaminn-info')", () => {
      expect(DEPLOY_YML).toContain("pm2 reload alaminn");
      expect(DEPLOY_YML).toContain("pm2 restart alaminn");
      expect(stripComments(DEPLOY_YML)).not.toMatch(/pm2\s+(reload|restart|start|stop)\s+alaminn-info\b/);
    });
    it("uses port 3056 for health checks (not 3076)", () => {
      expect(DEPLOY_YML).toContain("127.0.0.1:3056");
      expect(stripComments(DEPLOY_YML)).not.toContain("127.0.0.1:3076");
      expect(stripComments(DEPLOY_YML)).not.toMatch(/curl.*3076/);
    });
    it("uses correct application directory /home/alamin/alaminn", () => {
      expect(DEPLOY_YML).toContain("/home/");
      expect(DEPLOY_YML).toContain("alaminn");
      expect(DEPLOY_YML).not.toContain("/var/www/alaminn-info");
    });
  });

  describe("spec §8 — build and test exact commit", () => {
    it("checks out the exact target SHA", () => {
      expect(DEPLOY_YML).toContain("ref: ${{ needs.guard.outputs.sha }}");
    });
    it("verifies artifact checksum before deploy", () => {
      expect(DEPLOY_YML).toContain("sha256sum");
      expect(DEPLOY_YML).toContain("checksum");
    });
  });

  describe("spec §9 — health checks + atomic activation + rollback", () => {
    it("checks /api/health endpoint", () => {
      expect(DEPLOY_YML).toContain("/api/health");
    });
    it("performs authn-negative check (admin API must reject anonymous)", () => {
      expect(DEPLOY_YML).toContain("/api/v1/admin/dashboard");
      expect(DEPLOY_YML).toMatch(/401|403/);
    });
    it("performs public route smoke checks", () => {
      expect(DEPLOY_YML).toContain("/higher-study");
      expect(DEPLOY_YML).toContain("/english-learning");
    });
    it("uses atomic symlink swap (ln -sfn + mv -Tf)", () => {
      expect(DEPLOY_YML).toContain("ln -sfn");
      expect(DEPLOY_YML).toContain("mv -Tf");
    });
    it("writes a last-known-good marker after successful deploy", () => {
      expect(DEPLOY_YML).toContain(".last-good-release");
    });
    it("has trap-based automatic rollback on failure", () => {
      expect(DEPLOY_YML).toContain("trap");
      expect(DEPLOY_YML).toContain("record_failure");
    });
  });

  describe("spec §10 — no destructive DB commands", () => {
    it("does NOT run prisma migrate deploy", () => {
      expect(stripComments(DEPLOY_YML)).not.toMatch(/prisma migrate deploy/);
    });
    it("does NOT run db:seed", () => {
      expect(stripComments(DEPLOY_YML)).not.toMatch(/db:seed/);
    });
    it("runs only read-only prisma migrate status", () => {
      expect(DEPLOY_YML).toContain("prisma migrate status");
    });
  });

  describe("spec §13 — no credentials in logs", () => {
    it("does not echo DEPLOY_SSH_KEY contents", () => {
      expect(stripComments(DEPLOY_YML)).not.toMatch(/echo.*DEPLOY_SSH_KEY/);
    });
    it("does not echo DEPLOY_HOST_KEY contents to stdout/logs", () => {
      const noCommentsNoKnownHosts = stripComments(DEPLOY_YML)
        .split("\n").filter((l) => !l.includes("known_hosts")).join("\n");
      expect(noCommentsNoKnownHosts).not.toMatch(/echo.*DEPLOY_HOST_KEY/);
    });
  });

  describe("spec §16 — preflight mode", () => {
    it("has a preflight_only input", () => {
      expect(DEPLOY_YML).toContain("preflight_only");
    });
    it("skips build/deploy when preflight_only is true", () => {
      expect(DEPLOY_YML).toMatch(/if.*preflight_only.*!=.*true/);
    });
  });
});

describe("versioned-release.yml — tag generation + rollback (spec §15)", () => {
  describe("tag generation fixes", () => {
    it("does NOT use %n (newline) in date format", () => {
      expect(stripComments(VERSIONED_RELEASE_YML)).not.toContain("%n%H");
    });
    it("uses %M for minutes (correct)", () => {
      expect(VERSIONED_RELEASE_YML).toContain("%H%M%S");
    });
    it("does NOT use invalid 'git rev-short'", () => {
      expect(stripComments(VERSIONED_RELEASE_YML)).not.toContain("git rev-short");
    });
    it("uses 'git rev-parse --short' (correct)", () => {
      expect(VERSIONED_RELEASE_YML).toContain("git rev-parse --short");
    });
    it("has permissions: contents: write for tag push", () => {
      expect(VERSIONED_RELEASE_YML).toContain("contents: write");
    });
    it("has idempotency guard (refuses to overwrite existing tag)", () => {
      expect(VERSIONED_RELEASE_YML).toContain("already exists");
    });
  });

  describe("rollback behavior fixes", () => {
    it("restores the release recorded in .last-good-release (not arbitrary mtime)", () => {
      expect(VERSIONED_RELEASE_YML).toContain(".last-good-release");
      expect(VERSIONED_RELEASE_YML).not.toMatch(/ls -1dt.*head -3.*tail -1/);
    });
    it("uses PM2 app name 'alaminn' (not 'alaminn-info')", () => {
      expect(VERSIONED_RELEASE_YML).toContain("pm2 reload alaminn");
      const noComments = stripComments(VERSIONED_RELEASE_YML);
      expect(noComments).not.toMatch(/pm2\s+(reload|restart|start|stop)\s+alaminn-info\b/);
    });
    it("uses port 3056 for health checks (not 3076)", () => {
      expect(VERSIONED_RELEASE_YML).toContain("127.0.0.1:3056");
      const noComments = stripComments(VERSIONED_RELEASE_YML);
      expect(noComments).not.toContain("127.0.0.1:3076");
      expect(noComments).not.toMatch(/curl.*3076/);
    });
    it("verifies health after rollback", () => {
      expect(VERSIONED_RELEASE_YML).toContain("Post-rollback health check");
    });
    it("uses Tailscale auth", () => {
      expect(VERSIONED_RELEASE_YML).toContain("tailscale/github-action");
    });
    it("uses pinned host key (no ssh-keyscan)", () => {
      expect(VERSIONED_RELEASE_YML).toContain("DEPLOY_HOST_KEY");
      expect(stripComments(VERSIONED_RELEASE_YML)).not.toContain("ssh-keyscan");
    });
  });

  describe("list action", () => {
    it("has a 'list' workflow_dispatch action", () => {
      expect(VERSIONED_RELEASE_YML).toContain("list");
    });
  });
});

describe("webpack.yml removed (spec: dead workflow)", () => {
  it("webpack.yml does not exist", () => {
    const webpackPath = join(REPO_ROOT, ".github/workflows/webpack.yml");
    expect(existsSync(webpackPath)).toBe(false);
  });
});
