/**
 * llms.txt — LLM-discoverable site content index (llmstxt.org format).
 * -------------------------------------------------------------------
 * Generated from live database content only — universities, courses,
 * scholarships, research areas and resources. No fabricated entries:
 * counts in the header reflect real rows at generation time.
 *
 * Served at /llms.txt (text/plain) and mirrored into the AEO readiness
 * audit. Regenerated on demand by the admin AEO dashboard.
 */

import { db } from "@/lib/db";

export interface LlmsSectionStats {
  universities: number;
  courses: number;
  scholarships: number;
  researchAreas: number;
  resources: number;
}

/** Resolve the public site URL at call time (testable per env). */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://alaminn.info";
}

/** Collect live counts (bounded) for the llms.txt header. */
export async function collectLlmsStats(): Promise<LlmsSectionStats> {
  const [universities, courses, scholarships, researchAreas, resources] = await Promise.all([
    db.higherStudyUniversity.count({ where: { publicationStatus: "published" } }).catch(() => 0),
    db.higherStudyCourse.count({ where: { publicationStatus: "published" } }).catch(() => 0),
    db.higherStudyScholarship.count({ where: { publicationStatus: "published" } }).catch(() => 0),
    db.higherStudyResearchArea.count().catch(() => 0),
    db.higherStudyResource.count({ where: { publicationStatus: "published" } }).catch(() => 0),
  ]);
  return { universities, courses, scholarships, researchAreas, resources };
}

function line(label: string, path: string, note: string): string {
  return `- [${label}](${getSiteUrl()}${path}): ${note}`;
}

/**
 * Build the llms.txt body from live DB rows. Each section lists a
 * bounded sample of the most relevant live entries (never all rows —
 * the file stays under a sane budget).
 */
export async function generateLlmsTxt(): Promise<{ body: string; stats: LlmsSectionStats }> {
  const stats = await collectLlmsStats();

  const [universities, courses, scholarships, researchAreas] = await Promise.all([
    db.higherStudyUniversity
      .findMany({ where: { publicationStatus: "published" }, select: { slug: true, officialName: true, overview: true }, take: 40, orderBy: { officialName: "asc" } })
      .catch(() => [] as Array<{ slug: string; officialName: string; overview: string | null }>),
    db.higherStudyCourse
      .findMany({ where: { publicationStatus: "published" }, select: { slug: true, title: true, studyLevel: true }, take: 40, orderBy: { title: "asc" } })
      .catch(() => [] as Array<{ slug: string; title: string; studyLevel: string }>),
    db.higherStudyScholarship
      .findMany({ where: { publicationStatus: "published" }, select: { slug: true, name: true, provider: true }, take: 30, orderBy: { name: "asc" } })
      .catch(() => [] as Array<{ slug: string; name: string; provider: string | null }>),
    db.higherStudyResearchArea
      .findMany({ select: { slug: true, name: true }, take: 20, orderBy: { name: "asc" } })
      .catch(() => [] as Array<{ slug: string; name: string }>),
  ]);

  const parts: string[] = [];
  parts.push(`# ALAMINN`);
  parts.push("");
  parts.push(`> ALAMINN — study-abroad discovery, executive consulting and AI automation platform. Public discovery layer for ALO Education (application/counseling source-of-truth). Live content index for LLM and answer-engine consumption.`);
  parts.push("");
  parts.push(`Live content at generation time: ${stats.universities} published universities, ${stats.courses} published courses, ${stats.scholarships} published scholarships, ${stats.researchAreas} research areas, ${stats.resources} resources.`);
  parts.push("");
  parts.push("## Core");
  parts.push(line("Higher Study discovery", "/higher-study", "Course finder, university comparison, scholarships, PhD supervisor matching, research proposal builder"));
  parts.push(line("ALO Education ecosystem", "/ecosystem/alo-education", "Application & counseling source-of-truth ecosystem description"));
  parts.push(line("Course finder", "/higher-study/course-finder", "Filterable course search across destinations"));
  parts.push(line("Compare universities", "/higher-study/compare/universities", "Side-by-side university comparison"));
  parts.push(line("Scholarships", "/higher-study/scholarships", "Scholarship search and filtering"));
  parts.push(line("PhD research", "/higher-study/phd-research", "Research areas, supervisors and proposal builder"));
  parts.push(line("Apply", "/higher-study/apply", "Start an application through the ALO Education referral flow"));
  parts.push("");

  if (universities.length) {
    parts.push("## Universities (sample)");
    for (const u of universities) {
      parts.push(line(u.officialName, `/higher-study/universities/${u.slug}`, (u.overview ?? "").replace(/\s+/g, " ").slice(0, 120)));
    }
    parts.push("");
  }
  if (courses.length) {
    parts.push("## Courses (sample)");
    for (const c of courses) {
      parts.push(line(`${c.title} (${c.studyLevel})`, `/higher-study/courses/${c.slug}`, `${c.studyLevel} programme page`));
    }
    parts.push("");
  }
  if (scholarships.length) {
    parts.push("## Scholarships (sample)");
    for (const s of scholarships) {
      parts.push(line(s.name, `/higher-study/scholarships/${s.slug}`, s.provider ? `${s.provider} scholarship` : "Scholarship detail page"));
    }
    parts.push("");
  }
  if (researchAreas.length) {
    parts.push("## Research areas (sample)");
    for (const r of researchAreas) {
      parts.push(line(r.name, `/higher-study/research/${r.slug}`, "Research area detail"));
    }
    parts.push("");
  }
  parts.push("## Optional");
  parts.push(line("About", "/about", "Company background"));
  parts.push(line("Contact", "/contact", "Contact and consultation booking"));
  parts.push(line("Privacy", "/legal/privacy", "Privacy policy"));
  parts.push(line("Terms", "/legal/terms", "Terms of service"));
  parts.push("");

  return { body: parts.join("\n"), stats };
}
