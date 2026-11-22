import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST as enrollPost } from "@/app/api/v1/english-learning/enroll/route";
import {
  GET as progressGet,
  POST as progressPost,
} from "@/app/api/v1/english-learning/progress/route";

describe("Task 09 — English Learning Enrollment & Progress Ownership and State Validation", () => {
  const courseIds: string[] = [];
  const lessonIds: string[] = [];
  const testIds: string[] = [];
  const enrollmentIds: string[] = [];

  afterAll(async () => {
    if (enrollmentIds.length > 0) {
      await db.englishLearningEnrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    }
    if (lessonIds.length > 0) {
      await db.englishLearningLesson.deleteMany({
        where: { id: { in: lessonIds } },
      });
    }
    if (testIds.length > 0) {
      await db.englishLearningPracticeTest.deleteMany({
        where: { id: { in: testIds } },
      });
    }
    if (courseIds.length > 0) {
      await db.englishLearningCourse.deleteMany({
        where: { id: { in: courseIds } },
      });
    }
  });

  it("enforces sessionId ownership on progress updates, validates course lesson membership and test completion scores, and prevents completed status regression", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sessionA = `el_sess_owner_${suffix}`;
    const sessionB = `el_sess_other_${suffix}`;

    const courseA = await db.englishLearningCourse.create({
      data: {
        slug: `course-a-${suffix}`,
        title: "IELTS Academic Reading Mastery",
        level: "intermediate",
        isPublished: true,
      },
    });
    const courseB = await db.englishLearningCourse.create({
      data: {
        slug: `course-b-${suffix}`,
        title: "Spoken English Fluency",
        level: "beginner",
        isPublished: true,
      },
    });
    courseIds.push(courseA.id, courseB.id);

    const lessonA1 = await db.englishLearningLesson.create({
      data: {
        courseId: courseA.id,
        slug: `lesson-a1-${suffix}`,
        title: "Skimming and Scanning",
        isPublished: true,
        orderIndex: 1,
      },
    });
    const lessonB1 = await db.englishLearningLesson.create({
      data: {
        courseId: courseB.id,
        slug: `lesson-b1-${suffix}`,
        title: "Unrelated Course Lesson",
        isPublished: true,
        orderIndex: 1,
      },
    });
    lessonIds.push(lessonA1.id, lessonB1.id);

    const practiceTest = await db.englishLearningPracticeTest.create({
      data: {
        slug: `test-a-${suffix}`,
        title: "IELTS Reading Mini Mock",
        testType: "ielts-reading",
        level: "intermediate",
        isPublished: true,
      },
    });
    testIds.push(practiceTest.id);

    // 1. Enroll sessionA in courseA
    const enrollRes = await enrollPost(
      new NextRequest("http://localhost/api/v1/english-learning/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionA,
          courseSlug: courseA.slug,
        }),
      }),
    );
    expect(enrollRes.status).toBe(201);
    const enrollment = (await enrollRes.json()).data.enrollment as {
      id: string;
    };
    enrollmentIds.push(enrollment.id);

    // 2. Reject progress update when sessionId is missing -> 400
    const missingSessionRes = await progressPost(
      new NextRequest("http://localhost/api/v1/english-learning/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          lessonId: lessonA1.id,
          status: "completed",
        }),
      }),
    );
    expect(missingSessionRes.status).toBe(400);

    // 3. Reject progress update when sessionB attempts to mutate sessionA's enrollment -> 403
    const crossSessionRes = await progressPost(
      new NextRequest("http://localhost/api/v1/english-learning/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          sessionId: sessionB,
          lessonId: lessonA1.id,
          status: "completed",
        }),
      }),
    );
    expect(crossSessionRes.status).toBe(403);
    const crossSessionJson = await crossSessionRes.json();
    expect(crossSessionJson.errors).toContain("forbidden_enrollment_ownership");

    // 4. Reject lesson belonging to a different course (courseB) -> 400
    const wrongCourseLessonRes = await progressPost(
      new NextRequest("http://localhost/api/v1/english-learning/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          sessionId: sessionA,
          lessonId: lessonB1.id,
          status: "completed",
        }),
      }),
    );
    expect(wrongCourseLessonRes.status).toBe(400);
    expect((await wrongCourseLessonRes.json()).errors).toContain(
      "invalid_lesson_for_course",
    );

    // 5. Reject marking a practice test completed without scorePercent -> 400
    const testNoScoreRes = await progressPost(
      new NextRequest("http://localhost/api/v1/english-learning/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          sessionId: sessionA,
          testId: practiceTest.id,
          status: "completed",
        }),
      }),
    );
    expect(testNoScoreRes.status).toBe(400);
    expect((await testNoScoreRes.json()).errors).toContain(
      "scorePercent_required_for_test_completion",
    );

    // 6. Valid lesson completion by owner sessionA -> 200 and updates enrollment progressPercent to 100
    const validLessonRes = await progressPost(
      new NextRequest("http://localhost/api/v1/english-learning/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          sessionId: sessionA,
          lessonId: lessonA1.id,
          status: "completed",
          timeSpentMinutes: 25,
        }),
      }),
    );
    expect(validLessonRes.status).toBe(200);

    // 7. Reject regressing completed lesson back to not-started -> 409
    const regressionRes = await progressPost(
      new NextRequest("http://localhost/api/v1/english-learning/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          sessionId: sessionA,
          lessonId: lessonA1.id,
          status: "not-started",
        }),
      }),
    );
    expect(regressionRes.status).toBe(409);
    expect((await regressionRes.json()).errors).toContain(
      "invalid_status_regression",
    );

    // 8. Verify GET /api/v1/english-learning/progress returns updated 100% completion for sessionA
    const getRes = await progressGet(
      new NextRequest(
        `http://localhost/api/v1/english-learning/progress?sessionId=${sessionA}`,
      ),
    );
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.data.enrollments).toHaveLength(1);
    expect(getJson.data.enrollments[0].progressPercent).toBe(100);
    expect(getJson.data.enrollments[0].status).toBe("completed");
  });
});
