/**
 * Authentication Middleware for AI API Gateway
 * ====================================================
 * Verifies HMAC-signed session tokens (`userId.role.expiresAt.sig`)
 * using `resolveAuthSecret()` and enforces role-based permissions.
 */

import { createHmac as nodeCreateHmac, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { resolveAuthSecret } from "@/lib/auth/secret";

export interface AuthMiddlewareOptions {
  skipPaths?: string[];
  requireAuth?: boolean;
}

export class AuthMiddleware {
  private static readonly COOKIE_NAME = "alaminn_session";

  /**
   * Sign a gateway session token (`userId.role.expiresAt.sig`).
   */
  public static signSessionToken(
    userId: string,
    role: string,
    expiresAtSec: number = Math.floor(Date.now() / 1000) + 3600,
    authSecret: string = resolveAuthSecret(),
  ): string {
    const payload = `${userId}.${role}.${expiresAtSec}`;
    const sig = nodeCreateHmac("sha256", authSecret)
      .update(payload)
      .digest("hex");
    return `${payload}.${sig}`;
  }

  /**
   * Verify a signed session token.
   */
  private static verifyToken(
    token: string,
    authSecret: string,
  ): { valid: boolean; payload?: string } {
    const lastDot = token.lastIndexOf(".");
    if (lastDot < 0) return { valid: false };

    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = nodeCreateHmac("sha256", authSecret)
      .update(payload)
      .digest("hex");

    try {
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length) return { valid: false };
      if (!nodeTimingSafeEqual(a, b)) return { valid: false };
      return { valid: true, payload };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Extract session from request headers or cookie.
   */
  private static extractSession(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      for (const cookie of cookies) {
        const [name, value] = cookie.split("=");
        if (name === this.COOKIE_NAME) {
          return value ?? null;
        }
      }
    }

    return null;
  }

  /**
   * Create middleware for authentication.
   * Always enforces HMAC token verification and rejects unauthenticated callers with 401.
   */
  static authenticate(
    _options: AuthMiddlewareOptions = {},
  ): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const authSecret = resolveAuthSecret();
      const token = this.extractSession(req);

      if (!token) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
        return;
      }

      const result = this.verifyToken(token, authSecret);

      if (!result.valid || !result.payload) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Invalid or expired session token",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
        return;
      }

      const parts = result.payload.split(".");
      if (parts.length !== 3) {
        res.status(401).json({
          success: false,
          error: {
            code: "INVALID_SESSION",
            message: "Invalid session format",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
        return;
      }

      const [userId, role, expiresAtStr] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);

      if (isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
        res.status(401).json({
          success: false,
          error: {
            code: "SESSION_EXPIRED",
            message: "Session has expired",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
        return;
      }

      req.userId = userId;
      req.role = role;
      req.permissions = this.getRolePermissions(role as string);

      next();
    };
  }

  /**
   * Require specific permission(s) for the route.
   * Wildcard `*` permissions are never accepted so a spoofed or overly broad
   * permission token cannot grant unintended access; administrative roles
   * receive an explicit enumerated permission set.
   */
  static requiresPermission(
    ...permissions: string[]
  ): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.userId) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
        return;
      }

      const rawPermissions = Array.isArray(req.permissions)
        ? req.permissions.filter((p) => typeof p === "string" && p !== "*")
        : [];
      const hasPermission =
        permissions.length > 0 &&
        permissions.every((p) => p !== "*" && rawPermissions.includes(p));

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Insufficient permissions",
            details: { required: permissions, userPermissions: rawPermissions },
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
        return;
      }

      next();
    };
  }

  private static readonly ALL_EXPLICIT_PERMISSIONS: readonly string[] = [
    "ai_tasks.create",
    "ai_tasks.read",
    "ai_approvals.read",
    "knowledge.retrieve",
    "knowledge.ingest",
    "inference.execute",
    "models.read",
    "models.manage",
    "documents.read",
    "contacts.read",
    "opportunities.read",
    "partnerships.read",
    "articles.create",
    "articles.read",
    "resources.read",
    "newsletters.create",
    "analytics.read",
    "projects.create",
    "projects.read",
    "tasks.read",
    "audit_logs.read",
  ];

  private static getRolePermissions(role: string): string[] {
    const rolePerms: Record<string, string[]> = {
      SUPER_ADMIN: [...this.ALL_EXPLICIT_PERMISSIONS],
      OWNER: [...this.ALL_EXPLICIT_PERMISSIONS],
      EXECUTIVE_ASSISTANT: [
        "ai_tasks.create",
        "ai_tasks.read",
        "knowledge.retrieve",
        "documents.read",
      ],
      CRM_MANAGER: [
        "ai_tasks.create",
        "contacts.read",
        "opportunities.read",
        "knowledge.retrieve",
      ],
      PARTNERSHIP_MANAGER: [
        "ai_tasks.create",
        "partnerships.read",
        "knowledge.retrieve",
      ],
      CONTENT_MANAGER: [
        "articles.create",
        "articles.read",
        "resources.read",
        "knowledge.retrieve",
      ],
      MARKETING_MANAGER: [
        "newsletters.create",
        "analytics.read",
        "knowledge.retrieve",
      ],
      PROJECT_MANAGER: [
        "projects.create",
        "projects.read",
        "tasks.read",
        "knowledge.retrieve",
      ],
      AI_REVIEWER: [
        "ai_approvals.read",
        "ai_tasks.read",
        "knowledge.retrieve",
      ],
      SECURITY_AUDITOR: [
        "audit_logs.read",
        "ai_tasks.read",
        "knowledge.retrieve",
      ],
      VIEWER: ["knowledge.retrieve"],
    };

    return rolePerms[role] ? [...rolePerms[role]] : [];
  }
}
