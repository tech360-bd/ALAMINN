import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { apiBase, requireDisposableApi } from "../fixtures/api-target";

requireDisposableApi();

describe("admin password-reset concurrency on a disposable database", () => {
  it("atomically consumes a reset token once", async () => {
    const id = randomUUID();
    const email = `reset-${id}@example.invalid`;
    const token = randomUUID();
    const db = new DatabaseSync(process.env.DATABASE_URL!.slice(5));
    try {
      db.prepare('INSERT INTO "User" (id,email,name,role,status,passwordResetToken,passwordResetExpiresAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, email, "Reset test", "VIEWER", "active", token, new Date(Date.now() + 600_000).toISOString(), new Date().toISOString());
      const request = (password: string) => fetch(`${apiBase}/api/v1/auth/reset-password`, {
        method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.82` },
        body: JSON.stringify({ token, password }), signal: AbortSignal.timeout(20_000),
      });
      const results = await Promise.all([request("first-password-123"), request("second-password-123")]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect((await request("third-password-123")).status).toBe(400);
      const row = db.prepare('SELECT passwordResetToken, passwordHash FROM "User" WHERE id=?').get(id);
      expect(row?.passwordResetToken).toBeNull();
      expect(typeof row?.passwordHash).toBe("string");
    } finally {
      db.prepare('DELETE FROM "AuditLog" WHERE actorId=?').run(id);
      db.prepare('DELETE FROM "User" WHERE id=?').run(id);
      db.close();
    }
  }, 30_000);
});
