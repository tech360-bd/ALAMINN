import { describe, expect, it } from "vitest";
import {
  parseCommunicationMode,
  parseSendThroughPlatform,
  globalModeVerdict,
} from "@/lib/social/communication-controls";

describe("Global communication mode", () => {
  it("preserves existing policy when no mode is configured", () => {
    expect(parseCommunicationMode(undefined)).toBe("AI_AUTONOMOUS");
    expect(globalModeVerdict(parseCommunicationMode(undefined))).toBeNull();
  });

  it("fails safe to AI-assisted on corrupt values", () => {
    expect(parseCommunicationMode("garbage")).toBe("AI_ASSISTED");
    const verdict = globalModeVerdict(parseCommunicationMode("garbage"));
    expect(verdict?.allowAutoSend).toBe(false);
    expect(verdict?.route).toBe("approval");
  });

  it("blocks every automated send in paused and human modes", () => {
    for (const mode of ["PAUSED", "HUMAN_OPERATOR", "AI_ASSISTED"] as const) {
      const verdict = globalModeVerdict(mode);
      expect(verdict?.allowAutoSend).toBe(false);
      expect(verdict?.reason).toContain("global_");
    }
    expect(globalModeVerdict("PAUSED")?.route).toBe("manual");
  });

  it("defaults external sending on and honours explicit disable", () => {
    expect(parseSendThroughPlatform(undefined)).toBe(true);
    expect(parseSendThroughPlatform("true")).toBe(true);
    expect(parseSendThroughPlatform("false")).toBe(false);
  });
});
