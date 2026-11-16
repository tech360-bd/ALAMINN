/**
 * LinkedIn recommendations — public section.
 * ------------------------------------------
 * Replaces the previous demo testimonial carousel. That section contained
 * six hard-coded endorsements whose identities were logged as unverified in
 * docs/CLAIM_REGISTER.md (rows 31–33). This section contains NO demo data.
 *
 * Behaviour:
 *   - Renders consented recommendations entered by the owner in
 *     /admin/endorsements, each linked back to LinkedIn.
 *   - With no recommendations yet, renders a single LinkedIn panel pointing
 *     at the public profile.
 *   - With neither recommendations nor a profile URL, renders nothing —
 *     never an empty or invented testimonial.
 */
import { ArrowUpRight, Quote, ShieldCheck } from "lucide-react";
import { SectionHeading, SectionWrap } from "./section-primitives";
import { LinkedInIcon } from "@/components/site/brand-icons";
import { cn } from "@/lib/utils";
import { initialsFor, type LinkedInEndorsement } from "@/lib/endorsements";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2025-11-04" → "Nov 2025" (deterministic, no locale/timezone drift). */
function formatMonth(date: string): string {
  const [year, month] = date.split("-");
  const index = Number(month) - 1;
  if (!year || !month || Number.isNaN(index) || !MONTHS[index]) return year ?? "";
  return `${MONTHS[index]} ${year}`;
}

function RecommendationCard({
  item,
  profileUrl,
}: {
  item: LinkedInEndorsement;
  profileUrl: string;
}) {
  const href = item.linkedinUrl || profileUrl;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-ink-200 bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card dark:border-blue-800/30 dark:bg-ink-900 dark:shadow-none dark:hover:border-blue-700/40">
      <Quote
        aria-hidden="true"
        className="h-7 w-7 shrink-0 fill-orange-500/15 text-orange-500/70 dark:fill-orange-400/10 dark:text-orange-400/70"
      />

      <blockquote className="mt-4 text-[15px] leading-relaxed text-ink-700 dark:text-blue-100/90">
        “{item.quote}”
      </blockquote>

      <div className="mt-auto flex items-start gap-3 pt-6">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-xs font-bold tracking-wide text-white"
        >
          {initialsFor(item.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
            {item.name}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-blue-200/70">
            {item.role}
            {item.organization ? ` · ${item.organization}` : ""}
          </p>
        </div>
        <LinkedInIcon className="mt-1 h-4 w-4 shrink-0 text-[#0A66C2] dark:text-blue-400" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-4 dark:border-blue-800/30">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400 dark:text-blue-300/50">
          {item.date ? formatMonth(item.date) : "LinkedIn recommendation"}
        </span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 transition-colors hover:text-orange-600 dark:text-blue-300 dark:hover:text-orange-400"
          >
            View on LinkedIn
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}

export function LinkedInRecommendations({
  items,
  profileUrl,
}: {
  items: LinkedInEndorsement[];
  profileUrl: string;
}) {
  const hasItems = items.length > 0;
  const hasProfile = Boolean(profileUrl);

  // Nothing verified and no profile to point at: stay silent rather than
  // show an empty shell. The admin editor explains how to populate this.
  if (!hasItems && !hasProfile) return null;

  return (
    <SectionWrap id="recommendations">
      <SectionHeading
        eyebrow="LinkedIn recommendations"
        title={
          hasItems ? (
            <>
              What colleagues and partners{" "}
              <span className="text-orange-600 dark:text-orange-400">
                say on LinkedIn
              </span>
            </>
          ) : (
            <>
              Recommendations live on{" "}
              <span className="text-orange-600 dark:text-orange-400">LinkedIn</span>
            </>
          )
        }
        description={
          hasItems
            ? "Recommendations are written and published by colleagues and partners on LinkedIn. Only consented recommendations are shown here; the full record stays on LinkedIn."
            : "Colleagues and partners share their recommendations directly on Al Aminn's LinkedIn profile. Read them there, in the authors' own words."
        }
      />

      {hasItems ? (
        <>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <RecommendationCard
                key={item.id}
                item={item}
                profileUrl={profileUrl}
              />
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 px-5 py-4 dark:border-blue-800/30 dark:bg-blue-900/20 sm:flex-row">
            <p className="flex items-center gap-2.5 text-center text-xs leading-relaxed text-ink-600 dark:text-blue-200 sm:text-left">
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>
                <span className="font-semibold text-ink-800 dark:text-blue-100">
                  Published with consent.
                </span>{" "}
                Quotes are reproduced as written on LinkedIn — never rewritten or
                generated.
              </span>
            </p>
            {hasProfile && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0A66C2] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#084f96]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                )}
              >
                <LinkedInIcon className="h-3.5 w-3.5" />
                See all on LinkedIn
              </a>
            )}
          </div>
        </>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-5 rounded-3xl border border-ink-200 bg-white p-7 text-center shadow-soft dark:border-blue-800/30 dark:bg-ink-900 dark:shadow-none sm:flex-row sm:text-left">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0A66C2]/10 text-[#0A66C2] dark:bg-blue-500/15 dark:text-blue-400">
            <LinkedInIcon className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <h3 className="font-display text-lg font-bold text-ink-900 dark:text-white">
              Recommendations on LinkedIn
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-blue-200/80">
              No recommendations are republished here yet. The verified record —
              written by the people who worked with Al Aminn — is on LinkedIn.
            </p>
          </div>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#0A66C2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#084f96]"
          >
            <LinkedInIcon className="h-4 w-4" />
            View recommendations
          </a>
        </div>
      )}
    </SectionWrap>
  );
}
