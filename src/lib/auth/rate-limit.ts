/**
 * Bounded in-memory rate-limit store for auth endpoints.
 * ------------------------------------------------------
 * Process-local by design: suitable for single-instance deployments and as
 * defense-in-depth. Multi-instance deployments should use a shared store
 * (Redis/DB) for global enforcement; this implementation documents that limit.
 *
 * Guarantees:
 * - Expired entries are pruned opportunistically and by max-size eviction.
 * - Map size is bounded to prevent unbounded memory growth.
 */
export type RateLimitEntry = {
  count: number;
  reset: number;
  locked?: boolean;
  lockUntil?: number;
};

export class BoundedRateLimitMap {
  private readonly map = new Map<string, RateLimitEntry>();
  constructor(
    private readonly maxEntries = 5000,
    private readonly pruneEvery = 100
  ) {}
  private ops = 0;

  get(key: string): RateLimitEntry | undefined {
    this.maybePrune();
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.reset <= Date.now() && (!entry.lockUntil || entry.lockUntil <= Date.now())) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: RateLimitEntry): void {
    this.maybePrune();
    if (!this.map.has(key) && this.map.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  size(): number {
    return this.map.size;
  }

  pruneExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.map) {
      const resetExpired = entry.reset <= now;
      const lockExpired = !entry.lockUntil || entry.lockUntil <= now;
      if (resetExpired && lockExpired) {
        this.map.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private maybePrune(): void {
    this.ops++;
    if (this.ops % this.pruneEvery === 0) this.pruneExpired();
  }

  private evictOldest(): void {
    // Map preserves insertion order; delete oldest entries first.
    const target = Math.max(1, Math.floor(this.maxEntries * 0.1));
    let removed = 0;
    for (const key of this.map.keys()) {
      this.map.delete(key);
      removed++;
      if (removed >= target) break;
    }
  }
}
