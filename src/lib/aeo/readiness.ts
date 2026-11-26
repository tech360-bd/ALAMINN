/**
 * LLM-readiness audit — deterministic, evidence-based score for how
 * answer-engine friendly the site's LIVE data is.
 * -------------------------------------------------------------------
 * Every check reads real signals (DB rows + site config). Nothing is
 * simulated: a check that cannot see evidence fails or warns with the
 * reason, and the response lists the evidence per check.
 *
 * Score weights favor: structured data coverage (JSON-LD on
 * higher-study pages), fresh content, llms.txt presence, sitemap
 * coverage and FAQ-style content blocks.
 */

export interface ReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  weight: number;
  evidence: string;
  points: number; // earned points (weight * 1 / 0.5 / 0)
}

export interface ReadinessAudit {
  score: number; // 0-100
  checks: ReadinessCheck[];
  summary: string;
}

export interface ReadinessInputs {
  publishedUniversities: number;
  publishedCourses: number;
  publishedScholarships: number;
  staleEntities: number; // entries not updated in 30+ days
  universitiesWithOverview: number;
  coursesWithDescription: number;
  articlesPublished: number;
  faqBlocks: number; // FAQ/schema-friendly content blocks found in the CMS
  llmsTxtPresent: boolean;
  sitemapRouteCount: number;
  jsonLdPages: number; // pages emitting JSON-LD (higher-study details etc.)
}

function check(
  id: string,
  label: string,
  status: ReadinessCheck["status"],
  weight: number,
  evidence: string
): ReadinessCheck {
  return { id, label, status, weight, evidence, points: status === "pass" ? weight : status === "warn" ? weight * 0.5 : 0 };
}

export function computeReadinessAudit(input: ReadinessInputs): ReadinessAudit {
  const totalEntities = input.publishedUniversities + input.publishedCourses + input.publishedScholarships;
  const staleRatio = totalEntities > 0 ? input.staleEntities / totalEntities : 0;
  const overviewRatio = input.publishedUniversities > 0 ? input.universitiesWithOverview / input.publishedUniversities : 0;
  const descriptionRatio = input.publishedCourses > 0 ? input.coursesWithDescription / input.publishedCourses : 0;

  const checks: ReadinessCheck[] = [
    check("content-volume", "Published structured content", totalEntities >= 50 ? "pass" : totalEntities >= 10 ? "warn" : "fail", 3,
      `${input.publishedUniversities} universities, ${input.publishedCourses} courses, ${input.publishedScholarships} scholarships published.`),
    check("content-depth", "Descriptive depth (overview/description coverage)",
      overviewRatio >= 0.8 && descriptionRatio >= 0.8 ? "pass" : overviewRatio >= 0.5 && descriptionRatio >= 0.5 ? "warn" : "fail", 3,
      `${Math.round(overviewRatio * 100)}% of universities have an overview; ${Math.round(descriptionRatio * 100)}% of courses have a description. Answer engines quote descriptive pages.`),
    check("freshness", "Content freshness (< 30 days since update)", staleRatio <= 0.2 ? "pass" : staleRatio <= 0.5 ? "warn" : "fail", 2,
      `${input.staleEntities} of ${totalEntities} entities have not been updated in 30+ days (verification cron flags these weekly).`),
    check("llms-txt", "llms.txt availability for LLM crawlers", input.llmsTxtPresent ? "pass" : "fail", 2,
      input.llmsTxtPresent ? "/llms.txt is generated from live database content." : "/llms.txt is not configured — answer engines have no guided index of the catalog."),
    check("structured-data", "JSON-LD structured data coverage", input.jsonLdPages >= 5 ? "pass" : input.jsonLdPages >= 1 ? "warn" : "fail", 3,
      `${input.jsonLdPages} page types emit schema.org JSON-LD (Organization, WebSite, CollegeOrUniversity, Course, FAQPage).`),
    check("sitemap", "Sitemap coverage", input.sitemapRouteCount >= 50 ? "pass" : input.sitemapRouteCount >= 10 ? "warn" : "fail", 1,
      `${input.sitemapRouteCount} routes in the dynamic sitemap.`),
    check("faq", "FAQ/answer-shaped content", input.faqBlocks >= 3 ? "pass" : input.faqBlocks >= 1 ? "warn" : "fail", 2,
      `${input.faqBlocks} FAQ-style content blocks detected. Q&A-shaped content is the most citable format for LLM answers.`),
    check("authority", "Supporting authority content", input.articlesPublished >= 5 ? "pass" : input.articlesPublished >= 1 ? "warn" : "fail", 1,
      `${input.articlesPublished} published articles/case studies back the catalog with citable prose.`),
  ];

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => a + c.points, 0);
  const score = Math.round((earned / total) * 100);
  return {
    score,
    checks,
    summary: `LLM-readiness ${score}/100 — ${checks.filter((c) => c.status === "pass").length}/${checks.length} checks passed. Evidence per check is listed; no simulated metrics.`,
  };
}
