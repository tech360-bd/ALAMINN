/**
 * Authentication Middleware for Express API Gateway
 * ====================================================
 * Adapts the HMAC-signed session cookie auth from Next.js to Express.
 */

import { Request, Response, NextFunction } from "express";
import { verify } from "crypto";

// Extend Express Request type to include user info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: string;
      permissions?: string[];
    }
  }
}

export interface AuthMiddlewareOptions {
  skipPaths?: string[];
  requireAuth?: boolean;
}

/**
 * HMAC-signed session cookie authentication middleware.
 */
export class AuthMiddleware {
  private static readonly COOKIE_NAME = "alaminn_session";

  /**
   * Verify a signed session token.
   */
  private static verifyToken(token: string, authSecret: string): { valid: boolean; payload?: string } {
    const lastDot = token.lastIndexOf(".");
    if (lastDot < 0) return { valid: false };

    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = createHmac("sha256", authSecret).update(payload).digest("hex");

    try {
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length) return { valid: false };
      if (!timingSafeEqual(a, b)) return { valid: false };
      return { valid: true, payload };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Extract session from request headers or cookie.
   */
  private static extractSession(req: Request): string | null {
    // Try Authorization header first (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    // Try cookie
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map(c => c.trim());
      for (const cookie of cookies) {
        const [name, value] = cookie.split("=");
        if (name === this.COOKIE_NAME) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Create Express middleware for authentication.
   */
  static authenticate(options: AuthMiddlewareOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const authSecret = process.env.AUTH_SECRET || "dev-secret-fallback";

      // Skip authentication for specific paths
      if (options.skipPaths && options.skipPaths.length > 0) {
        const path = req.path || req.url;
        if (options.skipPaths.some(p => path === p || path.startsWith(p))) {
          return next();
        }
      }

      const token = this.extractSession(req);

      if (!token) {
        // Allow unauthenticated requests for public endpoints
        return next();
      }

      const result = this.verifyToken(token, authSecret);

      if (!result.valid || !result.payload) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Invalid or expired session token",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }

      // Parse session payload: userId.role.expiresAt
      const parts = result.payload.split(".");
      if (parts.length !== 3) {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_SESSION",
            message: "Invalid session format",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }

      const [userId, role, expiresAtStr] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);

      // Check expiration
      if (isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
        return res.status(401).json({
          success: false,
          error: {
            code: "SESSION_EXPIRED",
            message: "Session has expired",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }

      // Attach to request
      req.userId = userId;
      req.role = role;
      req.permissions = this.getRolePermissions(role as string);

      next();
    };
  }

  /**
   * Require specific permission for the route.
   */
  static requiresPermission(...permissions: string[]): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }

      const userPermissions = req.permissions || [];
      const hasPermission = permissions.every(p => userPermissions.includes(p));

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Insufficient permissions",
            details: { required: permissions, userPermissions },
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }

      next();
    };
  }

  /**
   * Get permissions for a role (simplified - in production this would come from RBAC).
   */
  private static getRolePermissions(role: string): string[] {
    const rolePerms: Record<string, string[]> = {
      SUPER_ADMIN: ["*"],
      OWNER: ["*"],
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
      VIEWER: [
        "knowledge.retrieve",
      ],
    };

    return rolePerms[role] || rolePerms["VIEWER"] || [];
  }
}

// HMAC utilities (inline to avoid dependency on external module)
function createHmac(algorithm: string, key: string): {
  update(data: string): { digest(encoding: string): string };
} {
  const crypto = require("crypto");
  return crypto.createHmac(algorithm, key);
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  const crypto = require("crypto");
  return crypto.timingSafeEqual(a, b);
}