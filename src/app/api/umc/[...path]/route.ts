import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { SESSION_COOKIE } from "@/lib/auth/token";

export const dynamic = "force-dynamic";
const UPSTREAM = process.env.UMC_SERVICE_URL ?? "http://127.0.0.1:3010";
const responseHeaders = { "Cache-Control": "no-store" };

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await getSessionUser();
  const credential = req.cookies.get(SESSION_COOKIE)?.value;
  if (!session || !credential) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: responseHeaders });
  if (!can(session.role, "umc.use")) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: responseHeaders });

  const { path } = await ctx.params;
  if (!path?.every((part) => /^[a-zA-Z0-9_-]{1,191}$/.test(part))) {
    return NextResponse.json({ error: "Invalid messaging route" }, { status: 400 });
  }
  const method = req.method;
  if (method !== "GET" && req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }
  const query = new URLSearchParams(req.nextUrl.search);
  query.delete("XTransformPort");
  try {
    let body: Buffer | undefined;
    if (method !== "GET" && req.body) {
      const chunks: Uint8Array[] = [];
      const reader = req.body.getReader();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_200_000) {
          await reader.cancel();
          return NextResponse.json({ error: "Request too large" }, { status: 413 });
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks);
    }
    const upstream = new URL(`/api/umc/${path.join("/")}`, UPSTREAM);
    upstream.search = query.toString();
    const result = await fetch(upstream, {
      method, body: body?.toString("utf8"),
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${credential}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    return new NextResponse(result.body, { status: result.status, headers: { ...responseHeaders, "content-type": "application/json" } });
  } catch {
    return NextResponse.json({ error: "Messaging service unreachable" }, { status: 502, headers: responseHeaders });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
