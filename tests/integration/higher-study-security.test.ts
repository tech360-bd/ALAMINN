import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createToken, AUTH_COOKIE } from "@/lib/auth/jwt";
import { signReferralCallback } from "@/lib/higher-study/api-helpers";
import { POST as createReferralPost } from "@/app/api/v1/higher-study/referral/route";
import { POST as confirmReferralPost } from "@/app/api/v1/higher-study/referral/[code]/confirm/route";
import {
  GET as getSavedItems,
  POST as createSavedItem,
} from "@/app/api/v1/higher-study/saved/route";
import { DELETE as deleteSavedItem } from "@/app/api/v1/higher-study/saved/[id]/route";
import {
  GET as getAlerts,
  POST as createAlert,
} from "@/app/api/v1/higher-study/alerts/route";
import { DELETE as deleteAlert } from "@/app/api/v1/higher-study/alerts/[id]/route";

const TEST_REFERRAL_SECRET = "higher-study-referral-hmac-secret-test-32bytes";

describe("Task 03 — Higher Study Referral Callback Auth & Saved/Alert Ownership Isolation", () => {
  const origReferralSecret = process.env.HIGHER_STUDY_REFERRAL_SECRET;
  const origNodeEnv = process.env.NODE_ENV;
  const createdReferralIds: string[] = [];
  const createdSavedIds: string[] = [];
  const createdAlertIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeEach(() => {
    process.env.HIGHER_STUDY_REFERRAL_SECRET = TEST_REFERRAL_SECRET;
  });

  afterEach(() => {
    if (origReferralSecret === undefined) {
      delete process.env.HIGHER_STUDY_REFERRAL_SECRET;
    } else {
      process.env.HIGHER_STUDY_REFERRAL_SECRET = origReferralSecret;
    }
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  afterAll(async () => {
    if (createdReferralIds.length > 0) {
      await db.higherStudyReferral.deleteMany({
        where: { id: { in: createdReferralIds } },
      });
    }
    if (createdSavedIds.length > 0) {
      await db.higherStudySavedItem.deleteMany({
        where: { id: { in: createdSavedIds } },
      });
    }
    if (createdAlertIds.length > 0) {
      await db.higherStudyAlert.deleteMany({
        where: { id: { in: createdAlertIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await db.$disconnect();
    rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
  });

  it("prevents confirming a referral with the browser-facing referralToken and requires server-to-server HMAC over raw body", async () => {
    // 1. Create referral as anonymous visitor
    const createReq = new NextRequest(
      "http://localhost/api/v1/higher-study/referral",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({
          referralType: "consultation",
          consentGiven: true,
          consentVersion: "v1.0",
        }),
      },
    );
    const createRes = await createReferralPost(createReq);
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.success).toBe(true);

    const { referralCode, referralToken, referralId } = createJson.data as {
      referralCode: string;
      referralToken: string;
      referralId: string;
    };
    createdReferralIds.push(referralId);

    const confirmBody = JSON.stringify({
      status: "completed",
      aloStudentId: "ALO-9001",
    });

    // 2. Attempt to confirm using the browser-facing referralToken -> MUST fail with 401
    const forgeWithBrowserTokenReq = new NextRequest(
      `http://localhost/api/v1/higher-study/referral/${referralCode}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alaminn-signature": referralToken,
        },
        body: confirmBody,
      },
    );
    const forgeRes = await confirmReferralPost(forgeWithBrowserTokenReq, {
      params: Promise.resolve({ code: referralCode }),
    });
    expect(forgeRes.status).toBe(401);

    // 3. Attempt to confirm with an invalid HMAC signature -> MUST fail with 401
    const badHmacReq = new NextRequest(
      `http://localhost/api/v1/higher-study/referral/${referralCode}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alaminn-signature": "sha256=" + "0".repeat(64),
        },
        body: confirmBody,
      },
    );
    const badHmacRes = await confirmReferralPost(badHmacReq, {
      params: Promise.resolve({ code: referralCode }),
    });
    expect(badHmacRes.status).toBe(401);

    // 4. Confirm with genuine server-to-server HMAC over `${referralCode}.${rawBody}` -> 200
    const validCallbackSig = signReferralCallback(
      referralCode,
      confirmBody,
      TEST_REFERRAL_SECRET,
    );
    const validConfirmReq = new NextRequest(
      `http://localhost/api/v1/higher-study/referral/${referralCode}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alaminn-signature": validCallbackSig,
        },
        body: confirmBody,
      },
    );
    const validConfirmRes = await confirmReferralPost(validConfirmReq, {
      params: Promise.resolve({ code: referralCode }),
    });
    expect(validConfirmRes.status).toBe(200);
    const confirmJson = await validConfirmRes.json();
    expect(confirmJson.data.status).toBe("completed");

    // 5. Duplicate/replayed confirmation after terminal state -> 409 Conflict
    const replayConfirmReq = new NextRequest(
      `http://localhost/api/v1/higher-study/referral/${referralCode}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alaminn-signature": validCallbackSig,
        },
        body: confirmBody,
      },
    );
    const replayConfirmRes = await confirmReferralPost(replayConfirmReq, {
      params: Promise.resolve({ code: referralCode }),
    });
    expect(replayConfirmRes.status).toBe(409);
  });

  it("rejects confirmation of expired referrals with 410 and fails closed with 503 in production when secret is missing", async () => {
    const expiredCode = `HSEXP${Date.now().toString().slice(-6)}`;
    const expiredRow = await db.higherStudyReferral.create({
      data: {
        referralCode: expiredCode,
        referralType: "consultation",
        targetUrl: "https://aloeducation.com/apply",
        status: "transferred",
        consentGiven: true,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days old
      },
    });
    createdReferralIds.push(expiredRow.id);

    const body = JSON.stringify({ status: "completed" });
    const sig = signReferralCallback(expiredCode, body, TEST_REFERRAL_SECRET);
    const expiredReq = new NextRequest(
      `http://localhost/api/v1/higher-study/referral/${expiredCode}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alaminn-signature": sig,
        },
        body,
      },
    );
    const expiredRes = await confirmReferralPost(expiredReq, {
      params: Promise.resolve({ code: expiredCode }),
    });
    expect(expiredRes.status).toBe(410);

    // Production fail-closed when secret is missing
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.HIGHER_STUDY_REFERRAL_SECRET;
    const origAuth = process.env.AUTH_SECRET;
    const origJwt = process.env.JWT_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const noSecretRes = await confirmReferralPost(
        new NextRequest(
          `http://localhost/api/v1/higher-study/referral/${expiredCode}/confirm`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-alaminn-signature": sig,
            },
            body,
          },
        ),
        { params: Promise.resolve({ code: expiredCode }) },
      );
      expect(noSecretRes.status).toBe(503);
    } finally {
      if (origAuth !== undefined) process.env.AUTH_SECRET = origAuth;
      if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
    }
  });

  it("isolates saved items and alerts across anonymous sessions and prevents anonymous access to user-owned records", async () => {
    const sessionA = `sess_alpha_${Date.now()}`;
    const sessionB = `sess_bravo_${Date.now()}`;

    // Session A creates a saved item
    const saveRes = await createSavedItem(
      new NextRequest("http://localhost/api/v1/higher-study/saved", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionA,
        },
        body: JSON.stringify({
          entityType: "university",
          entitySlug: "university-of-oxford",
          entityName: "University of Oxford",
          notes: "Top choice",
        }),
      }),
    );
    expect(saveRes.status).toBe(200);
    const savedItem = (await saveRes.json()).data as { id: string };
    createdSavedIds.push(savedItem.id);

    // Session B cannot delete Session A's saved item -> 404
    const crossDeleteRes = await deleteSavedItem(
      new NextRequest(
        `http://localhost/api/v1/higher-study/saved/${savedItem.id}`,
        {
          method: "DELETE",
          headers: { "x-session-id": sessionB },
        },
      ),
      { params: Promise.resolve({ id: savedItem.id }) },
    );
    expect(crossDeleteRes.status).toBe(404);

    // Authenticated user creates an alert while also sending sessionId
    const testUser = await db.user.create({
      data: {
        email: `hs-owner-${Date.now()}@example.invalid`,
        name: "HS Owner",
        passwordHash: "unused",
        role: "VIEWER",
        status: "active",
      },
    });
    createdUserIds.push(testUser.id);
    const userJwt = await createToken(testUser.id, "VIEWER", {
      email: testUser.email,
      name: testUser.name,
    });

    const alertCreateRes = await createAlert(
      new NextRequest("http://localhost/api/v1/higher-study/alerts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${AUTH_COOKIE}=${userJwt}`,
          "x-session-id": sessionA,
        },
        body: JSON.stringify({
          entityType: "scholarship",
          entitySlug: "chevening-scholarship",
          entityName: "Chevening Scholarship",
          alertChannel: "email",
          email: "student@example.invalid",
          consentGiven: true,
          deadlineDate: new Date(Date.now() + 86400_000).toISOString(),
        }),
      }),
    );
    expect(alertCreateRes.status).toBe(200);
    const createdAlert = (await alertCreateRes.json()).data as { id: string };
    createdAlertIds.push(createdAlert.id);

    // Anonymous caller presenting the same sessionA MUST NOT see or delete the user-owned alert
    const anonListAlertsRes = await getAlerts(
      new NextRequest(
        `http://localhost/api/v1/higher-study/alerts?sessionId=${sessionA}`,
      ),
    );
    expect(anonListAlertsRes.status).toBe(200);
    const anonAlertsData = (await anonListAlertsRes.json()).data as {
      alerts?: Array<{ id: string }>;
    } | Array<{ id: string }>;
    const anonAlerts = Array.isArray(anonAlertsData)
      ? anonAlertsData
      : (anonAlertsData.alerts ?? []);
    expect(anonAlerts.some((a) => a.id === createdAlert.id)).toBe(false);

    const anonDeleteAlertRes = await deleteAlert(
      new NextRequest(
        `http://localhost/api/v1/higher-study/alerts/${createdAlert.id}`,
        {
          method: "DELETE",
          headers: { "x-session-id": sessionA },
        },
      ),
      { params: Promise.resolve({ id: createdAlert.id }) },
    );
    expect(anonDeleteAlertRes.status).toBe(404);

    // Authenticated owner CAN delete their alert -> 200
    const ownerDeleteAlertRes = await deleteAlert(
      new NextRequest(
        `http://localhost/api/v1/higher-study/alerts/${createdAlert.id}`,
        {
          method: "DELETE",
          headers: { cookie: `${AUTH_COOKIE}=${userJwt}` },
        },
      ),
      { params: Promise.resolve({ id: createdAlert.id }) },
    );
    expect(ownerDeleteAlertRes.status).toBe(200);

    // Session A can list its own anonymous saved item
    const sessionAListRes = await getSavedItems(
      new NextRequest("http://localhost/api/v1/higher-study/saved", {
        headers: { "x-session-id": sessionA },
      }),
    );
    expect(sessionAListRes.status).toBe(200);
    const sessionASaved = (await sessionAListRes.json()).data as {
      items: Array<{ id: string }>;
    };
    expect(sessionASaved.items.some((s) => s.id === savedItem.id)).toBe(true);
  });
});
