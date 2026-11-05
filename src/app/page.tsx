import { db } from "@/lib/db";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/site/sections/hero";
import { ContactProfileSocial } from "@/components/site/sections/contact-profile-social";
import { Expertise } from "@/components/site/sections/expertise";
import { MyWork } from "@/components/site/sections/my-work";
import { WorkSystem } from "@/components/site/sections/work-system";
import { Impact, type ImpactItem } from "@/components/site/sections/impact";
import { Ecosystem, type ProjectItem } from "@/components/site/sections/ecosystem";
import { CaseStudies, type CaseStudyItem } from "@/components/site/sections/case-studies";
import { PhotoGallery } from "@/components/site/sections/photo-gallery";
import { Testimonials } from "@/components/site/sections/testimonials";
import { AloLabs } from "@/components/site/sections/alo-labs";
import { AudiencePathways } from "@/components/site/sections/audience-pathways";
import { Insights, type ArticleItem } from "@/components/site/sections/insights";
import { LatestUpdates } from "@/components/site/sections/latest-updates";
import { Resources, type ResourceItem } from "@/components/site/sections/resources";
import { Faq } from "@/components/site/sections/faq";
import { Verification } from "@/components/site/sections/verification";
import { Profile } from "@/components/site/sections/profile";
import { WorkWithMe } from "@/components/site/sections/work-with-me";
import { SocialHub } from "@/components/site/sections/social-hub";
import { ContactFinale } from "@/components/site/sections/contact-finale";
import { Newsletter } from "@/components/site/sections/newsletter";
import { CommandCenterBridge } from "@/components/site/command-center-bridge";
import { ScrollUtilities } from "@/components/site/scroll-utilities";
import { JsonLd } from "@/components/site/json-ld";
import { AnalyticsInit } from "@/components/site/analytics-init";
import type { LatestUpdate } from "@/lib/site-data";

export const dynamic = "force-dynamic";

/**
 * Public homepage data fetch.
 *
 * SECURITY: Only PUBLIC content is fetched server-side and shipped to the
 * browser. ALL private CRM data (inquiries, opportunities, contacts, AI
 * tasks, meetings, audit logs) lives behind `/api/v1/admin/*` endpoints
 * that require an authenticated, RBAC-permissioned session. The public
 * HTML/JS bundle MUST NOT contain any CRM payload.
 *
 * The Command Center launcher is NOT rendered to the public. The floating
 * button only appears after a staff member authenticates. Staff reach the
 * login modal via a discreet keyboard shortcut (Ctrl/Cmd+Shift+C) or the
 * #staff URL hash — neither is advertised in the public UI. After successful
 * authentication, the dashboard data is fetched client-side via the
 * authenticated API.
 */
async function getPublicData() {
  const [
    projects,
    caseStudies,
    impacts,
    articles,
    resources,
    newslettersCount,
  ] = await Promise.all([
    db.project.findMany({
      where: { visibility: "public" },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      }),
      db.caseStudy.findMany({
        where: { featured: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      db.impactRecord.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
      db.article.findMany({
        where: { status: "published" },
        orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
        take: 6,
      }),
      db.resource.findMany({
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.newsletterSubscriber.count({ where: { status: "confirmed" } }),
    ]);

  // Map DB articles → LatestUpdate shape for the LatestUpdates section.
  const latestUpdates: LatestUpdate[] = articles.map((a) => ({
    id: a.id,
    title: a.title,
    excerpt: a.summary,
    category: (a.category as LatestUpdate["category"]) ?? "Operations",
    date: a.publishedAt
      ? new Date(a.publishedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    readTime: `${a.readingMinutes ?? 5} min read`,
  }));

  return {
    projects: projects as ProjectItem[],
    caseStudies: caseStudies as CaseStudyItem[],
    impacts: impacts as ImpactItem[],
    articles: articles as ArticleItem[],
    latestUpdates,
    resources: resources as ResourceItem[],
    newslettersCount,
  };
}

export default async function Home() {
  const data = await getPublicData();

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-background">
      <JsonLd articles={data.articles} projects={data.projects} resources={data.resources} />
      <Navbar />
      <main id="main-content" className="flex-1">
        {/* Personal executive homepage — preserve existing design and sections */}
        <Hero />
        <ContactProfileSocial />
        <Expertise />
        <MyWork />
        <WorkSystem />
        <Impact items={data.impacts} />
        <Ecosystem projects={data.projects} />
        <CaseStudies items={data.caseStudies} />
        <PhotoGallery />
        <Testimonials />
        <AloLabs />
        <AudiencePathways />
        <Insights items={data.articles} />
        <LatestUpdates articles={data.latestUpdates} />
        <Resources items={data.resources} />
        <Faq />
        <Verification />
        <Profile />
        <WorkWithMe />
        <SocialHub />
        <Newsletter subscriberCount={data.newslettersCount} />
        <ContactFinale />
      </main>
      <Footer />
      {/* Command Center: launcher only — no CRM data shipped publicly */}
      <CommandCenterBridge />
      <ScrollUtilities />
      {/* Privacy-friendly, first-party, cookie-less analytics mount */}
      <AnalyticsInit />
    </div>
  );
}
