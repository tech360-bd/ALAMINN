import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function worker(online = true) {
  const handlers: Record<string, (event: any) => void> = {};
  const entries = new Map<string, Response>();
  const names = ["alaminn-v2-pages", "alaminn-v2-shell", "other-app", "alaminn-v3-assets"];
  const cache = {
    add: vi.fn(async () => {}),
    match: vi.fn(async (request: Request) => entries.get(request.url)),
    put: vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response); }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => names),
    delete: vi.fn(async () => true),
    match: vi.fn(async (request: Request | string) => entries.get(typeof request === "string" ? request : request.url)),
  };
  const self = { location: { origin: "https://example.test" }, addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  const fetch = vi.fn(async () => { if (!online) throw new Error("offline"); return new Response("network"); });
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches, fetch, Response, URL, Promise, Set });
  async function navigate(path: string) {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: { url: `https://example.test${path}`, method: "GET", mode: "navigate" }, respondWith: (value: Promise<Response>) => { response = value; } });
    return await response!;
  }
  return { handlers, caches, cache, entries, navigate };
}

describe("service worker privacy", () => {
  it("deletes old app caches on activation, retaining unrelated caches", async () => {
    const w = worker(); let task: Promise<unknown> | undefined;
    w.handlers.activate({ waitUntil: (value: Promise<unknown>) => { task = value; } });
    await task;
    expect(w.caches.delete.mock.calls.map(([key]) => key)).toEqual(["alaminn-v2-pages", "alaminn-v2-shell"]);
  });
  it.each(["/admin", "/dashboard", "/console", "/reports", "/admin/reset-password?token=secret", "/?token=secret"])("never caches %s", async (path) => {
    const w = worker(); expect((await w.navigate(path)).status).toBe(200);
    expect(w.cache.put).not.toHaveBeenCalled();
  });
  it("returns a safe offline response for private navigation even if an old entry exists", async () => {
    const w = worker(false);
    w.entries.set("https://example.test/admin", new Response("private content"));
    const res = await w.navigate("/admin");
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private content");
  });
  it("caches allowlisted public navigation", async () => {
    const w = worker(); await w.navigate("/about");
    expect(w.cache.put).toHaveBeenCalledOnce();
  });
});
