import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import nextConfig from "../../next.config";

describe("browser console regressions", () => {
  it("keeps the required permissions and permits Cloudflare Web Analytics only on its specific origins", async () => {
    const response = await proxy(new NextRequest("https://www.alaminn.info/"));
    const permissions = response.headers.get("permissions-policy")!;
    expect(permissions).toContain("microphone=(self)");
    expect(permissions).not.toMatch(/browsing-topics|interest-cohort/);
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com");
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com");
  });

  it("serves the worker with a same-origin connection policy", async () => {
    const headers = await nextConfig.headers!();
    const worker = headers.find((entry) => entry.source === "/sw.js");
    expect(worker?.headers).toContainEqual({
      key: "Content-Security-Policy",
      value: "default-src 'self'; script-src 'self'; connect-src 'self'",
    });
  });

  it("references an existing hero image and does not preload the raw portrait globally", () => {
    const hero = readFileSync("src/components/site/sections/editorial-hero.tsx", "utf8");
    const path = hero.match(/src="(\/gallery\/[^\"]+)"/)?.[1];
    expect(path).toBeTruthy();
    expect(existsSync(`public${path}`)).toBe(true);
    expect(hero).not.toMatch(/\/(uk|usa|canada|australia|germany|europe)-hero\.jpg/);
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/rel="preload"[\s\S]*?href="\/brand\/portrait\.jpg"/);
  });
});
