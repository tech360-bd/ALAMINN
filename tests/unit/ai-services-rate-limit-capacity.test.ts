import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/higher-study/ai-services-rate-limit";

describe("public AI limiter capacity", () => {
  it("rejects new keys at capacity without evicting active limits", () => {
    const limiter = createRateLimiter(1, 1000, 2);
    expect(limiter.check("a", 100).allowed).toBe(true);
    expect(limiter.check("b", 100).allowed).toBe(true);
    for (let i = 0; i < 1000; i++) expect(limiter.check(`new-${i}`, 101).allowed).toBe(false);
    expect(limiter.check("a", 101).allowed).toBe(false);
    expect(limiter.check("new", 1100).allowed).toBe(true);
    expect(limiter.check("a", 1100).allowed).toBe(true);
  });
  it("clears expired buckets on a later sweep", () => {
    const limiter = createRateLimiter(2, 1000, 1);
    limiter.check("a", 0);
    expect(limiter.check("b", 999).allowed).toBe(false);
    expect(limiter.check("b", 1000).allowed).toBe(true);
  });
});
