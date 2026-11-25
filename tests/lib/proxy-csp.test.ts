import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("proxy CSP hardening", () => {
  it("omits unsafe-eval in production script-src", async () => {
    process.env.NODE_ENV = "production";
    const res = await proxy(new NextRequest("http://localhost/"));
    const csp = res.headers.get("content-security-policy") || "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("keeps unsafe-eval in development for tooling compatibility", async () => {
    process.env.NODE_ENV = "development";
    const res = await proxy(new NextRequest("http://localhost/"));
    const csp = res.headers.get("content-security-policy") || "";
    expect(csp).toContain("unsafe-eval");
  });
});
