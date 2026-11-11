import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Authenticated bridge from the Next.js app to the Universal Messaging
 * Channel service (UMC_SERVICE_URL, default http://127.0.0.1:3010).
 *
 * RBAC (enforced here, before any upstream byte is sent):
 *  - umc.use  (ADMIN, AGENT): every console operation.
 *  - umc.admin (ADMIN): tenant provisioning/update, user ban/verify,
 *    suppression list and moderation word changes.
 *
 * The gateway `XTransformPort` query parameter is stripped — direct
 * deployments don't route through the Caddy transform.
 */

const UPSTREAM = process.env.UMC_SERVICE_URL ?? "http://127.0.0.1:3010";

/** Paths that mutate global/compliance state — ADMIN only. */
const ADMIN_ONLY_PATTERNS: { method: string; re: RegExp }[] = [
  { method: "POST", re: /^\/api\/umc\/tenants\/?$/ },
  { method: "PATCH", re: /^\/api\/umc\/tenants\/[^/]+$/ },
  { method: "PATCH", re: /^\/api\/umc\/users\/[^/]+$/ },
  { method: "POST", re: /^\/api\/umc\/tenants\/[^/]+\/suppressions\/?$/ },
  { method: "DELETE", re: /^\/api\/umc\/tenants\/[^/]+\/suppressions\/?$/ },
  { method: "POST", re: /^\/api\/umc\/tenants\/[^/]+\/moderation-words\/?$/ },
  { method: "DELETE", re: /^\/api\/umc\/tenants\/[^/]+\/moderation-words\/?$/ },
];

async function forward(req: NextRequest, subpath: string) {
  const incoming = new URL(req.url);
  const q = new URLSearchParams(incoming.search);
  q.delete("XTransformPort");
  const qs = q.toString();
  const upstreamUrl = `${UPSTREAM}/api/umc${subpath}${qs ? `?${qs}` : ""}`;

  const headers: HeadersInit = {};
  const ct = req.headers.get("content-type");
  if (ct) (headers as Record<string, string>)["content-type"] = ct;

  const method = req.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await req.text();

  const res = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    // socket.io-style long-poll requests must not be buffered indefinitely
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { path } = await ctx.params;
  const subpath = "/" + (path ?? []).join("/");
  const method = req.method.toUpperCase();

  if (ADMIN_ONLY_PATTERNS.some((p) => p.method === method && p.re.test(`/api/umc${subpath}`))) {
    if (!can(session.role, "umc.admin")) {
      return NextResponse.json({ error: "ADMIN role required for this operation" }, { status: 403 });
    }
  } else if (!can(session.role, "umc.use")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return await forward(req, subpath);
  } catch (e) {
    return NextResponse.json(
      { error: `Messaging service unreachable: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
