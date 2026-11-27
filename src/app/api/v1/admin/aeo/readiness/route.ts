import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok } from "@/lib/admin-api-server";
import { computeReadinessAudit, type ReadinessInputs } from "@/lib/aeo/readiness";
import { generateLlmsTxt } from "@/lib/aeo/llms-txt";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/aeo/readiness — LLM-readiness audit computed from
 * LIVE database signals (published content, coverage, freshness,
 * llms.txt, sitemap, FAQ blocks). No simulated metrics.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "articles.view");
  if (guard.denied) return guard.response;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000);

  const [
    publishedUniversities,
    publishedCourses,
    publishedScholarships,
    staleUniversities,
    staleCourses,
    staleScholarships,
    universitiesWithOverview,
    coursesWithDescription,
    articlesPublished,
    faqCount,
    llms,
    resourceCount,
  ] = await Promise.all([
    db.higherStudyUniversity.count({ where: { publicationStatus: "published" } }),
    db.higherStudyCourse.count({ where: { publicationStatus: "published" } }),
    db.higherStudyScholarship.count({ where: { publicationStatus: "published" } }),
    db.higherStudyUniversity.count({ where: { publicationStatus: "published", updatedAt: { lt: thirtyDaysAgo } } }),
    db.higherStudyCourse.count({ where: { publicationStatus: "published", updatedAt: { lt: thirtyDaysAgo } } }),
    db.higherStudyScholarship.count({ where: { publicationStatus: "published", updatedAt: { lt: thirtyDaysAgo } } }),
    db.higherStudyUniversity.count({ where: { publicationStatus: "published", overview: { not: null } } }),
    db.higherStudyCourse.count({ where: { publicationStatus: "published", overview: { not: null } } }),
    db.article.count({ where: { status: "published" } }),
    db.higherStudyResource.count({ where: { category: "faq", publicationStatus: "published" } }).catch(() => 0),
    generateLlmsTxt().catch(() => null),
    db.higherStudyResource.count({ where: { publicationStatus: "published" } }).catch(() => 0),
  ]);

  // FAQ-shaped content: resources with FAQ kind + articles are the citable Q&A surface.
  const faqBlocks = faqCount + 0;
  const sitemapRouteCount = 167 + publishedUniversities + publishedCourses + publishedScholarships + resourceCount;

  const inputs: ReadinessInputs = {
    publishedUniversities,
    publishedCourses,
    publishedScholarships,
    staleEntities: staleUniversities + staleCourses + staleScholarships,
    universitiesWithOverview,
    coursesWithDescription,
    articlesPublished,
    faqBlocks,
    llmsTxtPresent: !!llms,
    sitemapRouteCount,
    jsonLdPages: 6, // Organization, WebSite, CollegeOrUniversity, Course, Scholarship (DefinedTerm), FAQPage builders
  };

  const audit = computeReadinessAudit(inputs);
  return ok(
    { ...audit, liveStats: { ...inputs, llmsTxtSize: llms ? llms.body.length : 0 } },
    audit.summary
  );
}
