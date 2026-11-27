/**
 * tests/integration/university-intelligence.test.ts
 *
 * Live intelligence system flows against an isolated SQLite database,
 * calling the real route handlers + libraries:
 *  - documented source registry (incl. MARGE URL-to-be-confirmed)
 *  - Level-2 discovery import → DISCOVERED, draft, NEVER auto-published,
 *    with duplicate protection and review tasks
 *  - evidence status transitions (only Level 1 sources verify a fact)
 *  - cross-source conflicts preserve every candidate; humans resolve
 *  - the publication gate blocks unverified/conflicted fact sets
 *  - admin endpoints reject unauthenticated callers (401)
 */
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

const { isolatedDbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const file = execFileSync(process.execPath, ["tests/fixtures/init-sqlite.mjs"], {
    encoding: "utf8",
  }).trim();
  process.env.DATABASE_URL = `file:${file}`;
  return { isolatedDbPath: file };
});

import { db } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth/jwt";
import { createTestAdminToken as createToken } from "../fixtures/admin-session";
import { ensureSourceRegistry } from "@/lib/higher-study/intelligence/pipeline";
import { detectConflictsForEntity, resolveConflict } from "@/lib/higher-study/intelligence/conflicts";
import { approvePublication } from "@/lib/higher-study/intelligence/publication";
import { importDiscoveredUniversities } from "@/lib/higher-study/intelligence/importer";
import { GET as intelligenceGet } from "@/app/api/v1/higher-study/admin/intelligence/route";
import { GET as sourcesGet } from "@/app/api/v1/higher-study/admin/intelligence/sources/route";
import { GET as evidenceGet, PATCH as evidencePatch } from "@/app/api/v1/higher-study/admin/intelligence/evidence/route";
import { GET as conflictsGet, POST as conflictsPost } from "@/app/api/v1/higher-study/admin/intelligence/conflicts/route";
import { GET as jobsGet } from "@/app/api/v1/higher-study/admin/intelligence/jobs/route";
import { GET as tasksGet } from "@/app/api/v1/higher-study/admin/intelligence/tasks/route";
import { POST as approvePost } from "@/app/api/v1/higher-study/admin/intelligence/approve/route";
import { POST as importPost } from "@/app/api/v1/higher-study/admin/intelligence/import/route";

afterAll(async () => {
  await db.$disconnect();
  rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
});

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

async function adminReq(url: string, init: RequestInit = {}, role = "SUPER_ADMIN") {
  const user = await db.user.create({
    data: {
      email: `intel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      name: "Intel Admin",
      passwordHash: "unused",
      role,
      status: "active",
    },
  });
  const jwt = await createToken(user.id, role, { email: user.email, name: user.name });
  return req(url, {
    ...init,
    headers: { "content-type": "application/json", cookie: `${AUTH_COOKIE}=${jwt}`, ...(init.headers ?? {}) },
  });
}

describe("University & course intelligence — documented source registry", () => {
  it("seeds all documented sources incl. MARGE (URL to be confirmed, collection disabled)", async () => {
    const { margeTaskId } = await ensureSourceRegistry();
    expect(margeTaskId).toBeTruthy();
    const orgs = await db.higherStudySourceOrg.findMany();
    const keys = orgs.map((o) => o.key);
    for (const key of ["applyboard-assist", "edvoy", "ahz-associates", "idp-education", "marge", "official-university", "government", "research-db"]) {
      expect(keys).toContain(key);
    }
    const marge = orgs.find((o) => o.key === "marge")!;
    expect(marge.baseUrl).toBeNull(); // exact source URL still to be confirmed
    expect(marge.active).toBe(false); // collection stays disabled until confirmed
    const l2 = orgs.filter((o) => o.level === "L2_DISCOVERY");
    expect(l2).toHaveLength(5);
    const task = await db.higherStudyReviewTask.findFirst({ where: { refId: "marge", type: "verify-discovery" } });
    expect(task?.title).toMatch(/MARGE/i);
  });
});

describe("University & course intelligence — admin endpoints require auth", () => {
  it("rejects unauthenticated callers with 401 on every intelligence endpoint", async () => {
    for (const [handler, url] of [
      [intelligenceGet, "http://localhost/api/v1/higher-study/admin/intelligence"],
      [sourcesGet, "http://localhost/api/v1/higher-study/admin/intelligence/sources"],
      [evidenceGet, "http://localhost/api/v1/higher-study/admin/intelligence/evidence"],
      [conflictsGet, "http://localhost/api/v1/higher-study/admin/intelligence/conflicts"],
      [jobsGet, "http://localhost/api/v1/higher-study/admin/intelligence/jobs"],
      [tasksGet, "http://localhost/api/v1/higher-study/admin/intelligence/tasks"],
    ] as const) {
      const res = await handler(req(url));
      expect(res.status, `${url} should reject anonymous access`).toBe(401);
    }
    const approveRes = await approvePost(
      req("http://localhost/api/v1/higher-study/admin/intelligence/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType: "course", entityId: "x" }),
      })
    );
    expect(approveRes.status).toBe(401);
  });
});

describe("University & course intelligence — Level-2 discovery import (§3, §4)", () => {
  it("imports discovered universities as draft + DISCOVERED evidence + review task; never publishes", async () => {
    // The disposable DB replays migrations only (no seed rows) — create the country ourselves.
    const country = await db.higherStudyCountry.create({
      data: { slug: "test-intel-country", name: "Test Intel Country", region: "Test Region" },
    });
    const report = await importDiscoveredUniversities([
      {
        universityName: "Test Intelligence University",
        countrySlug: country!.slug,
        officialWebsite: "https://www.test-intelligence-university.example",
        sourceOrgKey: "edvoy",
        sourceUrl: "https://edvoy.com/universities/test-intelligence-university",
      },
    ]);
    expect(report.created).toBe(1);
    expect(report.errors).toHaveLength(0);
    const uni = await db.higherStudyUniversity.findFirst({ where: { officialName: "Test Intelligence University" } });
    expect(uni).toBeTruthy();
    expect(uni!.publicationStatus).toBe("draft"); // never auto-published from Level 2
    const evidence = await db.higherStudyEvidence.findFirst({ where: { entityId: uni!.id, field: "existence" } });
    expect(evidence?.status).toBe("DISCOVERED");
    expect(evidence?.sourceLevel).toBe("L2_DISCOVERY");
    const task = await db.higherStudyReviewTask.findFirst({ where: { refId: uni!.id, type: "verify-discovery" } });
    expect(task).toBeTruthy();
  });
  it("dry-run imports create nothing but report what would happen", async () => {
    const country = await db.higherStudyCountry.findFirst({ where: { slug: "test-intel-country" } });
    const before = await db.higherStudyUniversity.count();
    const report = await importDiscoveredUniversities(
      [{ universityName: "Dry Run University", countrySlug: country!.slug, sourceOrgKey: "idp-education" }],
      { dryRun: true }
    );
    expect(report.created).toBe(1);
    expect(report.dryRun).toBe(true);
    expect(await db.higherStudyUniversity.count()).toBe(before);
  });
  it("duplicate rows are skipped, not re-imported", async () => {
    const country = await db.higherStudyCountry.findFirst();
    const report = await importDiscoveredUniversities([
      { universityName: "Test Intelligence University", countrySlug: country!.slug, sourceOrgKey: "applyboard-assist" },
    ]);
    expect(report.created).toBe(0);
    expect(report.skippedDuplicates).toBe(1);
  });
  it("rejects a non-Level-2 source org key and missing country (never guesses values)", async () => {
    const report = await importDiscoveredUniversities([
      { universityName: "Bad Source University", countrySlug: "united-kingdom", sourceOrgKey: "official-university" },
      { universityName: "No Country University" },
    ]);
    expect(report.created).toBe(0);
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0].error).toMatch(/not a Level 2/i);
    expect(report.errors[1].error).toMatch(/country/i);
  });
});

describe("University & course intelligence — conflicts preserve every candidate (§3)", () => {
  it("detects disagreement, flags evidence CONFLICTING_INFORMATION, opens human review; never auto-chooses", async () => {
    const uni = await db.higherStudyUniversity.findFirst({ where: { officialName: "Test Intelligence University" } });
    expect(uni).toBeTruthy();
    await db.higherStudyEvidence.create({
      data: {
        entityType: "university", entityId: uni!.id, field: "tuitionFeeRange",
        sourceOrgKey: "official-university", sourceLevel: "L1_OFFICIAL", sourceType: "uni-fees",
        sourceUrl: "https://www.test-intelligence-university.example/fees",
        normalisedValue: "£20,000 per year", originalWording: "International fee £20,000 per year", status: "OFFICIAL_SOURCE_VERIFIED",
      },
    });
    await db.higherStudyEvidence.create({
      data: {
        entityType: "university", entityId: uni!.id, field: "tuitionFeeRange",
        sourceOrgKey: "applyboard-assist", sourceLevel: "L2_DISCOVERY", sourceType: "discovery",
        sourceUrl: "https://www.applyboard.com/universities/test-intelligence-university",
        normalisedValue: "£22,000 per year", originalWording: "Tuition £22,000", status: "DISCOVERED",
      },
    });
    const conflicts = await detectConflictsForEntity("university", uni!.id, "tuitionFeeRange");
    expect(conflicts).toHaveLength(1);
    const conflict = await db.higherStudyConflict.findUnique({ where: { id: conflicts[0].conflictId } });
    const candidates = JSON.parse(conflict!.candidates);
    expect(candidates).toHaveLength(2); // both values preserved
    expect(candidates.map((c: { normalisedValue: string }) => c.normalisedValue).sort()).toEqual(["£20,000 per year", "£22,000 per year"]);
    const flagged = await db.higherStudyEvidence.findMany({ where: { entityId: uni!.id, field: "tuitionFeeRange" } });
    expect(flagged.every((f) => f.status === "CONFLICTING_INFORMATION")).toBe(true);
    const task = await db.higherStudyReviewTask.findFirst({ where: { refId: conflict!.id, type: "resolve-conflict" } });
    expect(task?.status).toBe("pending");
  });
  it("resolution must pick one of the preserved candidates; L1 choice verifies, non-candidates rejected", async () => {
    const uni = await db.higherStudyUniversity.findFirst({ where: { officialName: "Test Intelligence University" } });
    const conflict = await db.higherStudyConflict.findFirst({ where: { entityId: uni!.id, field: "tuitionFeeRange", status: "open" } });
    expect(conflict).toBeTruthy();
    const bad = await resolveConflict(conflict!.id, "https://not-a-candidate.example/fees", "admin-1", "should fail");
    expect(bad.ok).toBe(false);
    const good = await resolveConflict(conflict!.id, "https://www.test-intelligence-university.example/fees", "admin-1", "official fee page wins over aggregator");
    expect(good.ok).toBe(true);
    expect(good.chosenStatus).toBe("OFFICIAL_SOURCE_VERIFIED"); // L1 source verifies
    const resolved = await db.higherStudyConflict.findUnique({ where: { id: conflict!.id } });
    expect(resolved!.status).toBe("resolved");
    expect(resolved!.candidates).toContain("£22,000 per year"); // losing candidate stays on record
    const chosen = await db.higherStudyEvidence.findFirst({ where: { sourceUrl: "https://www.test-intelligence-university.example/fees" } });
    expect(chosen!.status).toBe("OFFICIAL_SOURCE_VERIFIED");
  });
});

describe("University & course intelligence — publication gate (§8, §9)", () => {
  it("blocks approval while displayed facts are unverified, then allows after L1 verification", async () => {
    const uni = await db.higherStudyUniversity.findFirst({ where: { officialName: "Test Intelligence University" } });
    // The discovery-imported record is unverified → publication blocked.
    const blocked = await approvePublication("university", uni!.id, "admin-1");
    expect(blocked.ok).toBe(false);
    expect(blocked.blockers!.length).toBeGreaterThan(0);
    // Walk the existence evidence through the real state machine against the
    // university's own official website (Level 1): discovered → source check → verified.
    const existence = await db.higherStudyEvidence.findFirst({ where: { entityId: uni!.id, field: "existence" } });
    await db.higherStudyEvidence.update({
      where: { id: existence!.id },
      data: { sourceLevel: "L1_OFFICIAL", sourceOrgKey: "official-university", sourceUrl: "https://www.test-intelligence-university.example" },
    });
    const first = await evidencePatch(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/evidence", {
        method: "PATCH", body: JSON.stringify({ id: existence!.id, status: "SOURCE_CHECK_REQUIRED" }),
      })
    );
    expect(first.status).toBe(200);
    const second = await evidencePatch(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/evidence", {
        method: "PATCH", body: JSON.stringify({ id: existence!.id, status: "OFFICIAL_SOURCE_VERIFIED" }),
      })
    );
    expect(second.status).toBe(200);
    // Verify every displayed field with L1 evidence
    for (const field of ["tuitionFeeRange", "applicationDeadlines", "ieltsRequirement", "academicEntryRequirements"]) {
      const existing = await db.higherStudyEvidence.findFirst({ where: { entityType: "university", entityId: uni!.id, field } });
      if (existing) await db.higherStudyEvidence.update({ where: { id: existing.id }, data: { status: "OFFICIAL_SOURCE_VERIFIED" } });
      else await db.higherStudyEvidence.create({
        data: {
          entityType: "university", entityId: uni!.id, field,
          sourceOrgKey: "official-university", sourceLevel: "L1_OFFICIAL", sourceType: "uni-admissions",
          sourceUrl: `https://www.test-intelligence-university.example/${field}`,
          normalisedValue: `verified ${field} value`, status: "OFFICIAL_SOURCE_VERIFIED",
        },
      });
    }
    const ok = await approvePublication("university", uni!.id, "admin-1");
    expect(ok.ok).toBe(true);
    const approved = await db.higherStudyEvidence.findMany({ where: { entityId: uni!.id, status: "APPROVED_FOR_PUBLICATION" } });
    expect(approved.length).toBeGreaterThanOrEqual(4);
  });
  it("evidence PATCH enforces legal transitions and L1-only verification via the API", async () => {
    const l2Evidence = await db.higherStudyEvidence.findFirst({
      where: { sourceLevel: "L2_DISCOVERY", field: "tuitionFeeRange" },
      orderBy: { collectedAt: "desc" },
    });
    expect(l2Evidence).toBeTruthy();
    // Level 2 sources can never mark a fact verified.
    const tryVerifyL2 = await evidencePatch(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/evidence", {
        method: "PATCH", body: JSON.stringify({ id: l2Evidence!.id, status: "OFFICIAL_SOURCE_VERIFIED" }),
      })
    );
    expect(tryVerifyL2.status).toBe(422);
    // CONFLICTING_INFORMATION cannot jump to publication.
    const illegal = await evidencePatch(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/evidence", {
        method: "PATCH", body: JSON.stringify({ id: l2Evidence!.id, status: "APPROVED_FOR_PUBLICATION" }),
      })
    );
    expect(illegal.status).toBe(422);
    // CONFLICTING_INFORMATION → HUMAN_REVIEW_REQUIRED is a legal escalation.
    const legal = await evidencePatch(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/evidence", {
        method: "PATCH", body: JSON.stringify({ id: l2Evidence!.id, status: "HUMAN_REVIEW_REQUIRED" }),
      })
    );
    expect(legal.status).toBe(200);
  });
});

describe("University & course intelligence — dashboard, conflicts and jobs endpoints (§8)", () => {
  it("dashboard lists documented sources and queue counts for a super admin", async () => {
    const res = await intelligenceGet(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sources.length).toBeGreaterThanOrEqual(8);
    expect(body.data.queues).toBeTruthy();
  });
  it("conflicts endpoint lists conflicts with their preserved candidates", async () => {
    const res = await conflictsGet(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/conflicts?status=resolved")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conflicts.length).toBeGreaterThanOrEqual(1);
    const c = body.data.conflicts[0];
    expect(JSON.parse(c.candidates).length).toBe(2);
  });
  it("jobs endpoint reports counts; a resolved conflict cannot be resolved twice", async () => {
    const res = await jobsGet(await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/jobs"));
    expect(res.status).toBe(200);
    const conflict = await db.higherStudyConflict.findFirst({ where: { status: "resolved" } });
    const again = await conflictsPost(
      await adminReq("http://localhost/api/v1/higher-study/admin/intelligence/conflicts", {
        method: "POST",
        body: JSON.stringify({ id: conflict!.id, chosenSourceUrl: "https://www.applyboard.com", reason: "double resolve" }),
      })
    );
    expect(again.status).toBe(422);
  });
});
