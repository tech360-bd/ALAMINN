import { describe, expect, it } from "vitest";
import { BoundedRateLimitMap } from "@/lib/auth/rate-limit";

describe("BoundedRateLimitMap", () => {
  it("expires entries and prunes them", async () => {
    const map = new BoundedRateLimitMap(100, 1);
    map.set("ip1", { count: 1, reset: Date.now() - 1000 });
    expect(map.get("ip1")).toBeUndefined();
    expect(map.size()).toBe(0);
  });

  it("bounds memory by evicting oldest entries", () => {
    const map = new BoundedRateLimitMap(10, 1000);
    for (let i = 0; i < 20; i++) {
      map.set(`k${i}`, { count: 1, reset: Date.now() + 60_000 });
    }
    expect(map.size()).toBeLessThanOrEqual(10);
    // newest should remain
    expect(map.get("k19")).toBeDefined();
  });

  it("prunes expired entries explicitly", () => {
    const map = new BoundedRateLimitMap(100, 1000);
    map.set("old", { count: 1, reset: Date.now() - 1 });
    map.set("fresh", { count: 1, reset: Date.now() + 60_000 });
    const removed = map.pruneExpired(Date.now());
    expect(removed).toBe(1);
    expect(map.get("fresh")).toBeDefined();
  });
});
