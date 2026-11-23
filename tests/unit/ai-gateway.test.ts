import { describe, expect, it } from "vitest";
import { ApiGateway } from "@/lib/ai/api-gateway";
import { LocalInferenceEngine } from "@/lib/ai/inference-engine";
import { ModelRegistry } from "@/lib/ai/model-registry";
import { AuthMiddleware } from "@/lib/middleware/auth-middleware";
import { AuditLogger } from "@/lib/middleware/audit-logger";
import type { Auth } from "@/lib/auth";

describe("Task 11 — AI API Gateway & AuthMiddleware Runtime Verification", () => {
  function createGateway() {
    const engine = new LocalInferenceEngine();
    const registry = new ModelRegistry({
      localModels: [],
      externalModels: [],
      defaultProvider: "local",
      fallbackEnabled: true,
    });
    const authStub = {} as Auth;
    const auditLogger = new AuditLogger();
    return new ApiGateway(engine, registry, authStub, auditLogger);
  }

  it("initializes and serves /health and /models without requiring express", async () => {
    const gateway = createGateway();

    const healthRes = await gateway.handleFetchRequest(
      new Request("http://localhost/health"),
    );
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as {
      success: boolean;
      status: string;
    };
    expect(healthJson.success).toBe(true);
    expect(healthJson.status).toBe("healthy");

    const modelsRes = await gateway.handleFetchRequest(
      new Request("http://localhost/models"),
    );
    expect(modelsRes.status).toBe(200);
    const modelsJson = (await modelsRes.json()) as {
      success: boolean;
      count: number;
    };
    expect(modelsJson.success).toBe(true);
    expect(modelsJson.count).toBeGreaterThanOrEqual(0);
  });

  it("rejects unauthenticated requests to protected /api/v1/knowledge and /api/v1/inference endpoints with 401", async () => {
    const gateway = createGateway();

    const knowledgeRes = await gateway.handleFetchRequest(
      new Request("http://localhost/api/v1/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "scholarship deadlines" }),
      }),
    );
    expect(knowledgeRes.status).toBe(401);

    const inferenceRes = await gateway.handleFetchRequest(
      new Request("http://localhost/api/v1/inference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "local",
          provider: "local",
          prompt: "Hello",
        }),
      }),
    );
    expect(inferenceRes.status).toBe(401);
  });

  it("enforces role permissions and does not ingest 'Test Document' on knowledge queries", async () => {
    const gateway = createGateway();
    const viewerToken = AuthMiddleware.signSessionToken("viewer-1", "VIEWER");
    const ownerToken = AuthMiddleware.signSessionToken("owner-1", "OWNER");

    // VIEWER has knowledge.retrieve permission
    const knowledgeRes = await gateway.handleFetchRequest(
      new Request("http://localhost/api/v1/knowledge", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({ query: "UniqueCanaryQueryString991" }),
      }),
    );
    expect(knowledgeRes.status).toBe(200);
    const knowledgeJson = (await knowledgeRes.json()) as {
      success: boolean;
      data: { results: Array<{ text: string }>; totalFound: number };
    };
    expect(knowledgeJson.success).toBe(true);
    // Ensure "Test Document" was not automatically ingested by the query handler
    expect(
      knowledgeJson.data.results.some((r) => r.text.includes("Test Document")),
    ).toBe(false);

    // VIEWER does NOT have ai_tasks.create permission -> 403
    const viewerInferenceRes = await gateway.handleFetchRequest(
      new Request("http://localhost/api/v1/inference", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          model: "nonexistent-model",
          provider: "local",
          prompt: "Hello",
        }),
      }),
    );
    expect(viewerInferenceRes.status).toBe(403);

    // OWNER has explicit enumerated permissions -> passes RBAC gate (returns 404 for nonexistent model)
    const ownerInferenceRes = await gateway.handleFetchRequest(
      new Request("http://localhost/api/v1/inference", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          model: "nonexistent-model",
          provider: "local",
          prompt: "Hello",
        }),
      }),
    );
    expect(ownerInferenceRes.status).toBe(404);
  });

  it("rejects wildcard '*' permissions and unknown roles from granting unintended access", async () => {
    const gateway = createGateway();
    const unknownRoleToken = AuthMiddleware.signSessionToken(
      "user-unknown",
      "UNRECOGNIZED_ROLE",
    );

    const unknownRes = await gateway.handleFetchRequest(
      new Request("http://localhost/api/v1/knowledge", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${unknownRoleToken}`,
        },
        body: JSON.stringify({ query: "test" }),
      }),
    );
    expect(unknownRes.status).toBe(403);

    // Direct unit check on requiresPermission with injected wildcard ["*"]
    let statusSet = 200;
    let nextCalled = false;
    const mw = AuthMiddleware.requiresPermission("admin.secret.action");
    mw(
      {
        userId: "u-1",
        role: "VIEWER",
        permissions: ["*"],
        headers: {},
      } as never,
      {
        status(c: number) {
          statusSet = c;
          return this;
        },
        json() {
          return this;
        },
      } as never,
      () => {
        nextCalled = true;
      },
    );
    expect(statusSet).toBe(403);
    expect(nextCalled).toBe(false);
  });

  it("handles aborted requests (499), prevents double responses, and isolates finish listener errors", async () => {
    const gateway = createGateway();
    const app = gateway.getApp();

    app.get("/test-double-and-finish", (_req: unknown, res: {
      on: (ev: string, fn: () => void) => void;
      status: (c: number) => { json: (b: unknown) => void };
    }) => {
      res.on("finish", () => {
        throw new Error("Simulated telemetry listener failure");
      });
      res.status(201).json({ first: true });
      // Second attempt must be ignored (prevent double response)
      res.status(500).json({ second: true });
    });

    const doubleRes = await gateway.handleFetchRequest(
      new Request("http://localhost/test-double-and-finish"),
    );
    expect(doubleRes.status).toBe(201);
    expect(await doubleRes.json()).toEqual({ first: true });

    const controller = new AbortController();
    controller.abort();
    const abortedRes = await gateway.handleFetchRequest(
      new Request("http://localhost/health", { signal: controller.signal }),
    );
    expect(abortedRes.status).toBe(499);
  });
});
