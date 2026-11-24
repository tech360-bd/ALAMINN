import { describe, expect, it } from "vitest";
import { summarizeHealth } from "@/lib/command-center/metrics";

describe("Command Center health summaries", () => {
  it("reports unknown instead of inventing health when no probe exists", () => {
    expect(summarizeHealth([])).toEqual({
      status: "unknown",
      note: "Unavailable — no health probe has been recorded.",
    });
  });

  it("prioritises the most severe recorded status", () => {
    const rows = [{ status: "ok" }, { status: "degraded" }, { status: "down" }];
    expect(summarizeHealth(rows).status).toBe("down");
    expect(summarizeHealth([{ status: "ok" }, { status: "degraded" }]).status).toBe("degraded");
    expect(summarizeHealth([{ status: "ok" }]).status).toBe("ok");
  });
});
