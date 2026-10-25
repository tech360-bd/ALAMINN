/**
 * Audit Logger Middleware for Express API Gateway
 * ==============================================
 * Structured audit logging for API requests, responses, and errors.
 */

import { Request, Response, NextFunction } from "express";

export interface AuditLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  userId?: string;
  role?: string;
  statusCode?: number;
  responseTime?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuditLoggerConfig {
  logRequests?: boolean;
  logResponses?: boolean;
  logErrors?: boolean;
  excludePaths?: string[];
  maxBodyLength?: number;
}

export class AuditLogger {
  private static config: AuditLoggerConfig = {
    logRequests: true,
    logResponses: true,
    logErrors: true,
    excludePaths: ["/health", "/health/detailed"],
    maxBodyLength: 10000,
  };

  private static logBuffer: AuditLogEntry[] = [];
  private static maxBufferSize = 1000;

  /**
   * Initialize audit logger with configuration.
   */
  static configure(config: AuditLoggerConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create Express middleware for audit logging.
   */
  static audit(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const rawId = req.headers["x-request-id"];
      const requestId = (Array.isArray(rawId) ? rawId[0] : rawId) || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Add request ID to headers for tracking
      req.headers["x-request-id"] = requestId;
      res.setHeader("X-Request-ID", requestId);

      // Skip excluded paths
      const reqPath = req.path || req.url || "";
      if (this.config.excludePaths && this.config.excludePaths.some(p => reqPath === p || reqPath.startsWith(p))) {
        return next();
      }

      // Capture request body (with size limit)
      let requestBody: any;
      if (this.config.logRequests && req.body) {
        requestBody = this.sanitizeBody(req.body);
      }

      // Capture response body
      const originalSend = res.send;
      let responseBody: any;

      res.send = ((body: any): Response => {
        if (AuditLogger.config.logResponses) {
          try {
            const parsed = typeof body === "string" ? JSON.parse(body) : body;
            responseBody = AuditLogger.sanitizeBody(parsed);
          } catch {
            responseBody = body;
          }
        }
        return originalSend.call(res, body);
      });

      // Log on finish
      res.on("finish", () => {
        const responseTime = Date.now() - startTime;
        const finishPath = req.path || req.url || "";

        // Skip excluded paths
        if (this.config.excludePaths && this.config.excludePaths.some(p => finishPath === p || finishPath.startsWith(p))) {
          return;
        }

        const logEntry: AuditLogEntry = {
          timestamp: new Date().toISOString(),
          requestId,
          method: req.method || "GET",
          path: finishPath,
          ip: this.getClientIp(req),
          userAgent: req.headers["user-agent"],
          userId: (req as any).userId,
          role: (req as any).role,
          statusCode: res.statusCode,
          responseTime,
          requestBody,
          responseBody,
          metadata: {
            query: req.query,
            params: req.params,
          },
        };

        this.writeLog(logEntry);
      });

      next();
    };
  }

  /**
   * Log an error.
   */
  static logError(req: Request, error: Error): void {
    if (!this.config.logErrors) return;

    const requestId = req.headers["x-request-id"] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method || "GET",
      path: req.path || req.url || "",
      ip: this.getClientIp(req),
      userAgent: req.headers["user-agent"],
      userId: (req as any).userId,
      role: (req as any).role,
      statusCode: 500,
      error: error.message,
      metadata: {
        stack: error.stack,
        name: error.name,
      },
    };

    this.writeLog(logEntry);
  }

  /**
   * Log a custom request.
   */
  static logRequest(req: Request, metadata: Record<string, any> = {}): void {
    if (!this.config.logRequests) return;

    const requestId = req.headers["x-request-id"] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method || "GET",
      path: req.path || req.url || "",
      ip: this.getClientIp(req),
      userAgent: req.headers["user-agent"],
      userId: (req as any).userId,
      role: (req as any).role,
      metadata,
    };

    this.writeLog(logEntry);
  }

  /**
   * Log a custom response.
   */
  static logResponse(req: Request, metadata: Record<string, any> = {}): void {
    if (!this.config.logResponses) return;

    const requestId = req.headers["x-request-id"] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method || "GET",
      path: req.path || req.url || "",
      ip: this.getClientIp(req),
      userAgent: req.headers["user-agent"],
      userId: (req as any).userId,
      role: (req as any).role,
      metadata,
    };

    this.writeLog(logEntry);
  }

  /**
   * Get recent audit logs.
   */
  static getLogs(limit = 100): AuditLogEntry[] {
    return this.logBuffer.slice(-limit);
  }

  /**
   * Get audit log statistics.
   */
  static getStats(): {
    totalLogs: number;
    byStatusCode: Record<number, number>;
    byMethod: Record<string, number>;
    byPath: Record<string, number>;
    avgResponseTime: number;
    errorCount: number;
  } {
    const logs = this.logBuffer;
    const byStatusCode: Record<number, number> = {};
    const byMethod: Record<string, number> = {};
    const byPath: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseCount = 0;
    let errorCount = 0;

    for (const log of logs) {
      if (log.statusCode) {
        byStatusCode[log.statusCode] = (byStatusCode[log.statusCode] || 0) + 1;
        if (log.statusCode >= 400) errorCount++;
      }
      byMethod[log.method] = (byMethod[log.method] || 0) + 1;
      byPath[log.path] = (byPath[log.path] || 0) + 1;
      if (log.responseTime) {
        totalResponseTime += log.responseTime;
        responseCount++;
      }
    }

    return {
      totalLogs: logs.length,
      byStatusCode,
      byMethod,
      byPath,
      avgResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0,
      errorCount,
    };
  }

  /**
   * Clear audit logs.
   */
  static clear(): void {
    this.logBuffer = [];
  }

  /**
   * Sanitize request/response body for logging.
   */
  private static sanitizeBody(body: any): any {
    if (!body) return body;

    const sanitized = JSON.parse(JSON.stringify(body));
    const maxLength = this.config.maxBodyLength || 10000;

    // Recursively sanitize sensitive fields
    const sensitiveFields = ["password", "token", "secret", "apiKey", "authorization", "auth", "credential"];
    const sanitize = (obj: any): any => {
      if (typeof obj !== "object" || obj === null) return obj;

      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
          result[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
          result[key] = sanitize(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    const result = sanitize(sanitized);

    // Truncate if too large
    const jsonString = JSON.stringify(result);
    if (jsonString.length > maxLength) {
      return { ...result, _truncated: true, _originalLength: jsonString.length };
    }

    return result;
  }

  /**
   * Get client IP address.
   */
  private static getClientIp(req: Request): string {
    const xForwardedFor = req.headers["x-forwarded-for"];
    if (xForwardedFor) {
      return Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    }
    if (req.headers["x-real-ip"]) {
      return req.headers["x-real-ip"] as string;
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
  }

  /**
   * Write log entry to buffer.
   */
  private static writeLog(entry: AuditLogEntry): void {
    this.logBuffer.push(entry);

    // Trim buffer if too large
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }

    // Also log to console in development
    if (process.env.NODE_ENV !== "production") {
      console.log(`[AUDIT] ${entry.timestamp} ${entry.method} ${entry.path} ${entry.statusCode || ""} ${entry.responseTime || 0}ms`);
    }
  }
}