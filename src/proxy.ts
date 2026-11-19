/**
 * Next.js proxy (formerly middleware) — request ID + security headers (pass-through).
 * ------------------------------------------------------------------
 * Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`.
 * The export is now `proxy` instead of `middleware`, but the API is
 * identical (NextRequest in, NextResponse out, pass-through).
 *
 * Responsibilities:
 *
 *   1. Assign a request ID to every incoming request. If the client
 *      sent an `X-Request-Id` header, honour it; otherwise generate one.
 *      The ID is forwarded to route handlers via the request headers and
 *      also surfaced on the response so clients can correlate.
 *
 *   2. Add security headers to every matched response:
 *        X-Content-Type-Options:  nosniff
 *        X-Frame-Options:         DENY
 *        Referrer-Policy:         strict-origin-when-cross-origin
 *        Permissions-Policy:      camera/geo disabled; same-origin microphone allowed
 *        Content-Security-Policy: strict default-src 'self'
 *        Strict-Transport-Security (production only — would break dev)
 *
 *   3. Increment the in-process request counter used by /api/health/deep
 *      for the `runtime.requestCount` metric.
 *
 * Authentication gate (Rule 1c):
 *   /admin, /admin/* and /api/v1/admin/* require a valid JWT in the
 *   httpOnly `auth_token` cookie. Unauthenticated page requests are
 *   redirected to /admin/login; unauthenticated API requests get a
 *   JSON 401. Every other path is public at the proxy layer (the route
 *   handler still enforces any additional auth it needs).
 *
 * Everything else is PASS-THROUGH: header injection + counter increment.
 *
 * Matched paths: all routes EXCEPT static assets and Next.js internals
 * (see `config.matcher` below). This guarantees security headers are
 * applied to every page and API response.
 *
 * Runtime: `nodejs` (not Edge) so we can use `node:crypto` and share
 * module-level state (the request counter) with route handlers.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  generateRequestId,
  incrementRequestCount,
} from "@/lib/request-context";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";
import { AUTH_COOKIE, verifyToken as verifyAuthToken } from "@/lib/auth/jwt";
import { resolveStaffSecret } from "@/lib/auth/secret";
import { rolesForPath } from "@/lib/auth/rbac";

/**
 * ALO Education staff dashboards + UCI/UMC APIs — coarse edge role gate.
 * Verifies the HMAC-signed staff session cookie (Web Crypto) and enforces
 * the per-path role matrix from @/lib/auth/rbac. Fine-grained permissions
 * are re-checked inside every API route against the database. The admin
 * CRM area (/admin/*) is NOT gated here — it uses its own session system
 * (src/lib/auth.ts) enforced per route.
 */
async function staffGate(req: NextRequest): Promise<NextResponse | null> {
  const { pathname, search } = req.nextUrl;
  const roles = rolesForPath(pathname);
  if (!roles) return null;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = resolveStaffSecret();
  const payload = secret ? await verifyToken(token, secret) : null;
  const isApi = pathname.startsWith("/api/");

  if (!payload) {
    if (isApi) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (!roles.includes(payload.role as never)) {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden for your role" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard?denied=" + encodeURIComponent(pathname), req.url));
  }

  return null;
}

/** Admin pages/APIs that do not require a session. */
const PUBLIC_ADMIN_PAGES = new Set(["/admin/login", "/admin/forgot-password", "/admin/reset-password"]);

/**
 * JWT gate for the Command Center (Rule 1c).
 *
 *   - /api/v1/admin/*  → 401 JSON when the `auth_token` JWT is missing/invalid
 *   - /admin, /admin/* → redirect to /admin/login?next=… (except the public
 *     auth pages above)
 *
 * Returns null when the request should continue down the normal path.
 */
async function adminGate(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/uci" || pathname.startsWith("/admin/uci/")) return null;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname === "/api/v1/admin" || pathname.startsWith("/api/v1/admin/");
  if (!isAdminPage && !isAdminApi) return null;

  // Let CORS preflight through; the route decides how to answer it.
  if (req.method === "OPTIONS") return null;

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? await verifyAuthToken(token) : null;

  if (isAdminApi) {
    if (payload) return null;
    return NextResponse.json(
      {
        success: false,
        error: "unauthorized",
        message: "Authentication required.",
        data: null,
        meta: {},
        errors: ["unauthenticated"],
      },
      {
        status: 401,
        headers: { "cache-control": "no-store" },
      }
    );
  }

  // Page routes
  if (PUBLIC_ADMIN_PAGES.has(pathname)) return null;

  if (!payload) {
    const login = new URL("/admin/login", req.url);
    login.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  return null;
}

// Note: proxy.ts always runs on the Node.js runtime in Next.js 16,
// so `export const runtime = "nodejs"` is not needed (and not allowed).

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Lock down client-side feature APIs; allow same-origin microphone for Admin AI Studio STT.
  // Format: feature=(allowlist) — empty allowlist = disabled.
  "Permissions-Policy":
    "camera=(), microphone=(self), geolocation=()",
  // Content-Security-Policy — restricts resource loading to prevent XSS,
  // data exfiltration, and clickjacking. Next.js requires 'unsafe-inline'
  // for styles and 'unsafe-eval' for some dev tooling; in production the
  // inline styles come from Next's styled-jsx / RSC payloads. For a stricter
  // policy, migrate to nonce-based CSP (advanced, future work).
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; "),
};

export async function proxy(req: NextRequest) {
  // ── Command Center JWT gate (/admin, /api/v1/admin/*) ───────────────
  const adminDenied = await adminGate(req);
  if (adminDenied) {
    // Gated responses (401 JSON / login redirects) must still carry the
    // standard security headers.
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!adminDenied.headers.has(key)) adminDenied.headers.set(key, value);
    }
    if (process.env.NODE_ENV !== "production") {
      adminDenied.headers.set("X-Frame-Options", "SAMEORIGIN");
      adminDenied.headers.set(
        "Content-Security-Policy",
        (SECURITY_HEADERS["Content-Security-Policy"] ?? "")
          .replace("frame-ancestors 'none'", "frame-ancestors 'self' https://*.e2b.app https://*.space-z.ai")
          .replace("; upgrade-insecure-requests", "")
      );
    }
    return adminDenied;
  }

  // ── Staff RBAC gate (ALO Education dashboards, UCI/UMC APIs) ────────
  const gated = await staffGate(req);
  if (gated) return gated;

  // ── Request counter (read by /api/health/deep) ─────────────────────
  incrementRequestCount();

  // ── Resolve request ID ─────────────────────────────────────────────
  const incomingId = req.headers.get("x-request-id");
  const requestId = incomingId || generateRequestId();

  // Forward the request ID to the downstream route handler by rewriting
  // the inbound request headers. Route handlers (and the observability
  // wrapper) read it via `req.headers.get("x-request-id")`.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ── Echo the request ID back on the response ───────────────────────
  response.headers.set("x-request-id", requestId);

  // Arena's preview is embedded by the user's browser on a different origin.
  // Keep production clickjacking protection, but allow the preview proxy in dev.
  // Modern browsers honor CSP frame-ancestors over X-Frame-Options, so the
  // relaxed frame-ancestors below still governs embedding; we keep a
  // SAMEORIGIN X-Frame-Options for legacy clients and for parity with the
  // automated security suite (scripts/security-tests.ts test 8), which
  // expects all three headers on every environment including dev.
  if (process.env.NODE_ENV !== "production") {
    const headers = { ...SECURITY_HEADERS };
    headers["X-Frame-Options"] = "SAMEORIGIN";
    headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace("frame-ancestors 'none'", "frame-ancestors 'self' https://*.e2b.app https://*.space-z.ai").replace("; upgrade-insecure-requests", "");
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
  // ── Security headers ───────────────────────────────────────────────
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // HSTS is HTTPS-only. Emitting it on dev (HTTP localhost) would cause
  // browsers to refuse subsequent plain-HTTP requests.
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  // Match all routes EXCEPT static assets + Next.js internals. This
  // ensures security headers (CSP, X-Frame-Options, HSTS, etc.) are
  // applied to every page and API response, not just /api/* and /.
  // Excluded: /_next/static, /_next/image, favicon, icon files,
  // manifest, robots, sitemap, and well-known file extensions.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|icon|apple-icon|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|css|js|woff|woff2|ttf|map)$).*)",
  ],
};
