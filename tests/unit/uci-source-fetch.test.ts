import { describe, expect, it } from "vitest";
import { approvedSourceUrl, isPublicSourceAddress } from "@/lib/uci/source-fetch";

const source = new URL("https://example.edu/admissions");
describe("UCI source egress policy", () => {
  it("permits same-origin HTTPS paths and strips fragments", () => {
    expect(approvedSourceUrl("/admissions/course#fees", source).href).toBe("https://example.edu/admissions/course");
  });
  it.each(["https://other.edu/courses", "http://example.edu", "https://example.edu:444/", "https://user@example.edu/"])("rejects an unapproved destination %s", (target) => {
    expect(() => approvedSourceUrl(target, source)).toThrow();
  });
  it.each(["127.0.0.1", "10.1.1.1", "100.64.0.1", "169.254.1.1", "192.168.1.1", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2002::1"])("rejects nonpublic address %s", (address) => {
    expect(isPublicSourceAddress(address)).toBe(false);
  });
  it.each(["8.8.8.8", "2606:4700:4700::1111"])("accepts a public address %s", (address) => {
    expect(isPublicSourceAddress(address)).toBe(true);
  });
});
