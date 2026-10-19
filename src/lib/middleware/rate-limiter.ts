/**
 * Rate Limiter Middleware for Express API Gateway
 * ==============================================
 * Implements rate limiting for API endpoints using sliding window algorithm.
 */

import { Request, Response, NextFunction } from "express";

interface RateLimitInfo {
  count: number;
  resetTime: number;
  windowSize: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimiter {
  private static rateLimits = new Map<string, RateLimitInfo>();
  private static defaultConfig: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  };

  /**
   * Create Express middleware for rate limiting.
   */
  static middleware(config: RateLimitConfig = {}): (req: Request, res: Response, next: NextFunction) => void {
    const configInstance = { ...this.defaultConfig, ...config };
    const key = this.getRateLimitKey(req);

    return (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      let limitInfo = this.rateLimits.get(key);

      // Clean up old entries
      if (limitInfo && limitInfo.resetTime < now) {
        this.rateLimits.delete(key);
        limitInfo = undefined;
      }

      if (!limitInfo) {
        limitInfo = {
          count: 1,
          resetTime: now + configInstance.windowMs,
          windowSize: configInstance.windowMs,
        };
        this.rateLimits.set(key, limitInfo);
      } else {
        limitInfo.count++;
      }

      // Check if limit exceeded
      if (limitInfo.count > configInstance.maxRequests) {
        return res.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests from this IP address",
            details: {
              limit: configInstance.maxRequests,
              remaining: configInstance.maxRequests - limitInfo.count,
              resetTime: new Date(limitInfo.resetTime).toISOString(),
            },
          },
          requestId: req.headers["x-request-id"] || "unknown",
        });
      }

      // Add rate limit headers
      res.setHeader("X-RateLimit-Limit", configInstance.maxRequests);
      res.setHeader("X-RateLimit-Remaining", configInstance.maxRequests - limitInfo.count);
      res.setHeader("X-RateLimit-Reset", new Date(limitInfo.resetTime).toISOString());

      next();
    };
  }

  /**
   * Get rate limit key from request.
   */
  private static getRateLimitKey(req: Request): string {
    // Use IP address for rate limiting
    const xForwardedFor = req.headers["x-forwarded-for"];
    let ip = "unknown";

    if (xForwardedFor) {
      ip = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    } else if (req.ip) {
      ip = req.ip;
    } else if (req.socket.remoteAddress) {
      ip = req.socket.remoteAddress;
    } else if (req.headers["x-real-ip"]) {
      ip = req.headers["x-real-ip"];
    }

    // Clean up IP for rate limiting (remove common prefixes, keep last octet)
    return ip.replace(/^[0-9.]+\./, "") || "unknown";
  }

  /**
   * Clean up old rate limit entries.
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [key, limitInfo] of this.rateLimits.entries()) {
      if (limitInfo.resetTime < now) {
        this.rateLimits.delete(key);
      }
    }
  }

  /**
   * Get current rate limit stats (for monitoring).
   */
  static getStats(): { totalKeys: number; activeKeys: number; limits: RateLimitInfo[] } {
    const now = Date.now();
    const activeLimits: RateLimitInfo[] = [];

    for (const limitInfo of this.rateLimits.values()) {
      if (limitInfo.resetTime >= now) {
        activeLimits.push(limitInfo);
      }
    }

    return {
      totalKeys: this.rateLimits.size,
      activeKeys: activeLimits.length,
      limits: activeLimits,
    };
  }
}