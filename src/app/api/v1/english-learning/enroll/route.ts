/**
 * POST /api/v1/english-learning/enroll
 * --------------------------------------------------------------------
 * Create an enrollment (anonymous session or authenticated user) for a
 * published course. Idempotent — if (sessionId, courseId) already
 * exists, returns the existing enrollment.
 *
 * Body:
 *   {
 *     "sessionId":  "anon-...",         // required (or x-session-id header)
 *     "courseSlug": "ielts-reading-bootcamp" // required
 *   }
 *
 * Side effects:
 *   - Increments `course.enrollmentCount` if a new row was created.
 *   - Returns 404 if the course doesn't exist / isn't published.
 *
 * Rate limit: 20 req/min per IP.
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

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export async function POST(req: NextRequest) {
  const ip = hashIp(
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown",
    resolveEnglishLearningIpSalt(),
  );
  if (rateLimit(ip, 20)) {
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

    const sessionId =
      safeString((body as Record<string, unknown>).sessionId as string) ||
      safeString(req.headers.get("x-session-id"));
    const courseSlug = safeString(
      (body as Record<string, unknown>).courseSlug as string,
    );

    const errors: string[] = [];
    if (!sessionId) {
      errors.push("sessionId_required");
    } else if (!SESSION_ID_RE.test(sessionId)) {
      errors.push("invalid_sessionId");
    }
    if (!courseSlug) errors.push("courseSlug_required");
    if (errors.length > 0) {
      return jsonResponse(false, "Validation failed.", null, {}, errors, 400);
    }

    const course = await db.englishLearningCourse.findFirst({
      where: { slug: courseSlug, isPublished: true },
      select: { id: true, slug: true, title: true },
    });
    if (!course) {
      return jsonResponse(
        false,
        "Course not found.",
        null,
        {},
        ["course_not_found"],
        404,
      );
    }

    const currentSession = await getSessionFromRequest(req);
    const currentUserId = currentSession?.userId ?? null;

    // Check if an enrollment for (sessionId, courseId) already exists
    // and ensure a user-owned enrollment cannot be hijacked by an anonymous session.
    const existing = await db.englishLearningEnrollment.findUnique({
      where: {
        sessionId_courseId: { sessionId, courseId: course.id },
      },
      select: { id: true, userId: true },
    });
    if (
      existing &&
      existing.userId &&
      existing.userId !== currentUserId
    ) {
      return jsonResponse(
        false,
        "Forbidden: enrollment belongs to another user.",
        null,
        {},
        ["forbidden_enrollment_ownership"],
        403,
      );
    }

    const enrollment = await db.englishLearningEnrollment.upsert({
      where: {
        sessionId_courseId: { sessionId, courseId: course.id },
      },
      update: {
        lastAccessedAt: new Date(),
        ...(currentUserId ? { userId: currentUserId } : {}),
      },
      create: {
        sessionId,
        courseId: course.id,
        userId: currentUserId,
        status: "enrolled",
        progressPercent: 0,
        lastAccessedAt: new Date(),
      },
      select: {
        id: true,
        sessionId: true,
        courseId: true,
        status: true,
        progressPercent: true,
        createdAt: true,
        lastAccessedAt: true,
      },
    });

    if (!existing) {
      await db.englishLearningCourse
        .update({
          where: { id: course.id },
          data: { enrollmentCount: { increment: 1 } },
        })
        .catch(() => null);
    }

    return jsonResponse(
      true,
      "Enrolled successfully.",
      {
        enrollment,
        course: { id: course.id, slug: course.slug, title: course.title },
      },
      {},
      [],
      201,
    );
  } catch (err) {
    console.error("[english-learning/enroll POST] error", err);
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
