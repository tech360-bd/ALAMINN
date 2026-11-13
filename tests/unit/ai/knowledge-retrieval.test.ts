/**
 * tests/unit/ai/knowledge-retrieval.test.ts
 *
 * Regression tests for the knowledge-retrieval access-control layer.
 *
 * Covers the formerly-stubbed TODO at line 110 ("Implement proper
 * access control"). The service now:
 *   - Requires an AuthContext on every ingestion / retrieval call
 *   - Fails closed in production (NODE_ENV=production) if no auth
 *   - Stamps ownerId + tenantId on ingested documents
 *   - Filters search results to documents the caller owns
 *   - ADMIN / SUPER_ADMIN / OWNER roles bypass ownership filtering
 *   - Blocks cross-tenant retrieval
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  KnowledgeRetrievalService,
  KnowledgeAuthError,
  type AuthContext,
} from "@/lib/ai/knowledge-retrieval";
import { LocalInferenceEngine } from "@/lib/ai/inference-engine";

// Stub inference engine — we only need generateEmbedding to resolve
// so chunkAndIndexDocument doesn't throw during ingestion.
class StubInferenceEngine {
  async generateEmbedding() {
    return {
      embeddings: [[0.1, 0.2, 0.3]],
      model: "stub",
      provider: "local" as const,
      usage: { totalTokens: 1 },
    };
  }
}

describe("KnowledgeRetrievalService — access control", () => {
  let service: KnowledgeRetrievalService;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new KnowledgeRetrievalService(new StubInferenceEngine() as any);
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe("ingestText — auth required", () => {
    it("stamps ownerId on the ingested document", async () => {
      const auth: AuthContext = { userId: "user-123", role: "STAFF" };
      const doc = await service.ingestText(
        "Test Doc",
        "test",
        "This is a long enough document content for testing ingestion and chunking. " +
          "It needs to be at least 100 characters long so the extractText check passes. " +
          "Adding more content to ensure the threshold is met.",
        undefined,
        "en",
        auth
      );
      expect(doc.ownerId).toBe("user-123");
    });

    it("stamps tenantId when provided", async () => {
      const auth: AuthContext = { userId: "user-123", role: "STAFF", tenantId: "tenant-A" };
      const doc = await service.ingestText(
        "Tenant Doc",
        "test",
        "This is a long enough document content for testing tenant isolation in the " +
          "knowledge retrieval service. It needs at least 100 characters to pass the " +
          "extractText length threshold and proceed to chunking and indexing.",
        undefined,
        "en",
        auth
      );
      expect(doc.tenantId).toBe("tenant-A");
    });

    it("includes the userId in the document ID prefix for ownership traceability", async () => {
      const auth: AuthContext = { userId: "user-xyz", role: "STAFF" };
      const doc = await service.ingestText(
        "Traceable Doc",
        "test",
        "This document content is long enough to pass the 100-character minimum " +
          "threshold for ingestion. We are verifying that the generated document " +
          "ID includes the owner's userId as a prefix for audit traceability.",
        undefined,
        "en",
        auth
      );
      expect(doc.id).toContain("user-xyz");
    });
  });

  describe("ingestText — production fail-closed", () => {
    it("throws KnowledgeAuthError in production when auth is missing", async () => {
      process.env.NODE_ENV = "production";
      await expect(
        service.ingestText("Doc", "test", "content".repeat(20), undefined, "en", undefined)
      ).rejects.toThrow(KnowledgeAuthError);
    });

    it("throws KnowledgeAuthError in production when userId is empty", async () => {
      process.env.NODE_ENV = "production";
      const auth = { userId: "", role: "STAFF" };
      await expect(
        service.ingestText("Doc", "test", "content".repeat(20), undefined, "en", auth)
      ).rejects.toThrow(KnowledgeAuthError);
    });

    it("error code is UNAUTHENTICATED", async () => {
      process.env.NODE_ENV = "production";
      try {
        await service.ingestText("Doc", "test", "content".repeat(20), undefined, "en", undefined);
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(KnowledgeAuthError);
        expect((e as KnowledgeAuthError).code).toBe("UNAUTHENTICATED");
      }
    });
  });

  describe("searchForUser — ownership filtering", () => {
    it("returns only documents owned by the calling user (non-privileged role)", async () => {
      const content = "Knowledge retrieval access control test document with " +
        "enough content to pass the 100 character threshold for chunking. " +
        "The keyword retrievaltest appears here for search matching.";

      // User A ingests a document
      await service.ingestText("User A Doc", "test", content, undefined, "en", {
        userId: "user-A",
        role: "STAFF",
      });
      // User B ingests a document
      await service.ingestText("User B Doc", "test", content, undefined, "en", {
        userId: "user-B",
        role: "STAFF",
      });

      // User A searches — should see only their own document
      const results = service.searchForUser(
        { userId: "user-A", role: "STAFF" },
        "retrievaltest",
        10
      );
      expect(results.results.length).toBeGreaterThan(0);
      for (const r of results.results) {
        const docId = r.metadata.documentId as string;
        expect(docId).toContain("user-A");
        expect(docId).not.toContain("user-B");
      }
    });

    it("ADMIN role sees all documents regardless of ownership", async () => {
      const content = "Admin override test document with enough content " +
        "to pass the threshold for chunking. Keyword admintest appears here.";

      await service.ingestText("User Doc", "test", content, undefined, "en", {
        userId: "regular-user",
        role: "STAFF",
      });

      const adminResults = service.searchForUser(
        { userId: "admin-1", role: "ADMIN" },
        "admintest",
        10
      );
      expect(adminResults.results.length).toBeGreaterThan(0);
      // Admin sees documents they don't own
      const docIds = adminResults.results.map(r => r.metadata.documentId as string);
      expect(docIds.some(id => id.includes("regular-user"))).toBe(true);
    });

    it("SUPER_ADMIN role also bypasses ownership", async () => {
      const content = "Super admin test document with enough content " +
        "to pass the threshold for chunking. Keyword superadmintest appears here.";

      await service.ingestText("Doc", "test", content, undefined, "en", {
        userId: "regular-user",
        role: "STAFF",
      });

      const results = service.searchForUser(
        { userId: "super-1", role: "SUPER_ADMIN" },
        "superadmintest",
        10
      );
      expect(results.results.length).toBeGreaterThan(0);
    });

    it("returns empty results for a user with no matching documents", async () => {
      const content = "Isolation test document keyword isolationtest " +
        "with enough content to pass the threshold for chunking and indexing.";

      await service.ingestText("Owner Doc", "test", content, undefined, "en", {
        userId: "owner-user",
        role: "STAFF",
      });

      // Different user searches — should see nothing
      const results = service.searchForUser(
        { userId: "other-user", role: "STAFF" },
        "isolationtest",
        10
      );
      expect(results.results).toHaveLength(0);
      expect(results.totalFound).toBe(0);
    });
  });

  describe("searchForUser — production fail-closed", () => {
    it("throws KnowledgeAuthError in production when auth is missing", () => {
      process.env.NODE_ENV = "production";
      expect(() =>
        service.searchForUser(undefined, "query", 5)
      ).toThrow(KnowledgeAuthError);
    });
  });

  describe("search (internal) — still available for admin dashboards", () => {
    it("the unauthenticated search method still works for internal admin use", async () => {
      const content = "Internal admin search test keyword adminsearch " +
        "with enough content to pass the threshold for chunking.";
      await service.ingestText("Doc", "test", content, undefined, "en", {
        userId: "some-user",
        role: "STAFF",
      });
      // The raw search() method doesn't filter by ownership — it's the
      // internal/admin path. searchForUser() layers auth on top.
      const results = service.search("adminsearch", 5);
      expect(results.results.length).toBeGreaterThan(0);
    });
  });

  describe("dead code / TODO removal", () => {
    it("knowledge-retrieval.ts no longer contains the access-control TODO", async () => {
      const source = await import("fs").then(fs =>
        fs.readFileSync("src/lib/ai/knowledge-retrieval.ts", "utf8")
      );
      expect(source).not.toContain("TODO: Implement proper access control");
      expect(source).not.toContain("always allow in dev");
    });
  });
});
