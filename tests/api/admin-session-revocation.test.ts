import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { hashSync } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { apiBase, requireDisposableApi } from "../fixtures/api-target";

requireDisposableApi();

describe("executive session revocation against the disposable application", () => {
  it("revokes only the logged-out session and all sessions after reset", async () => {
    const sql = new DatabaseSync(process.env.DATABASE_URL!.slice(5));
    const suffix = randomUUID();
    const firstId = `a-${suffix}`;
    const secondId = `b-${suffix}`;
    const firstEmail = `${firstId}@example.invalid`;
    const secondEmail = `${secondId}@example.invalid`;
    const initial = "Initial-password-123!";
    const replacement = "Replacement-password-123!";
    const resetToken = randomUUID();
    const address = "198.51.100.87";
    const call = (path: string, body?: object, cookie?: string) => fetch(`${apiBase}${path}`, {
      method: body ? "POST" : "GET", redirect: "manual",
      headers: { "content-type": "application/json", "x-forwarded-for": address, ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
    });
    const login = async (email: string, password: string) => {
      const result = await call("/api/v1/auth/login", { email, password });
      expect(result.status).toBe(200);
      const cookie = result.headers.getSetCookie().find((v) => v.startsWith("auth_token="));
      expect(cookie).toBeTruthy();
      return cookie!.split(";")[0];
    };
    try {
      const insert = sql.prepare('INSERT INTO "User" (id,email,name,role,status,passwordHash,updatedAt) VALUES (?,?,?,?,?,?,?)');
      const hash = hashSync(initial, 12);
      insert.run(firstId, firstEmail, "First", "OWNER", "active", hash, new Date().toISOString());
      insert.run(secondId, secondEmail, "Second", "OWNER", "active", hash, new Date().toISOString());
      const first = await login(firstEmail, initial);
      const otherDevice = await login(firstEmail, initial);
      const otherUser = await login(secondEmail, initial);
      expect((await call("/api/v1/admin/dashboard", undefined, first)).status).toBe(200);
      expect((await call("/api/v1/auth/logout", {}, first)).status).toBe(200);
      expect((await call("/api/v1/admin/dashboard", undefined, first)).status).toBe(401);
      expect((await call("/api/v1/auth/session", undefined, first)).status).toBe(401);
      expect((await call("/admin", undefined, first)).status).toBe(307);
      expect((await call("/api/v1/admin/dashboard", undefined, otherDevice)).status).toBe(200);
      sql.prepare('UPDATE "User" SET passwordResetToken=?, passwordResetExpiresAt=? WHERE id=?')
        .run(resetToken, new Date(Date.now() + 600_000).toISOString(), firstId);
      expect((await call("/api/v1/auth/reset-password", { token: resetToken, password: replacement })).status).toBe(200);
      expect((await call("/api/v1/admin/dashboard", undefined, otherDevice)).status).toBe(401);
      expect((await call("/api/v1/admin/dashboard", undefined, otherUser)).status).toBe(200);
      const newCookie = await login(firstEmail, replacement);
      expect((await call("/api/v1/admin/dashboard", undefined, newCookie)).status).toBe(200);
    } finally {
      sql.prepare('DELETE FROM "AuditLog" WHERE actorId IN (?,?)').run(firstId, secondId);
      sql.prepare('DELETE FROM "AdminSession" WHERE userId IN (?,?)').run(firstId, secondId);
      sql.prepare('DELETE FROM "User" WHERE id IN (?,?)').run(firstId, secondId);
      sql.close();
    }
  }, 120_000);
});
