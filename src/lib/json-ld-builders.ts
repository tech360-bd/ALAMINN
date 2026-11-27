/**
 * schema.org JSON-LD builders for the public discovery layer.
 * ----------------------------------------------------------------
 * Deterministic, XSS-safe builders (serialize via serializeJsonLd from
 * @/lib/json-ld, which escapes <, >, & and line separators). Only data
 * that exists is emitted — optional fields are omitted, never faked:
 * e.g. a course without tuition data emits no offers/price block.
 */

export type JsonLdNode = Record<string, unknown>;

function clean(node: Record<string, unknown>): JsonLdNode {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

export interface OrganizationInput {
  name: string;
  url: string;
  description?: string | null;
  logoUrl?: string | null;
  sameAs?: string[];
}

export function buildOrganization(input: OrganizationInput): JsonLdNode {
  return clean({
    "@type": "Organization",
    name: input.name,
    url: input.url,
    description: input.description ?? undefined,
    logo: input.logoUrl ?? undefined,
    sameAs: input.sameAs && input.sameAs.length ? input.sameAs : undefined,
  });
}

export function buildWebSite(name: string, url: string, potentialSearchUrl?: string): JsonLdNode {
  return clean({
    "@type": "WebSite",
    name,
    url,
    potentialAction: potentialSearchUrl
      ? {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: potentialSearchUrl },
          "query-input": "required name=search_term_string",
        }
      : undefined,
  });
}

export interface UniversityLdInput {
  officialName: string;
  url: string;
  description?: string | null;
  establishedYear?: number | null;
  countryName?: string | null;
  cityName?: string | null;
  institutionType?: string | null;
}

export function buildCollegeOrUniversity(input: UniversityLdInput): JsonLdNode {
  return clean({
    "@type": "CollegeOrUniversity",
    name: input.officialName,
    url: input.url,
    description: input.description ?? undefined,
    foundingDate: input.establishedYear ? String(input.establishedYear) : undefined,
    address: input.countryName
      ? clean({
          "@type": "PostalAddress",
          addressCountry: input.countryName,
          addressLocality: input.cityName ?? undefined,
        })
      : undefined,
  });
}

export interface CourseLdInput {
  title: string;
  url: string;
  description?: string | null;
  universityName?: string | null;
  universityUrl?: string | null;
  studyLevel?: string | null;
  qualification?: string | null;
  durationMonths?: number | null;
  tuitionAmount?: number | null;
  tuitionCurrency?: string | null;
}

export function buildCourse(input: CourseLdInput): JsonLdNode {
  return clean({
    "@type": "Course",
    name: input.title,
    url: input.url,
    description: input.description ?? undefined,
    educationalCredentialAwarded: input.qualification ?? input.studyLevel ?? undefined,
    provider: input.universityName
      ? clean({
          "@type": "CollegeOrUniversity",
          name: input.universityName,
          url: input.universityUrl ?? undefined,
        })
      : undefined,
    timeRequired: input.durationMonths ? `P${input.durationMonths}M` : undefined,
    offers: input.tuitionAmount
      ? clean({
          "@type": "Offer",
          price: String(input.tuitionAmount),
          priceCurrency: input.tuitionCurrency ?? "USD",
          category: "Tuition",
        })
      : undefined,
  });
}

export interface ScholarshipLdInput {
  name: string;
  url: string;
  description?: string | null;
  provider?: string | null;
  amount?: number | null;
  currency?: string | null;
  deadline?: string | null;
}

/**
 * schema.org has no dedicated Scholarship type; the community-standard
 * practice is a DefinedTerm (or CreativeWork) with the award details.
 */
export function buildScholarship(input: ScholarshipLdInput): JsonLdNode {
  return clean({
    "@type": "DefinedTerm",
    name: input.name,
    url: input.url,
    description: input.description ?? undefined,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Study abroad scholarships",
    },
    provider: input.provider ?? undefined,
    ...(input.amount
      ? {
          award: clean({
            "@type": "MonetaryAmount",
            value: String(input.amount),
            currency: input.currency ?? "USD",
          }),
        }
      : {}),
    validThrough: input.deadline ?? undefined,
  });
}

export interface FaqInput {
  question: string;
  answer: string;
}

export function buildFaqPage(faqs: FaqInput[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.slice(0, 30).map((f) => ({
      "@type": "Question",
      name: f.question.slice(0, 300),
      acceptedAnswer: { "@type": "Answer", text: f.answer.slice(0, 2000) },
    })),
  };
}

export function buildBreadcrumb(trail: Array<{ name: string; url: string }>): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.slice(0, 8).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name.slice(0, 120),
      item: item.url,
    })),
  };
}

export function buildArticle(input: {
  title: string;
  url: string;
  description?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
}): JsonLdNode {
  return clean({
    "@type": "Article",
    headline: input.title.slice(0, 110),
    url: input.url,
    description: input.description ?? undefined,
    datePublished: input.publishedAt ?? undefined,
    dateModified: input.updatedAt ?? input.publishedAt ?? undefined,
    author: input.authorName ? { "@type": "Organization", name: input.authorName } : undefined,
  });
}
