/**
 * 100% Free AI Agent Tools — Internal Platform DB + Zero-Cost External APIs
 * =========================================================================
 * Powers tool-calling across all 52 Admin Dashboard AI Agents:
 *
 * Internal Platform Tools (RBAC-enforced against caller Session):
 *   - get_dashboard_snapshot   : Live counts, breakdowns & recent records for the active dashboard
 *   - search_dashboard_records : Keyword search across the active dashboard's Prisma models
 *   - queue_governed_ai_task   : Creates a governed AiTask routed to human approval
 *   - create_followup_task     : Creates an operational Task in the CRM/Task queue
 *
 * 100% Free External Agent Tools (Zero API Cost):
 *   - get_weather              : Open-Meteo geocoding + live forecast (no key, unlimited)
 *   - wikipedia_lookup         : Wikipedia REST summary API (no key)
 *   - web_instant_search       : Tavily / Brave Search (if free key set) → DuckDuckGo Instant Answer (no key)
 *   - academic_research_lookup : OpenAlex scholarly works search (no key — ideal for Higher Study & PhDs)
 *   - generate_free_image      : Pollinations.ai FLUX zero-key image URL generator
 */

import { db } from "@/lib/db";
import type { Session } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/admin-api";
import {
  DASHBOARD_AGENT_BY_ID,
  type AgentToolName,
  type DashboardAgentDefinition,
} from "./dashboard-agents";
import { resolveAllProviderConfigs } from "./free-providers";

export interface OpenAiToolSchema {
  type: "function";
  function: {
    name: AgentToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export interface ToolExecutionTrace {
  tool: AgentToolName;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  durationMs: number;
  imageUrl?: string;
}

export interface AgentExecutionContext {
  session: Session;
  agent: DashboardAgentDefinition;
}

const TOOL_SCHEMAS: Record<AgentToolName, OpenAiToolSchema> = {
  get_dashboard_snapshot: {
    type: "function",
    function: {
      name: "get_dashboard_snapshot",
      description: "Fetch live KPIs, status counts, and recent records from the platform database for this admin dashboard.",
      parameters: {
        type: "object",
        properties: {
          dashboardId: {
            type: "string",
            description: "Optional dashboard agent ID (defaults to current dashboard).",
          },
        },
      },
    },
  },
  search_dashboard_records: {
    type: "function",
    function: {
      name: "search_dashboard_records",
      description: "Search database records relevant to this admin dashboard by keyword.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword or phrase." },
          limit: { type: "number", description: "Max records to return (1-15)." },
        },
        required: ["query"],
      },
    },
  },
  queue_governed_ai_task: {
    type: "function",
    function: {
      name: "queue_governed_ai_task",
      description: "Submit a formal governed AI task into the AI Assistant / Approvals queue (requires human approval before external delivery).",
      parameters: {
        type: "object",
        properties: {
          workflow: {
            type: "string",
            description: "Workflow slug (e.g. executive-linkedin-post, seo-article-draft, newsletter-draft, case-study-draft, partnership-proposal, operations-audit).",
          },
          objective: { type: "string", description: "Concise objective title." },
          prompt: { type: "string", description: "Detailed executive instructions." },
        },
        required: ["workflow", "objective", "prompt"],
      },
    },
  },
  create_followup_task: {
    type: "function",
    function: {
      name: "create_followup_task",
      description: "Create a concrete operational follow-up task in the Admin Tasks board.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Actionable task title." },
          description: { type: "string", description: "Supporting context or checklist." },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Priority level.",
          },
        },
        required: ["title"],
      },
    },
  },
  get_weather: {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current real-time weather and wind speed for any city worldwide via Open-Meteo (free, no key).",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name (e.g. Dhaka, London, Tokyo, Toronto)." },
        },
        required: ["city"],
      },
    },
  },
  wikipedia_lookup: {
    type: "function",
    function: {
      name: "wikipedia_lookup",
      description: "Look up verified factual summaries on universities, cities, countries, organizations, or topics via Wikipedia REST API.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Topic or entity title." },
        },
        required: ["query"],
      },
    },
  },
  web_instant_search: {
    type: "function",
    function: {
      name: "web_instant_search",
      description: "Search the web using free search providers (Tavily / Brave if configured, otherwise DuckDuckGo Instant Answers).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Web search query." },
        },
        required: ["query"],
      },
    },
  },
  academic_research_lookup: {
    type: "function",
    function: {
      name: "academic_research_lookup",
      description: "Search peer-reviewed academic papers, authors, and institutions via OpenAlex free API.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Academic research topic, supervisor name, or university." },
        },
        required: ["query"],
      },
    },
  },
  generate_free_image: {
    type: "function",
    function: {
      name: "generate_free_image",
      description: "Generate a 100% free AI image via Pollinations.ai (FLUX model, zero API key required) for article covers, banners, or social graphics.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed visual prompt for a single clean illustration or photo." },
          aspect: {
            type: "string",
            enum: ["landscape", "square", "portrait"],
            description: "Aspect ratio (landscape 1280x720, square 1024x1024, portrait 768x1024).",
          },
        },
        required: ["prompt"],
      },
    },
  },
};

export function getOpenAiToolsForAgent(
  agent: DashboardAgentDefinition,
  allowExternal = true
): OpenAiToolSchema[] {
  const externalSet = new Set<AgentToolName>([
    "get_weather",
    "wikipedia_lookup",
    "web_instant_search",
    "academic_research_lookup",
    "generate_free_image",
  ]);
  return agent.tools
    .filter((t) => allowExternal || !externalSet.has(t))
    .map((t) => TOOL_SCHEMAS[t])
    .filter(Boolean);
}

async function safeDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function isSensitiveSettingKey(key: string): boolean {
  return /(pass|secret|token|apikey|api_key|key|credential|private|accountid)/i.test(key);
}

function canViewAllOperationalTasks(role: Session["role"]): boolean {
  return (
    hasPermission(role, "contacts.view") ||
    hasPermission(role, "inquiries.view") ||
    hasPermission(role, "opportunities.view") ||
    hasPermission(role, "projects.view") ||
    hasPermission(role, "meetings.view")
  );
}

function canCreateFollowupTasks(role: Session["role"]): boolean {
  return (
    hasPermission(role, "contacts.update") ||
    hasPermission(role, "inquiries.update") ||
    hasPermission(role, "opportunities.update") ||
    hasPermission(role, "projects.update") ||
    hasPermission(role, "meetings.update") ||
    hasPermission(role, "ai_tasks.create")
  );
}

/**
 * Collects a live, RBAC-checked snapshot from Prisma tailored to each Admin Dashboard.
 */
export async function buildDashboardSnapshot(
  agentId: string,
  session: Session
): Promise<Record<string, unknown>> {
  const agent = DASHBOARD_AGENT_BY_ID[agentId] || DASHBOARD_AGENT_BY_ID["executive-overview"];
  if (!hasPermission(session.role, agent.requiredPermission)) {
    return {
      dashboard: agent.name,
      route: agent.route,
      permissionNote: `Caller role (${session.role}) does not grant ${agent.requiredPermission}; live database records omitted.`,
    };
  }

  switch (agent.id) {
    case "executive-overview": {
      const canInq = hasPermission(session.role, "inquiries.view");
      const canCon = hasPermission(session.role, "contacts.view");
      const canArt = hasPermission(session.role, "articles.view");
      const canApp = hasPermission(session.role, "ai_approvals.view");
      const canNews = hasPermission(session.role, "newsletter.view");
      const canOpp = hasPermission(session.role, "opportunities.view");
      const canAudit = hasPermission(session.role, "audit_logs.view");
      const canAllTasks = canViewAllOperationalTasks(session.role);

      const [
        inquiries,
        contacts,
        tasksOpen,
        articlesPublished,
        pendingApprovals,
        subscribers,
        opportunities,
        recentAudits,
      ] = await Promise.all([
        canInq ? safeDb(() => db.inquiry.count(), 0) : Promise.resolve(null),
        canCon ? safeDb(() => db.contact.count(), 0) : Promise.resolve(null),
        safeDb(
          () =>
            db.task.count({
              where: {
                status: { in: ["open", "in-progress", "overdue"] },
                ...(canAllTasks ? {} : { assigneeId: session.userId }),
              },
            }),
          0
        ),
        canArt ? safeDb(() => db.article.count({ where: { status: "published" } }), 0) : Promise.resolve(null),
        canApp ? safeDb(() => db.aiTask.count({ where: { status: "awaiting-approval" } }), 0) : Promise.resolve(null),
        canNews ? safeDb(() => db.newsletterSubscriber.count({ where: { status: "confirmed" } }), 0) : Promise.resolve(null),
        canOpp
          ? safeDb(() => db.opportunity.findMany({ take: 10, orderBy: { createdAt: "desc" }, select: { title: true, value: true, currency: true, stage: true, priority: true } }), [])
          : Promise.resolve([]),
        canAudit
          ? safeDb(() => db.auditLog.findMany({ take: 6, orderBy: { createdAt: "desc" }, select: { action: true, resource: true, createdAt: true } }), [])
          : Promise.resolve([]),
      ]);
      const kpis: Record<string, unknown> = { tasksOpen };
      if (inquiries !== null) kpis.inquiries = inquiries;
      if (contacts !== null) kpis.contacts = contacts;
      if (articlesPublished !== null) kpis.articlesPublished = articlesPublished;
      if (pendingApprovals !== null) kpis.pendingApprovals = pendingApprovals;
      if (subscribers !== null) kpis.confirmedSubscribers = subscribers;
      if (canOpp) {
        kpis.recentPipelineSampleValue = opportunities.reduce((sum, o) => sum + (o.value || 0), 0);
      }
      return {
        kpis,
        ...(canOpp ? { recentOpportunities: opportunities.slice(0, 5) } : {}),
        ...(canAudit ? { recentAuditActions: recentAudits } : {}),
      };
    }

    case "notifications-triage": {
      const [unreadCount, totalCount, recent] = await Promise.all([
        safeDb(() => db.notification.count({ where: { userId: session.userId, read: false } }), 0),
        safeDb(() => db.notification.count({ where: { userId: session.userId } }), 0),
        safeDb(
          () =>
            db.notification.findMany({
              where: { userId: session.userId },
              take: 10,
              orderBy: { createdAt: "desc" },
              select: { type: true, title: true, message: true, read: true, createdAt: true },
            }),
          []
        ),
      ]);
      return { unreadCount, totalCount, recentNotifications: recent };
    }

    case "crm-contacts": {
      const [total, active, nurturing, converted, recent] = await Promise.all([
        safeDb(() => db.contact.count(), 0),
        safeDb(() => db.contact.count({ where: { status: "active" } }), 0),
        safeDb(() => db.contact.count({ where: { status: "nurturing" } }), 0),
        safeDb(() => db.contact.count({ where: { status: "converted" } }), 0),
        safeDb(() => db.contact.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { fullName: true, organization: true, role: true, country: true, status: true, tags: true, preferredChannel: true } }), []),
      ]);
      return { counts: { total, active, nurturing, converted }, recentContacts: recent };
    }

    case "crm-companies": {
      const [orgCount, partnershipCount, orgs, partnerships] = await Promise.all([
        safeDb(() => db.organization.count(), 0),
        safeDb(() => db.partnership.count(), 0),
        safeDb(() => db.organization.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { name: true, type: true, country: true, status: true } }), []),
        safeDb(() => db.partnership.findMany({ take: 6, orderBy: { createdAt: "desc" }, select: { name: true, type: true, stage: true, status: true } }), []),
      ]);
      return { orgCount, partnershipCount, recentOrganizations: orgs, recentPartnerships: partnerships };
    }

    case "crm-inquiries": {
      const [total, newCount, qualifiedCount, recent] = await Promise.all([
        safeDb(() => db.inquiry.count(), 0),
        safeDb(() => db.inquiry.count({ where: { status: "new" } }), 0),
        safeDb(() => db.inquiry.count({ where: { status: "qualified" } }), 0),
        safeDb(() => db.inquiry.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { reference: true, type: true, status: true, timeline: true, createdAt: true, contact: { select: { fullName: true, organization: true } } } }), []),
      ]);
      return { counts: { total, new: newCount, qualified: qualifiedCount }, recentInquiries: recent };
    }

    case "crm-opportunities": {
      const [total, won, openDeals] = await Promise.all([
        safeDb(() => db.opportunity.count(), 0),
        safeDb(() => db.opportunity.count({ where: { stage: "won" } }), 0),
        safeDb(() => db.opportunity.findMany({ take: 10, orderBy: { updatedAt: "desc" }, select: { title: true, value: true, currency: true, stage: true, priority: true, closeDate: true, contact: { select: { fullName: true, organization: true } } } }), []),
      ]);
      return { totalOpportunities: total, wonCount: won, recentDeals: openDeals };
    }

    case "crm-meetings": {
      const [total, newCount, confirmedCount, recent] = await Promise.all([
        safeDb(() => db.meetingRequest.count(), 0),
        safeDb(() => db.meetingRequest.count({ where: { status: "new" } }), 0),
        safeDb(() => db.meetingRequest.count({ where: { status: "confirmed" } }), 0),
        safeDb(() => db.meetingRequest.findMany({ take: 8, orderBy: { requestedDate: "desc" }, select: { reference: true, meetingType: true, requestedDate: true, requestedTime: true, timezone: true, contactName: true, organization: true, topic: true, status: true } }), []),
      ]);
      return { counts: { total, new: newCount, confirmed: confirmedCount }, recentMeetings: recent };
    }

    case "crm-notes": {
      const [total, recent] = await Promise.all([
        safeDb(() => db.note.count(), 0),
        safeDb(() => db.note.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true, contact: { select: { fullName: true, organization: true } } } }), []),
      ]);
      return {
        totalNotes: total,
        recentNotes: recent.map((n) => ({ ...n, body: n.body.slice(0, 240) })),
      };
    }

    case "crm-tasks": {
      const [open, inProgress, overdue, done, recent] = await Promise.all([
        safeDb(() => db.task.count({ where: { status: "open" } }), 0),
        safeDb(() => db.task.count({ where: { status: "in-progress" } }), 0),
        safeDb(() => db.task.count({ where: { status: "overdue" } }), 0),
        safeDb(() => db.task.count({ where: { status: "done" } }), 0),
        safeDb(() => db.task.findMany({ where: { status: { in: ["open", "in-progress", "overdue"] } }, take: 10, orderBy: { createdAt: "desc" }, select: { title: true, priority: true, status: true, dueDate: true, relatedType: true } }), []),
      ]);
      return { counts: { open, inProgress, overdue, done }, activeTasks: recent };
    }

    case "content-articles": {
      const [published, draft, review, recent] = await Promise.all([
        safeDb(() => db.article.count({ where: { status: "published" } }), 0),
        safeDb(() => db.article.count({ where: { status: "draft" } }), 0),
        safeDb(() => db.article.count({ where: { status: "review" } }), 0),
        safeDb(() => db.article.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, slug: true, category: true, status: true, featured: true, readingMinutes: true } }), []),
      ]);
      return { counts: { published, draft, review }, recentArticles: recent };
    }

    case "content-projects": {
      const [total, active, verified, recent] = await Promise.all([
        safeDb(() => db.project.count(), 0),
        safeDb(() => db.project.count({ where: { status: "active" } }), 0),
        safeDb(() => db.project.count({ where: { evidenceStatus: "verified" } }), 0),
        safeDb(() => db.project.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { name: true, slug: true, category: true, status: true, evidenceStatus: true, confidentiality: true, visibility: true } }), []),
      ]);
      return { counts: { total, active, verified }, recentProjects: recent };
    }

    case "content-case-studies": {
      const [total, featured, recent] = await Promise.all([
        safeDb(() => db.caseStudy.count(), 0),
        safeDb(() => db.caseStudy.count({ where: { featured: true } }), 0),
        safeDb(() => db.caseStudy.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, slug: true, category: true, evidenceStatus: true, confidentiality: true, featured: true } }), []),
      ]);
      return { counts: { total, featured }, caseStudies: recent };
    }

    case "content-media": {
      const [total, missingAlt, recent] = await Promise.all([
        safeDb(() => db.mediaAsset.count(), 0),
        safeDb(() => db.mediaAsset.count({ where: { OR: [{ altText: null }, { altText: "" }] } }), 0),
        safeDb(() => db.mediaAsset.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { filename: true, category: true, altText: true, mimeType: true } }), []),
      ]);
      return { totalAssets: total, missingAltTextCount: missingAlt, recentAssets: recent };
    }

    case "content-documents": {
      const [total, recent] = await Promise.all([
        safeDb(() => db.document.count(), 0),
        safeDb(() => db.document.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { title: true, fileName: true, category: true, mimeType: true, size: true, createdAt: true } }), []),
      ]);
      return { totalDocuments: total, recentDocuments: recent };
    }

    case "content-newsletter": {
      const [confirmed, pending, unsubscribed, recent] = await Promise.all([
        safeDb(() => db.newsletterSubscriber.count({ where: { status: "confirmed" } }), 0),
        safeDb(() => db.newsletterSubscriber.count({ where: { status: "pending" } }), 0),
        safeDb(() => db.newsletterSubscriber.count({ where: { status: "unsubscribed" } }), 0),
        safeDb(() => db.newsletterSubscriber.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { interest: true, status: true, createdAt: true } }), []),
      ]);
      return { counts: { confirmed, pending, unsubscribed }, recentSignupsAnonymized: recent };
    }

    case "hs-monitoring": {
      const [sourcesCount, pendingChanges, runs, changes] = await Promise.all([
        safeDb(() => db.higherStudySourceRecord.count(), 0),
        safeDb(() => db.higherStudyDataChange.count({ where: { status: "pending" } }), 0),
        safeDb(() => db.higherStudyMonitoringRun.findMany({ take: 5, orderBy: { startedAt: "desc" }, select: { status: true, sourcesChecked: true, sourcesFailed: true, changesDetected: true, startedAt: true } }), []),
        safeDb(() => db.higherStudyDataChange.findMany({ where: { status: "pending" }, take: 8, orderBy: { detectedAt: "desc" }, select: { entityType: true, entityLabel: true, changeType: true, impact: true, confidence: true, aiSummary: true } }), []),
      ]);
      return { sourcesCount, pendingChanges, recentRuns: runs, pendingChangeSample: changes };
    }

    case "hs-countries": {
      const [total, published, list] = await Promise.all([
        safeDb(() => db.higherStudyCountry.count(), 0),
        safeDb(() => db.higherStudyCountry.count({ where: { status: "published" } }), 0),
        safeDb(() => db.higherStudyCountry.findMany({ take: 10, orderBy: { updatedAt: "desc" }, select: { name: true, slug: true, region: true, tuitionFeeRange: true, status: true, lastVerifiedAt: true } }), []),
      ]);
      return { counts: { total, published }, countries: list };
    }

    case "hs-cities": {
      const [total, list] = await Promise.all([
        safeDb(() => db.higherStudyCity.count(), 0),
        safeDb(() => db.higherStudyCity.findMany({ take: 10, orderBy: { updatedAt: "desc" }, select: { name: true, slug: true, livingCost: true, status: true, country: { select: { name: true } } } }), []),
      ]);
      return { totalCities: total, cities: list };
    }

    case "hs-universities": {
      const [total, verified, published, list] = await Promise.all([
        safeDb(() => db.higherStudyUniversity.count(), 0),
        safeDb(() => db.higherStudyUniversity.count({ where: { verificationStatus: "verified" } }), 0),
        safeDb(() => db.higherStudyUniversity.count({ where: { publicationStatus: "published" } }), 0),
        safeDb(() => db.higherStudyUniversity.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { officialName: true, slug: true, verificationStatus: true, publicationStatus: true, ieltsRequirement: true, country: { select: { name: true } } } }), []),
      ]);
      return { counts: { total, verified, published }, recentUniversities: list };
    }

    case "hs-courses": {
      const [total, published, withScholarship, list] = await Promise.all([
        safeDb(() => db.higherStudyCourse.count(), 0),
        safeDb(() => db.higherStudyCourse.count({ where: { publicationStatus: "published" } }), 0),
        safeDb(() => db.higherStudyCourse.count({ where: { scholarshipAvailable: true } }), 0),
        safeDb(() => db.higherStudyCourse.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, studyLevel: true, tuitionFee: true, tuitionCurrency: true, verificationStatus: true, university: { select: { officialName: true } } } }), []),
      ]);
      return { counts: { total, published, withScholarship }, recentCourses: list };
    }

    case "hs-scholarships": {
      const [total, fullyFunded, list] = await Promise.all([
        safeDb(() => db.higherStudyScholarship.count(), 0),
        safeDb(() => db.higherStudyScholarship.count({ where: { fundingType: "fully-funded" } }), 0),
        safeDb(() => db.higherStudyScholarship.findMany({ take: 8, orderBy: { deadline: "asc" }, select: { name: true, provider: true, fundingType: true, fundingAmount: true, deadline: true, verificationStatus: true } }), []),
      ]);
      return { counts: { total, fullyFunded }, scholarships: list };
    }

    case "hs-subjects": {
      const [total, list] = await Promise.all([
        safeDb(() => db.higherStudySubject.count(), 0),
        safeDb(() => db.higherStudySubject.findMany({ take: 12, orderBy: { name: "asc" }, select: { name: true, slug: true, category: true } }), []),
      ]);
      return { totalSubjects: total, subjects: list };
    }

    case "hs-intakes": {
      const [total, open, list] = await Promise.all([
        safeDb(() => db.higherStudyIntake.count(), 0),
        safeDb(() => db.higherStudyIntake.count({ where: { status: "open" } }), 0),
        safeDb(() => db.higherStudyIntake.findMany({ take: 10, orderBy: { applicationDeadline: "asc" }, select: { name: true, slug: true, startDate: true, applicationDeadline: true, status: true } }), []),
      ]);
      return { counts: { total, open }, intakes: list };
    }

    case "hs-supervisors": {
      const [total, accepting, list] = await Promise.all([
        safeDb(() => db.higherStudySupervisor.count(), 0),
        safeDb(() => db.higherStudySupervisor.count({ where: { acceptingStudents: true } }), 0),
        safeDb(() => db.higherStudySupervisor.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { name: true, academicTitle: true, department: true, acceptingStudents: true, verificationStatus: true, university: { select: { officialName: true } } } }), []),
      ]);
      return { counts: { total, acceptingStudents: accepting }, supervisors: list };
    }

    case "hs-research-areas": {
      const [total, list] = await Promise.all([
        safeDb(() => db.higherStudyResearchArea.count(), 0),
        safeDb(() => db.higherStudyResearchArea.findMany({ take: 12, orderBy: { name: "asc" }, select: { name: true, slug: true, description: true } }), []),
      ]);
      return { totalResearchAreas: total, researchAreas: list };
    }

    case "hs-research-projects": {
      const [total, funded, list] = await Promise.all([
        safeDb(() => db.higherStudyResearchProject.count(), 0),
        safeDb(() => db.higherStudyResearchProject.count({ where: { fundingStatus: "fully-funded" } }), 0),
        safeDb(() => db.higherStudyResearchProject.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, fundingStatus: true, applicationDeadline: true, verificationStatus: true, university: { select: { officialName: true } } } }), []),
      ]);
      return { counts: { total, fullyFunded: funded }, researchProjects: list };
    }

    case "hs-resources": {
      const [total, list] = await Promise.all([
        safeDb(() => db.higherStudyResource.count(), 0),
        safeDb(() => db.higherStudyResource.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, slug: true, category: true, verificationStatus: true, publicationStatus: true } }), []),
      ]);
      return { totalResources: total, resources: list };
    }

    case "hs-student-stories": {
      const [total, featured, list] = await Promise.all([
        safeDb(() => db.higherStudyStudentStory.count(), 0),
        safeDb(() => db.higherStudyStudentStory.count({ where: { featured: true } }), 0),
        safeDb(() => db.higherStudyStudentStory.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { studentName: true, universityName: true, courseName: true, country: true, intake: true, featured: true } }), []),
      ]);
      return { counts: { total, featured }, stories: list };
    }

    case "hs-events": {
      const [total, upcoming, list] = await Promise.all([
        safeDb(() => db.higherStudyEvent.count(), 0),
        safeDb(() => db.higherStudyEvent.count({ where: { status: "upcoming" } }), 0),
        safeDb(() => db.higherStudyEvent.findMany({ take: 8, orderBy: { eventDate: "asc" }, select: { title: true, eventDate: true, location: true, organiser: true, status: true } }), []),
      ]);
      return { counts: { total, upcoming }, events: list };
    }

    case "el-courses": {
      const [total, published, list] = await Promise.all([
        safeDb(() => db.englishLearningCourse.count(), 0),
        safeDb(() => db.englishLearningCourse.count({ where: { isPublished: true } }), 0),
        safeDb(() => db.englishLearningCourse.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, slug: true, level: true, durationWeeks: true, priceUsd: true, isPublished: true, isFeatured: true } }), []),
      ]);
      return { counts: { total, published }, courses: list };
    }

    case "el-lessons": {
      const [total, published, list] = await Promise.all([
        safeDb(() => db.englishLearningLesson.count(), 0),
        safeDb(() => db.englishLearningLesson.count({ where: { isPublished: true } }), 0),
        safeDb(() => db.englishLearningLesson.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, lessonType: true, durationMinutes: true, isFreePreview: true, isPublished: true, course: { select: { title: true } } } }), []),
      ]);
      return { counts: { total, published }, recentLessons: list };
    }

    case "el-practice-tests": {
      const [total, published, list] = await Promise.all([
        safeDb(() => db.englishLearningPracticeTest.count(), 0),
        safeDb(() => db.englishLearningPracticeTest.count({ where: { isPublished: true } }), 0),
        safeDb(() => db.englishLearningPracticeTest.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, testType: true, level: true, durationMinutes: true, totalQuestions: true, isPublished: true } }), []),
      ]);
      return { counts: { total, published }, practiceTests: list };
    }

    case "el-questions": {
      const [total, list] = await Promise.all([
        safeDb(() => db.englishLearningQuestion.count(), 0),
        safeDb(() => db.englishLearningQuestion.findMany({ take: 8, select: { questionType: true, skillArea: true, points: true, test: { select: { title: true } } } }), []),
      ]);
      return { totalQuestions: total, sampleQuestions: list };
    }

    case "el-tutors": {
      const [total, available, list] = await Promise.all([
        safeDb(() => db.englishLearningTutor.count(), 0),
        safeDb(() => db.englishLearningTutor.count({ where: { isAvailable: true, isPublished: true } }), 0),
        safeDb(() => db.englishLearningTutor.findMany({ take: 8, orderBy: { rating: "desc" }, select: { name: true, yearsExperience: true, hourlyRateUsd: true, rating: true, isAvailable: true, verificationStatus: true } }), []),
      ]);
      return { counts: { total, available }, tutors: list };
    }

    case "el-resources": {
      const [total, list] = await Promise.all([
        safeDb(() => db.englishLearningResource.count(), 0),
        safeDb(() => db.englishLearningResource.findMany({ take: 8, orderBy: { updatedAt: "desc" }, select: { title: true, resourceType: true, level: true, isPublished: true, isFeatured: true } }), []),
      ]);
      return { totalResources: total, resources: list };
    }

    case "ai-free-hub": {
      const { providers, global } = await resolveAllProviderConfigs();
      return {
        preferredProvider: global.preferredProvider,
        cacheEnabled: global.cacheEnabled,
        smartTierRouting: global.smartTierRouting,
        configuredProviders: providers
          .filter((p) => p.configured && p.enabled)
          .map((p) => ({ id: p.spec.id, name: p.spec.name, category: p.spec.category, fastModel: p.spec.models.fast, flagshipModel: p.spec.models.flagship })),
        totalFreeProvidersAvailable: providers.length,
      };
    }

    case "ai-assistant":
    case "ai-approvals": {
      const [queued, awaitingApproval, delivered, failed, recent] = await Promise.all([
        safeDb(() => db.aiTask.count({ where: { status: "queued" } }), 0),
        safeDb(() => db.aiTask.count({ where: { status: "awaiting-approval" } }), 0),
        safeDb(() => db.aiTask.count({ where: { status: { in: ["approved", "delivered"] } } }), 0),
        safeDb(() => db.aiTask.count({ where: { status: "failed" } }), 0),
        safeDb(() => db.aiTask.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { id: true, workflow: true, objective: true, status: true, sensitivity: true, createdAt: true } }), []),
      ]);
      return { counts: { queued, awaitingApproval, delivered, failed }, recentAiTasks: recent };
    }

    case "ai-whatsapp": {
      const [leads, handoffs, recentLogs] = await Promise.all([
        safeDb(() => db.inquiry.count({ where: { referralSource: "ALAMINN_WHATSAPP_AI" } }), 0),
        safeDb(() => db.task.count({ where: { title: { contains: "WhatsApp human handoff" } } }), 0),
        safeDb(() => db.auditLog.findMany({ where: { action: { startsWith: "whatsapp_" } }, take: 8, orderBy: { createdAt: "desc" }, select: { action: true, createdAt: true } }), []),
      ]);
      return { whatsappLeadsTotal: leads, humanHandoffsTotal: handoffs, recentWhatsappEvents: recentLogs };
    }

    case "ai-analytics": {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [total7d, recent] = await Promise.all([
        safeDb(() => db.analyticsEvent.count({ where: { createdAt: { gte: since } } }), 0),
        safeDb(() => db.analyticsEvent.findMany({ take: 15, orderBy: { createdAt: "desc" }, select: { eventName: true, page: true, utmSource: true, utmCampaign: true, createdAt: true } }), []),
      ]);
      return { eventsLast7Days: total7d, recentEvents: recent };
    }

    case "social-overview":
    case "social-accounts":
    case "social-inbox":
    case "social-approvals":
    case "social-personality":
    case "social-content":
    case "social-rules": {
      const [automation, accounts, unreadConvs, pendingApprovals, rules, contents] = await Promise.all([
        safeDb(() => db.socialAutomationState.findFirst({ orderBy: { updatedAt: "desc" } }), null),
        safeDb(() => db.socialAccount.findMany({ take: 8, select: { platform: true, displayName: true, status: true, automationEnabled: true, responseMode: true, tokenExpiresAt: true } }), []),
        safeDb(() => db.socialConversation.count({ where: { status: { in: ["unread", "escalated"] } } }), 0),
        safeDb(() => db.socialApproval.count({ where: { status: { in: ["pending", "escalated"] } } }), 0),
        safeDb(() => db.socialAutomationRule.findMany({ take: 8, select: { name: true, category: true, action: true, minConfidence: true, enabled: true } }), []),
        safeDb(() => db.socialContent.count(), 0),
      ]);
      return {
        automationSwitch: automation
          ? {
              engagementEnabled: automation.engagementEnabled,
              publishingEnabled: automation.publishingEnabled,
              generationEnabled: automation.generationEnabled,
              version: automation.version,
            }
          : null,
        connectedAccounts: accounts,
        unreadOrEscalatedConversations: unreadConvs,
        pendingSocialApprovals: pendingApprovals,
        automationRules: rules,
        socialContentCount: contents,
      };
    }

    case "system-seo":
    case "system-settings": {
      const rows = await safeDb(() => db.setting.findMany({ take: 40 }), []);
      const safeSettings: Record<string, string> = {};
      for (const r of rows) {
        safeSettings[r.key] =
          isSensitiveSettingKey(r.key) || r.value.startsWith("v1:")
            ? "[CONFIGURED_REDACTED]"
            : r.value.slice(0, 160);
      }
      return { configuredSettingCount: rows.length, settingsPreview: safeSettings };
    }

    case "system-audit-logs": {
      const [total, recent] = await Promise.all([
        safeDb(() => db.auditLog.count(), 0),
        safeDb(() => db.auditLog.findMany({ take: 12, orderBy: { createdAt: "desc" }, select: { action: true, resource: true, createdAt: true, actor: { select: { name: true, role: true } } } }), []),
      ]);
      return { totalAuditLogs: total, recentLogs: recent };
    }

    case "system-roles":
    case "system-users": {
      const [total, users] = await Promise.all([
        safeDb(() => db.user.count(), 0),
        safeDb(() => db.user.findMany({ take: 15, orderBy: { createdAt: "desc" }, select: { name: true, email: true, role: true, status: true, lastLoginAt: true } }), []),
      ]);
      return { totalUsers: total, users };
    }

    default:
      return { dashboard: agent.name, route: agent.route };
  }
}

/**
 * Keyword search over Prisma models bound to the active dashboard (with per-resource RBAC checks).
 */
async function searchDashboardRecords(
  agent: DashboardAgentDefinition,
  session: Session,
  query: string,
  limit = 6
): Promise<unknown> {
  if (!hasPermission(session.role, agent.requiredPermission)) {
    return { error: `Permission ${agent.requiredPermission} required.` };
  }
  const q = query.trim();
  const take = Math.min(15, Math.max(1, Number(limit) || 6));
  if (!q) return { matches: [] };

  if (agent.group === "Higher Study") {
    const [universities, courses, scholarships, countries] = await Promise.all([
      hasPermission(session.role, "higher-study.universities.view")
        ? safeDb(() => db.higherStudyUniversity.findMany({ where: { officialName: { contains: q } }, take, select: { officialName: true, slug: true, verificationStatus: true, ieltsRequirement: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "higher-study.courses.view")
        ? safeDb(() => db.higherStudyCourse.findMany({ where: { title: { contains: q } }, take, select: { title: true, studyLevel: true, tuitionFee: true, tuitionCurrency: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "higher-study.scholarships.view")
        ? safeDb(() => db.higherStudyScholarship.findMany({ where: { name: { contains: q } }, take, select: { name: true, fundingType: true, deadline: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "higher-study.countries.view")
        ? safeDb(() => db.higherStudyCountry.findMany({ where: { name: { contains: q } }, take, select: { name: true, slug: true, tuitionFeeRange: true } }), [])
        : Promise.resolve([]),
    ]);
    return { universities, courses, scholarships, countries };
  }

  if (agent.group === "English Learning") {
    const [courses, lessons, tests, tutors] = await Promise.all([
      hasPermission(session.role, "english-learning.courses.view")
        ? safeDb(() => db.englishLearningCourse.findMany({ where: { title: { contains: q } }, take, select: { title: true, level: true, isPublished: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "english-learning.lessons.view")
        ? safeDb(() => db.englishLearningLesson.findMany({ where: { title: { contains: q } }, take, select: { title: true, lessonType: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "english-learning.practice-tests.view")
        ? safeDb(() => db.englishLearningPracticeTest.findMany({ where: { title: { contains: q } }, take, select: { title: true, testType: true, totalQuestions: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "english-learning.tutors.view")
        ? safeDb(() => db.englishLearningTutor.findMany({ where: { name: { contains: q } }, take, select: { name: true, rating: true, isAvailable: true } }), [])
        : Promise.resolve([]),
    ]);
    return { courses, lessons, tests, tutors };
  }

  if (agent.group === "CRM") {
    const canAllTasks = canViewAllOperationalTasks(session.role);
    const [contacts, inquiries, opportunities, tasks] = await Promise.all([
      hasPermission(session.role, "contacts.view")
        ? safeDb(() => db.contact.findMany({ where: { OR: [{ fullName: { contains: q } }, { organization: { contains: q } }, { tags: { contains: q } }] }, take, select: { fullName: true, organization: true, status: true, tags: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "inquiries.view")
        ? safeDb(() => db.inquiry.findMany({ where: { OR: [{ reference: { contains: q } }, { type: { contains: q } }] }, take, select: { reference: true, type: true, status: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "opportunities.view")
        ? safeDb(() => db.opportunity.findMany({ where: { title: { contains: q } }, take, select: { title: true, stage: true, value: true, currency: true } }), [])
        : Promise.resolve([]),
      safeDb(
        () =>
          db.task.findMany({
            where: {
              title: { contains: q },
              ...(canAllTasks ? {} : { assigneeId: session.userId }),
            },
            take,
            select: { title: true, status: true, priority: true },
          }),
        []
      ),
    ]);
    return { contacts, inquiries, opportunities, tasks };
  }

  if (agent.group === "Content") {
    const [articles, projects, caseStudies] = await Promise.all([
      hasPermission(session.role, "articles.view")
        ? safeDb(() => db.article.findMany({ where: { OR: [{ title: { contains: q } }, { category: { contains: q } }] }, take, select: { title: true, slug: true, category: true, status: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "projects.view")
        ? safeDb(() => db.project.findMany({ where: { name: { contains: q } }, take, select: { name: true, category: true, status: true } }), [])
        : Promise.resolve([]),
      hasPermission(session.role, "case_studies.view")
        ? safeDb(() => db.caseStudy.findMany({ where: { title: { contains: q } }, take, select: { title: true, category: true } }), [])
        : Promise.resolve([]),
    ]);
    return { articles, projects, caseStudies };
  }

  // Fallback cross-platform search — strictly gated per resource permission (SEC-07)
  const canAllTasks = canViewAllOperationalTasks(session.role);
  const canArticles = hasPermission(session.role, "articles.view");
  const canAudit = hasPermission(session.role, "audit_logs.view");

  const [articles, tasks, audits] = await Promise.all([
    canArticles
      ? safeDb(() => db.article.findMany({ where: { title: { contains: q } }, take, select: { title: true, status: true } }), [])
      : Promise.resolve([]),
    safeDb(
      () =>
        db.task.findMany({
          where: {
            title: { contains: q },
            ...(canAllTasks ? {} : { assigneeId: session.userId }),
          },
          take,
          select: { title: true, status: true },
        }),
      []
    ),
    canAudit
      ? safeDb(() => db.auditLog.findMany({ where: { action: { contains: q } }, take, select: { action: true, resource: true, createdAt: true } }), [])
      : Promise.resolve([]),
  ]);
  const out: Record<string, unknown> = { tasks };
  if (canArticles) out.articles = articles;
  if (canAudit) out.audits = audits;
  return out;
}

// ─── External 100% Free Agent Tool Implementations ────────────────────

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function toolGetWeather(city: string): Promise<Record<string, unknown>> {
  const cleanCity = city.trim();
  if (!cleanCity) return { error: "City is required." };
  try {
    const geo = await fetchJsonWithTimeout<{
      results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>;
    }>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCity)}&count=1`);
    const loc = geo.results?.[0];
    if (!loc) return { city: cleanCity, error: "City not found in Open-Meteo geocoder." };

    const forecast = await fetchJsonWithTimeout<{
      current?: { temperature_2m?: number; wind_speed_10m?: number; relative_humidity_2m?: number };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`
    );
    return {
      provider: "Open-Meteo (100% Free, No Key)",
      location: `${loc.name}${loc.country ? `, ${loc.country}` : ""}`,
      temperatureC: forecast.current?.temperature_2m ?? null,
      windSpeedKmh: forecast.current?.wind_speed_10m ?? null,
      humidityPct: forecast.current?.relative_humidity_2m ?? null,
    };
  } catch (e) {
    return {
      provider: "Open-Meteo",
      city: cleanCity,
      note: `Live Open-Meteo endpoint unreachable from current network (${e instanceof Error ? e.message : "offline"}).`,
    };
  }
}

export async function toolWikipediaLookup(query: string): Promise<Record<string, unknown>> {
  const clean = query.trim();
  if (!clean) return { error: "Query is required." };
  try {
    const titleSlug = encodeURIComponent(clean.replace(/\s+/g, "_"));
    const data = await fetchJsonWithTimeout<{
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleSlug}`);
    return {
      provider: "Wikipedia REST API (100% Free, No Key)",
      title: data.title || clean,
      description: data.description || null,
      summary: (data.extract || "No summary found.").slice(0, 1200),
      url: data.content_urls?.desktop?.page || null,
    };
  } catch (e) {
    return {
      provider: "Wikipedia REST API",
      query: clean,
      note: `Wikipedia API unreachable in current network (${e instanceof Error ? e.message : "offline"}).`,
    };
  }
}

export async function toolAcademicResearchLookup(query: string): Promise<Record<string, unknown>> {
  const clean = query.trim();
  if (!clean) return { error: "Query is required." };
  try {
    const data = await fetchJsonWithTimeout<{
      results?: Array<{
        display_name?: string;
        publication_year?: number;
        cited_by_count?: number;
        doi?: string;
        authorships?: Array<{ author?: { display_name?: string }; institutions?: Array<{ display_name?: string }> }>;
      }>;
    }>(`https://api.openalex.org/works?search=${encodeURIComponent(clean)}&per-page=5`);

    const works = (data.results || []).map((w) => ({
      title: w.display_name,
      year: w.publication_year,
      citations: w.cited_by_count ?? 0,
      doi: w.doi || null,
      authors: (w.authorships || []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean),
      institution: w.authorships?.[0]?.institutions?.[0]?.display_name || null,
    }));
    return {
      provider: "OpenAlex Scholarly API (100% Free, No Key)",
      query: clean,
      works,
    };
  } catch (e) {
    return {
      provider: "OpenAlex Scholarly API",
      query: clean,
      note: `OpenAlex API unreachable in current network (${e instanceof Error ? e.message : "offline"}).`,
    };
  }
}

export async function toolWebInstantSearch(query: string): Promise<Record<string, unknown>> {
  const clean = query.trim();
  if (!clean) return { error: "Query is required." };
  const { global } = await resolveAllProviderConfigs();

  // 1. Try Tavily free tier (1,000 credits/mo) if configured
  if (global.tavilyApiKey) {
    try {
      const tavily = await fetchJsonWithTimeout<{
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string }>;
      }>("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: global.tavilyApiKey,
          query: clean,
          max_results: 4,
          include_answer: true,
        }),
      });
      return {
        provider: "Tavily Free Search Tier",
        answer: tavily.answer || null,
        results: (tavily.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: (r.content || "").slice(0, 300),
        })),
      };
    } catch {
      // fall through
    }
  }

  // 2. Try Brave Search free tier (2,000 queries/mo) if configured
  if (global.braveSearchApiKey) {
    try {
      const brave = await fetchJsonWithTimeout<{
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      }>(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(clean)}&count=4`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": global.braveSearchApiKey,
        },
      });
      return {
        provider: "Brave Search Free Tier",
        results: (brave.web?.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: (r.description || "").slice(0, 300),
        })),
      };
    } catch {
      // fall through
    }
  }

  // 3. Zero-key DuckDuckGo Instant Answer API
  try {
    const ddg = await fetchJsonWithTimeout<{
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    }>(`https://api.duckduckgo.com/?q=${encodeURIComponent(clean)}&format=json&no_html=1&skip_disambig=1`);
    return {
      provider: "DuckDuckGo Instant Answer API (100% Free, No Key)",
      heading: ddg.Heading || clean,
      abstract: ddg.AbstractText || null,
      url: ddg.AbstractURL || null,
      related: (ddg.RelatedTopics || [])
        .filter((t) => Boolean(t.Text))
        .slice(0, 4)
        .map((t) => ({ text: t.Text, url: t.FirstURL })),
    };
  } catch (e) {
    return {
      provider: "DuckDuckGo Instant Answer",
      query: clean,
      note: `External search unreachable in current network (${e instanceof Error ? e.message : "offline"}).`,
    };
  }
}

export function buildPollinationsImageUrl(
  prompt: string,
  aspect: "landscape" | "square" | "portrait" = "landscape"
): { url: string; width: number; height: number; prompt: string } {
  // Sanitize prompt against URL/token exfiltration and control characters (SEC-10)
  const sanitized = prompt
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "")
    .replace(/[\r\n\t<>`[\]{}|\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const cleanPrompt = sanitized || "Minimalist executive abstract architecture";
  const dims =
    aspect === "square"
      ? { width: 1024, height: 1024 }
      : aspect === "portrait"
        ? { width: 768, height: 1024 }
        : { width: 1280, height: 720 };
  const seed = Math.abs(
    Array.from(cleanPrompt).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 42)
  );
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    cleanPrompt
  )}?width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true&model=flux`;
  return { url, width: dims.width, height: dims.height, prompt: cleanPrompt };
}

/**
 * Execute a single tool call safely with agent allowlist, timing & RBAC checks.
 */
export async function executeAgentTool(
  toolName: AgentToolName,
  rawArgs: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<{ output: unknown; trace: ToolExecutionTrace }> {
  const started = Date.now();

  // Enforce agent-level tool allowlist strictly (SEC-05 / PoC4)
  if (!ctx.agent.tools.includes(toolName)) {
    return {
      output: { error: `Tool "${toolName}" is not permitted for agent "${ctx.agent.id}".` },
      trace: {
        tool: toolName,
        args: rawArgs,
        ok: false,
        summary: `Denied: tool "${toolName}" not in agent allowlist`,
        durationMs: Date.now() - started,
      },
    };
  }

  // Enforce caller dashboard access before running any tool in that agent's context
  if (!hasPermission(ctx.session.role, ctx.agent.requiredPermission)) {
    return {
      output: { error: `Caller lacks required permission ${ctx.agent.requiredPermission}.` },
      trace: {
        tool: toolName,
        args: rawArgs,
        ok: false,
        summary: `Denied: missing ${ctx.agent.requiredPermission}`,
        durationMs: Date.now() - started,
      },
    };
  }

  try {
    switch (toolName) {
      case "get_dashboard_snapshot": {
        const targetId = typeof rawArgs.dashboardId === "string" && rawArgs.dashboardId
          ? rawArgs.dashboardId
          : ctx.agent.id;
        const snap = await buildDashboardSnapshot(targetId, ctx.session);
        return {
          output: snap,
          trace: {
            tool: toolName,
            args: rawArgs,
            ok: true,
            summary: `Loaded live snapshot for ${targetId}`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "search_dashboard_records": {
        const query = String(rawArgs.query || "");
        const limit = Number(rawArgs.limit || 6);
        const res = await searchDashboardRecords(ctx.agent, ctx.session, query, limit);
        return {
          output: res,
          trace: {
            tool: toolName,
            args: { query, limit },
            ok: true,
            summary: `Searched platform records for "${query}"`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "queue_governed_ai_task": {
        if (!hasPermission(ctx.session.role, "ai_tasks.create")) {
          return {
            output: { error: "Caller lacks ai_tasks.create permission." },
            trace: {
              tool: toolName,
              args: rawArgs,
              ok: false,
              summary: "Denied: missing ai_tasks.create permission",
              durationMs: Date.now() - started,
            },
          };
        }
        const workflow = String(rawArgs.workflow || "operations-audit");
        const objective = String(rawArgs.objective || "Dashboard AI Task");
        const prompt = String(rawArgs.prompt || objective);
        const task = await db.aiTask.create({
          data: {
            requesterId: ctx.session.userId,
            workflow,
            objective,
            prompt,
            sensitivity: "internal",
            approvalRequired: true,
            status: "queued",
          },
        });
        await writeAudit(ctx.session, "ai_task.create", "AiTask", task.id, {
          workflow,
          viaDashboardAgent: ctx.agent.id,
        });
        return {
          output: { taskId: task.id, workflow, status: task.status, approvalRequired: true },
          trace: {
            tool: toolName,
            args: { workflow, objective },
            ok: true,
            summary: `Queued governed AiTask (${workflow})`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "create_followup_task": {
        if (!canCreateFollowupTasks(ctx.session.role)) {
          return {
            output: { error: "Caller lacks operational write permission to create follow-up tasks." },
            trace: {
              tool: toolName,
              args: rawArgs,
              ok: false,
              summary: "Denied: missing operational write permission",
              durationMs: Date.now() - started,
            },
          };
        }
        const title = String(rawArgs.title || "").trim();
        if (!title) {
          return {
            output: { error: "Task title is required." },
            trace: { tool: toolName, args: rawArgs, ok: false, summary: "Missing title", durationMs: Date.now() - started },
          };
        }
        const priority = ["low", "medium", "high", "critical"].includes(String(rawArgs.priority))
          ? String(rawArgs.priority)
          : "medium";
        const created = await db.task.create({
          data: {
            title,
            description: rawArgs.description ? String(rawArgs.description) : `Created via ${ctx.agent.name}`,
            priority,
            status: "open",
            assigneeId: ctx.session.userId,
            relatedType: "ai-task",
            relatedId: ctx.agent.id,
          },
        });
        await writeAudit(ctx.session, "task.create", "Task", created.id, { viaDashboardAgent: ctx.agent.id });
        return {
          output: { taskId: created.id, title: created.title, priority: created.priority, status: created.status },
          trace: {
            tool: toolName,
            args: { title, priority },
            ok: true,
            summary: `Created follow-up task "${title}"`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "get_weather": {
        const city = String(rawArgs.city || "Dhaka");
        const out = await toolGetWeather(city);
        return {
          output: out,
          trace: {
            tool: toolName,
            args: { city },
            ok: !out.error,
            summary: `Weather lookup for ${city}`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "wikipedia_lookup": {
        const query = String(rawArgs.query || "");
        const out = await toolWikipediaLookup(query);
        return {
          output: out,
          trace: {
            tool: toolName,
            args: { query },
            ok: !out.error,
            summary: `Wikipedia summary for "${query}"`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "web_instant_search": {
        const query = String(rawArgs.query || "");
        const out = await toolWebInstantSearch(query);
        return {
          output: out,
          trace: {
            tool: toolName,
            args: { query },
            ok: !out.error,
            summary: `Free web search for "${query}"`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "academic_research_lookup": {
        const query = String(rawArgs.query || "");
        const out = await toolAcademicResearchLookup(query);
        return {
          output: out,
          trace: {
            tool: toolName,
            args: { query },
            ok: !out.error,
            summary: `OpenAlex research search for "${query}"`,
            durationMs: Date.now() - started,
          },
        };
      }

      case "generate_free_image": {
        const prompt = String(rawArgs.prompt || "");
        const aspect = (["landscape", "square", "portrait"].includes(String(rawArgs.aspect))
          ? String(rawArgs.aspect)
          : "landscape") as "landscape" | "square" | "portrait";
        const img = buildPollinationsImageUrl(prompt, aspect);
        return {
          output: {
            provider: "Pollinations.ai FLUX ($0, Zero Key)",
            imageUrl: img.url,
            width: img.width,
            height: img.height,
            markdownEmbed: `![${img.prompt.slice(0, 60)}](${img.url})`,
          },
          trace: {
            tool: toolName,
            args: { prompt, aspect },
            ok: true,
            summary: `Generated free ${img.width}x${img.height} Pollinations FLUX image`,
            durationMs: Date.now() - started,
            imageUrl: img.url,
          },
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      output: { error: msg },
      trace: {
        tool: toolName,
        args: rawArgs,
        ok: false,
        summary: `Failed: ${msg.slice(0, 80)}`,
        durationMs: Date.now() - started,
      },
    };
  }
}
