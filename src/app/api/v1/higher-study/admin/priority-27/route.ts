/**
 * GET /api/v1/higher-study/admin/priority-27
 * ==========================================
 * Dashboard endpoint for the 27 "priority" UK universities that the
 * Alaminn.info higher-study platform is committed to seeding with at
 * minimum MSc + MRes + PhD course records (see
 * docs/higher-study/priority-27-universities.md).
 *
 * Returns a completion matrix: for each priority slug we report whether
 * the university row exists, its verification status, and which of the
 * eight coverage categories have data:
 *   1. academicEntryRequirements
 *   2. englishWaiverPolicy
 *   3. ieltsRequirement
 *   4. pteRequirement
 *   5. toeflRequirement
 *   6. duolingoRequirement
 *   7. has courses (≥1)
 *   8. has supervisors (≥1) OR scholarships (≥1)
 *
 * The endpoint is read-only and gated behind the
 * `higher-study.universities.view` permission.
 *
 * Spec reference: docs/higher-study/priority-27-universities.md
 */

import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail } from "@/lib/admin-api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The 27 priority UK university slugs (in priority order). Slugs match
 * the `slug` column on `HigherStudyUniversity` and the catalogue in
 * `prisma/seed-higher-study-more.ts`. Adding/removing a slug here is
 * the single source of truth for "what counts as priority-27".
 */
export const PRIORITY_27_SLUGS: string[] = [
  "university-of-oxford",
  "university-of-cambridge",
  "imperial-college-london",
  "ucl",
  "london-school-of-economics",
  "kings-college-london",
  "university-of-edinburgh",
  "university-of-manchester",
  "university-of-warwick",
  "university-of-bristol",
  "university-of-leeds",
  "university-of-glasgow",
  "durham-university",
  "university-of-birmingham",
  "university-of-nottingham",
  "university-of-southampton",
  "university-of-sheffield",
  "university-of-york",
  "lancaster-university",
  "university-of-bath",
  "university-of-exeter",
  "queen-mary-university-of-london",
  "university-of-liverpool",
  "cardiff-university",
  "newcastle-university",
  "queens-university-belfast",
  "university-of-leicester",
];

/** Eight coverage categories checked for each priority university. */
const COVERAGE_KEYS = [
  "academicEntryRequirements",
  "englishWaiverPolicy",
  "ieltsRequirement",
  "pteRequirement",
  "toeflRequirement",
  "duolingoRequirement",
  "hasCourses",
  "hasSupervisorsOrScholarships",
] as const;

type CoverageKey = (typeof COVERAGE_KEYS)[number];

interface PriorityUniversityStatus {
  slug: string;
  exists: boolean;
  officialName: string | null;
  officialWebsite: string | null;
  verificationStatus: string | null;
  lastVerifiedAt: string | null;
  officialSourceUrl: string | null;
  coverage: Record<CoverageKey, boolean>;
  coveragePct: number;
}

/**
 * GET handler. Returns:
 *   {
 *     totalUniversities: 27,
 *     seededUniversities: number,
 *     missingUniversities: number,
 *     overallCompletionPct: number,
 *     universities: PriorityUniversityStatus[]
 *   }
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "higher-study.universities.view");
  if (guard.denied) return guard.response;

  try {
    const rows = await db.higherStudyUniversity.findMany({
      where: { slug: { in: PRIORITY_27_SLUGS } },
      select: {
        slug: true,
        officialName: true,
        officialWebsite: true,
        verificationStatus: true,
        lastVerifiedAt: true,
        officialSourceUrl: true,
        academicEntryRequirements: true,
        englishWaiverPolicy: true,
        ieltsRequirement: true,
        pteRequirement: true,
        toeflRequirement: true,
        duolingoRequirement: true,
        _count: {
          select: {
            courses: true,
            supervisors: true,
            scholarships: true,
          },
        },
      },
    });

    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    const universities: PriorityUniversityStatus[] = PRIORITY_27_SLUGS.map((slug) => {
      const row = bySlug.get(slug);
      if (!row) {
        const empty: Record<CoverageKey, boolean> = {
          academicEntryRequirements: false,
          englishWaiverPolicy: false,
          ieltsRequirement: false,
          pteRequirement: false,
          toeflRequirement: false,
          duolingoRequirement: false,
          hasCourses: false,
          hasSupervisorsOrScholarships: false,
        };
        return {
          slug,
          exists: false,
          officialName: null,
          officialWebsite: null,
          verificationStatus: null,
          lastVerifiedAt: null,
          officialSourceUrl: null,
          coverage: empty,
          coveragePct: 0,
        };
      }

      const coverage: Record<CoverageKey, boolean> = {
        academicEntryRequirements: !!row.academicEntryRequirements,
        englishWaiverPolicy: !!row.englishWaiverPolicy,
        ieltsRequirement: !!row.ieltsRequirement,
        pteRequirement: !!row.pteRequirement,
        toeflRequirement: !!row.toeflRequirement,
        duolingoRequirement: !!row.duolingoRequirement,
        hasCourses: (row._count?.courses ?? 0) > 0,
        hasSupervisorsOrScholarships:
          (row._count?.supervisors ?? 0) > 0 || (row._count?.scholarships ?? 0) > 0,
      };

      const covered = COVERAGE_KEYS.filter((k) => coverage[k]).length;
      return {
        slug,
        exists: true,
        officialName: row.officialName,
        officialWebsite: row.officialWebsite,
        verificationStatus: row.verificationStatus,
        lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
        officialSourceUrl: row.officialSourceUrl,
        coverage,
        coveragePct: Math.round((covered / COVERAGE_KEYS.length) * 100),
      };
    });

    const seededUniversities = universities.filter((u) => u.exists).length;
    const missingUniversities = universities.length - seededUniversities;
    const overallCompletionPct = Math.round(
      (universities.reduce((sum, u) => sum + u.coveragePct, 0) /
        (universities.length * 100)) * 100,
    );

    return ok(
      {
        totalUniversities: PRIORITY_27_SLUGS.length,
        seededUniversities,
        missingUniversities,
        overallCompletionPct,
        universities,
      },
      "Priority-27 dashboard loaded.",
    );
  } catch (e) {
    return fail(
      "Failed to load priority-27 dashboard.",
      [(e as Error).message],
      500,
    );
  }
}
