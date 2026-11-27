import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn(), inquiry: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { contact: { findMany: mocks.findMany, upsert: mocks.upsert }, inquiry: { create: mocks.inquiry }, auditLog: { create: mocks.audit } } }));
import { findExistingContactByWhatsapp, createOrUpdateLead } from "@/lib/whatsapp/leads";

beforeEach(() => vi.resetAllMocks());
describe("WhatsApp lead matching", () => {
  it("matches only full canonical phone values", async () => {
    mocks.findMany.mockResolvedValue([{ id: "a", fullName: "Original", email: "a@example.test", status: "active" }]);
    expect((await findExistingContactByWhatsapp("01716609554"))?.id).toBe("a");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ whatsapp: "8801716609554" }, { phone: "8801716609554" }] } }));
  });
  it("rejects short numbers without querying", async () => {
    expect(await findExistingContactByWhatsapp("123")).toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("refuses an ambiguous match", async () => {
    mocks.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    await expect(findExistingContactByWhatsapp("01716609554")).rejects.toThrow(/manual review/);
  });
  it("does not overwrite existing personal data from conversation input", async () => {
    mocks.findMany.mockResolvedValue([{ id: "a", fullName: "Original", email: "a@example.test", status: "active" }]);
    mocks.upsert.mockResolvedValue({ id: "a" });
    mocks.inquiry.mockResolvedValue({ id: "i" });
    mocks.audit.mockResolvedValue({});
    await createOrUpdateLead({ whatsappNumber: "01716609554", name: "Other", email: "other@example.test" }, { privacyConsent: true, commsConsent: true, marketingConsent: false });
    expect(mocks.upsert.mock.calls[0][0].update).toEqual({});
  });
});
