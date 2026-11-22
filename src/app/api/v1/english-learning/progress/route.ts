/**
 * POST /api/v1/english-learning/progress
 * --------------------------------------------------------------------
 * Upsert a lesson or practice-test progress record inside an existing
 * enrollment.
 *
 * Body:
 *   {
 *     "enrollmentId": "...",         // required
 *     "sessionId":    "...",         // required (or x-session-id header) — must own enrollment
 *     "lessonId"?:    "...",         // mutually exclusive with testId
 *     "testId"?:      "...",         // mutually exclusive with lessonId
 *     "status"?:      "not-started" | "in-progress" | "completed",
 *     "scorePercent"?: 0..100,
 *     "timeSpentMinutes"?: 0..600
 *   }
 *
 * Ownership & Transition Guarantees:
 *   - Caller's `sessionId` (or authenticated `userId`) MUST match the
 *     target enrollment; cross-session progress mutation returns 403.
 *   - `lessonId` must belong to `enrollment.courseId` and be published.
 *   - `testId` must exist and be published; marking a test `completed`
 *     requires a valid `scorePercent` (0..100).
 *   - Progress rows already in `completed` state cannot regress to
 *     `not-started` (returns 409).
 *
 * GET /api/v1/english-learning/progress?sessionId=...
 * --------------------------------------------------------------------
 * Retrieve all enrollments + nested progress for a given `sessionId`.
 * Used by the /english-learning/progress dashboard.
 *
 * Rate limit: 60 req/min per IP.
 */
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import {
  jsonResponse,
  safeString,
  hashIp,
  resolveEnglishLearningIpSalt,
} from "@/lib/english-learning/api-helpers";
import { rateLimit } from "@/lib/english-learning/rate-limit";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["not-started", "in-progress", "completed"]);
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export async function POST(req: NextRequest) {
  const ip = hashIp(
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown",
    resolveEnglishLearningIpSalt(),
  );
  if (rateLimit(ip, 60)) {
    return jsonResponse(
      false,
      "Too many requests. Please slow down.",
      null,
      {},
      ["rate_limited"],
      429,
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(
        false,
        "Invalid request body.",
        null,
        {},
        ["invalid_body"],
        400,
      );
    }

    const record = body as Record<string, unknown>;
    const enrollmentId = safeString(record.enrollmentId as string);
    const sessionId =
      safeString(record.sessionId as string) ||
      safeString(req.headers.get("x-session-id"));
    const lessonId = safeString(record.lessonId as string);
    const testId = safeString(record.testId as string);
    const status = safeString(record.status as string);
    const scoreRaw = record.scorePercent;
    const timeRaw = record.timeSpentMinutes;

    const currentSession = await getSessionFromRequest(req);
    const currentUserId = currentSession?.userId ?? null;

    const errors: string[] = [];
    if (!enrollmentId) errors.push("enrollmentId_required");
    if (!sessionId && !currentUserId) {
      errors.push("sessionId_required");
    } else if (sessionId && !SESSION_ID_RE.test(sessionId)) {
      errors.push("invalid_sessionId");
    }
    if (!lessonId && !testId) errors.push("lessonId_or_testId_required");
    if (lessonId && testId) errors.push("ambiguous_target");
    if (status && !VALID_STATUSES.has(status)) errors.push("invalid_status");

    const scorePercent =
      scoreRaw !== undefined && scoreRaw !== null
        ? Math.max(0, Math.min(100, Math.round(Number(scoreRaw))))
        : null;
    if (scorePercent !== null && !Number.isFinite(scorePercent)) {
      errors.push("invalid_scorePercent");
    }

    const timeSpentMinutes =
      timeRaw !== undefined && timeRaw !== null
        ? Math.max(0, Math.min(600, Math.round(Number(timeRaw))))
        : null;
    if (timeSpentMinutes !== null && !Number.isFinite(timeSpentMinutes)) {
      errors.push("invalid_timeSpentMinutes");
    }

    if (errors.length > 0) {
      return jsonResponse(false, "Validation failed.", null, {}, errors, 400);
    }

    const enrollment = await db.englishLearningEnrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        courseId: true,
        sessionId: true,
        userId: true,
        status: true,
        progressPercent: true,
        completedAt: true,
      },
    });
    if (!enrollment) {
      return jsonResponse(
        false,
        "Enrollment not found.",
        null,
        {},
        ["enrollment_not_found"],
        404,
      );
    }

    // ── Ownership verification ──────────────────────────────────────
    if (enrollment.userId) {
      if (!currentUserId || currentUserId !== enrollment.userId) {
        return jsonResponse(
          false,
          "Forbidden: enrollment does not belong to the caller.",
          null,
          {},
          ["forbidden_enrollment_ownership"],
          403,
        );
      }
    } else {
      if (!sessionId || sessionId !== enrollment.sessionId) {
        return jsonResponse(
          false,
          "Forbidden: enrollment does not belong to this session.",
          null,
          {},
          ["forbidden_enrollment_ownership"],
          403,
        );
      }
    }

    // ── Lesson / Test membership & publication verification ─────────
    if (lessonId) {
      const lesson = await db.englishLearningLesson.findFirst({
        where: {
          id: lessonId,
          courseId: enrollment.courseId,
          isPublished: true,
        },
        select: { id: true },
      });
      if (!lesson) {
        return jsonResponse(
          false,
          "Lesson not found or does not belong to the enrolled course.",
          null,
          {},
          ["invalid_lesson_for_course"],
          400,
        );
      }
    }

    if (testId) {
      const test = await db.englishLearningPracticeTest.findFirst({
        where: {
          id: testId,
          isPublished: true,
        },
        select: { id: true },
      });
      if (!test) {
        return jsonResponse(
          false,
          "Practice test not found.",
          null,
          {},
          ["invalid_test"],
          400,
        );
      }
    }

    const where = {
      enrollmentId,
      ...(lessonId ? { lessonId } : {}),
      ...(testId ? { testId } : {}),
    };
    const existing = await db.englishLearningProgress.findFirst({
      where,
      select: { id: true, status: true, scorePercent: true },
    });

    const finalStatus = status || "in-progress";

    // Prevent regressing a completed item back to not-started.
    if (existing?.status === "completed" && finalStatus === "not-started") {
      return jsonResponse(
        false,
        "Completed progress items cannot regress to not-started.",
        null,
        {},
        ["invalid_status_regression"],
        409,
      );
    }

    // Completing a practice test requires a valid scorePercent.
    if (
      testId &&
      finalStatus === "completed" &&
      scorePercent === null &&
      (existing?.scorePercent === null || existing?.scorePercent === undefined)
    ) {
      return jsonResponse(
        false,
        "A valid scorePercent (0..100) is required when marking a practice test completed.",
        null,
        {},
        ["scorePercent_required_for_test_completion"],
        400,
      );
    }

    const now = new Date();

    let progress;
    if (existing) {
      progress = await db.englishLearningProgress.update({
        where: { id: existing.id },
        data: {
          status: finalStatus,
          scorePercent: scorePercent ?? undefined,
          ...(timeSpentMinutes
            ? { timeSpentMinutes: { increment: timeSpentMinutes } }
            : {}),
          lastAttemptAt: now,
          attemptsCount: { increment: 1 },
        },
      });
    } else {
      progress = await db.englishLearningProgress.create({
        data: {
          enrollmentId,
          lessonId: lessonId || null,
          testId: testId || null,
          status: finalStatus,
          scorePercent: scorePercent ?? undefined,
          timeSpentMinutes: timeSpentMinutes ?? 0,
          lastAttemptAt: now,
          attemptsCount: 1,
        },
      });
    }

    // Recalculate course-level progressPercent on the enrollment.
    if (finalStatus === "completed") {
      try {
        const totalLessons = await db.englishLearningLesson.count({
          where: { courseId: enrollment.courseId, isPublished: true },
        });
        const completedLessons = await db.englishLearningProgress.count({
          where: {
            enrollmentId,
            status: "completed",
            lessonId: { not: null },
          },
        });
        const pct =
          totalLessons > 0
            ? Math.min(100, Math.round((completedLessons / totalLessons) * 100))
            : 100;
        await db.englishLearningEnrollment.update({
          where: { id: enrollmentId },
          data: {
            progressPercent: pct,
            lastAccessedAt: now,
            status: pct >= 100 ? "completed" : "started",
            ...(pct >= 100 && !enrollment.completedAt
              ? { completedAt: now }
              : {}),
          },
        });
      } catch {
        // best-effort
      }
    } else if (enrollment.status !== "completed") {
      await db.englishLearningEnrollment
        .update({
          where: { id: enrollmentId },
          data: { lastAccessedAt: now, status: "started" },
        })
        .catch(() => null);
    }

    return jsonResponse(true, "Progress saved.", progress);
  } catch (err) {
    console.error("[english-learning/progress POST] error", err);
    return jsonResponse(
      false,
      "Internal server error.",
      null,
      {},
      ["internal"],
      500,
    );
  }
}

export async function GET(req: NextRequest) {
  const ip = hashIp(
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown",
    resolveEnglishLearningIpSalt(),
  );
  if (rateLimit(ip, 60)) {
    return jsonResponse(
      false,
      "Too many requests. Please slow down.",
      null,
      {},
      ["rate_limited"],
      429,
    );
  }

  try {
    const url = new URL(req.url);
    const sessionId =
      safeString(url.searchParams.get("sessionId")) ||
      safeString(req.headers.get("x-session-id"));
    if (!sessionId) {
      return jsonResponse(
        false,
        "sessionId query param is required.",
        null,
        {},
        ["sessionId_required"],
        400,
      );
    }
    if (!SESSION_ID_RE.test(sessionId)) {
      return jsonResponse(
        false,
        "Invalid sessionId format.",
        null,
        {},
        ["invalid_sessionId"],
        400,
      );
    }

    const currentSession = await getSessionFromRequest(req);
    const currentUserId = currentSession?.userId ?? null;

    const enrollments = await db.englishLearningEnrollment.findMany({
      where: currentUserId
        ? {
            sessionId,
            OR: [{ userId: null }, { userId: currentUserId }],
          }
        : {
            sessionId,
            userId: null,
          },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        sessionId: true,
        courseId: true,
        status: true,
        progressPercent: true,
        lastAccessedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            level: true,
            heroImageUrl: true,
          },
        },
        progress: {
          select: {
            id: true,
            status: true,
            scorePercent: true,
            timeSpentMinutes: true,
            lastAttemptAt: true,
            attemptsCount: true,
            lessonId: true,
            testId: true,
            lesson: {
              select: { id: true, slug: true, title: true, lessonType: true },
            },
            test: {
              select: { id: true, slug: true, title: true, testType: true },
            },
          },
        },
      },
    });

    return jsonResponse(
      true,
      "Progress retrieved.",
      { enrollments, count: enrollments.length },
    );
  } catch (err) {
    console.error("[english-learning/progress GET] error", err);
    return jsonResponse(
      false,
      "Internal server error.",
      null,
      {},
      ["internal"],
      500,
    );
  }
}
