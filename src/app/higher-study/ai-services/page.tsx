import type { Metadata } from "next";
import { HigherStudyBreadcrumb } from "@/components/higher-study/breadcrumb";
import { PageHero } from "@/components/higher-study/page-hero";
import { AiServicesClient } from "@/components/higher-study/ai-services-client";
import { buildHigherStudyMetadata } from "@/lib/higher-study/seo";

export const metadata: Metadata = buildHigherStudyMetadata({
  title: "AI Services — CV, SOP, Research & Application Drafts",
  description:
    "Free-first AI-assisted drafts for CVs, statements of purpose, research proposals, scholarship applications and academic writing. Reviewed by you, never fabricated.",
  path: "/higher-study/ai-services",
  keywords: [
    "AI CV builder",
    "statement of purpose builder",
    "research proposal assistant",
    "scholarship application assistant",
    "academic writing assistant",
  ],
});

export default function AiServicesPage() {
  return (
    <>
      <PageHero
        variant="default"
        eyebrow="Higher Study · AI Services"
        title="18 AI services for your application journey"
        description="Turn the facts you already have into structured drafts. Every service is grounded in your input, flags missing information, and never invents achievements, citations, deadlines or guarantees."
      />
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <HigherStudyBreadcrumb items={[{ label: "AI Services" }]} className="mb-6" />
        <AiServicesClient />
      </div>
    </>
  );
}
