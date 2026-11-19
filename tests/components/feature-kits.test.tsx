// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import DiagramKit from "@/components/admin/kits/diagrams";
import HumanizerKit from "@/components/admin/kits/humanizer";
import CrmKit from "@/components/admin/kits/crm";
import MarketingKit from "@/components/admin/kits/marketing";
import SeoKit from "@/components/admin/kits/seo";
import AnalyticsKit from "@/components/admin/kits/analytics";
import VideoKit from "@/components/admin/kits/video";
import EmailCampaignBuilder from "@/components/admin/kits/email-campaign";
import EmailGateway from "@/components/admin/kits/email";
import SocialKit from "@/components/admin/kits/social";
import ChatKit from "@/components/admin/kits/chat";
import IntegrationsKit from "@/components/admin/kits/integrations";
import { LiveSupportWidget } from "@/components/site/live-support-widget";
const fetchMock = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, message: "Saved." }) });
const doc = { id: "doc-1", kind: "diagram", title: "Saved diagram", content: JSON.stringify({ nodes: [{ id: "a", label: "Visitor", x: 100, y: 100, color: "blue" }], edges: [] }), metadata: null, updatedAt: new Date().toISOString() };
const campaign = { id: "campaign-1", name: "Launch", objective: "Grow", audience: "Operators", brief: "A useful launch", status: "draft", budget: 100, currency: "USD", channels: '["email"]', startsAt: null, endsAt: null, utmCampaign: "launch", _count: { contents: 0, emailCampaigns: 0 } };
const email = { id: "email-1", name: "Welcome", subject: "A useful update", preheader: "Preview", bodyText: "Hello", bodyHtml: "<p>Hello</p>", content: JSON.stringify({ subject: "A useful update", preheader: "Preview", bodyText: "Hello", ctaLabel: "Visit", ctaUrl: "https://alaminn.info", accent: "orange" }), audience: "all", campaignId: null, scheduledAt: null, status: "draft", createdAt: new Date().toISOString(), _count: { deliveries: 0 } };
function fixture(url: string) {
  if (url.includes("kits/documents")) return [doc];
  if (url.includes("/crm")) return { opportunities: [], contacts: [] };
  if (url.includes("/marketing")) return { campaigns: [campaign], attribution: [] };
  if (url.includes("/seo-dashboard")) return { history: [], articles: [], siteUrl: "https://alaminn.info" };
  if (url.includes("/analytics-dashboard")) return { days: 30, truncated: false, kpis: { views: 12, sessions: 4, inquiries: 2, meetings: 1, subscribers: 3 }, daily: [{ date: "11-02", views: 12, sessions: 4 }], byEvent: [{ name: "page_view", count: 12 }], sources: [], pages: [], system: null };
  if (url.includes("/email-builder")) return { campaigns: [email], audiences: [{ interest: null, _count: { id: 3 } }], parentCampaigns: [campaign], stats: [], emailConfigured: false, siteUrl: "https://alaminn.info" };
  if (url.includes("/social-scheduler")) return { posts: [], accounts: [], campaigns: [campaign], publishingEnabled: false, cronConfigured: true };
  if (url.includes("/live-chat")) return [];
  if (url.includes("/integrations")) return { categories: ["AI & Agents", "Messaging & SMS"], integrations: [
    { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai", category: "AI & Agents", mode: "adapter", license: "proprietary API", language: "REST", summary: "Unified LLM gateway.", integrationNote: "Native adapter using the official API.", docsUrl: null, fields: [{ key: "apiKey", label: "OpenRouter API key", secret: true, required: true, placeholder: "sk-or-..." }], connection: { id: "openrouter", enabled: false, values: { apiKey: "" }, configured: false, lastTestAt: null, lastTestOk: null, lastTestMessage: null } },
    { id: "kdenlive", name: "Kdenlive", url: "https://github.com/KDE/kdenlive", category: "Video & Media", mode: "desktop", license: "GPL-3.0", language: "C++", summary: "Desktop video editor.", integrationNote: "Desktop editor; run separately, not embedded.", docsUrl: null, fields: [], connection: null },
  ] };
  return {};
}
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset().mockImplementation(async (url: string) => ok(fixture(url))); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn(); URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("feature workspaces render API data", () => {
  const cases = [["AI Diagram Designer", DiagramKit], ["Content Humanizer", HumanizerKit], ["CRM Pipeline", CrmKit], ["Marketing Campaign Kit", MarketingKit], ["SEO Engine Audit", SeoKit], ["Email Campaign Builder", EmailCampaignBuilder], ["Email Failover Gateway", EmailGateway], ["System Analytics", AnalyticsKit], ["Video Storyboard Studio", VideoKit], ["Social Media Scheduler", SocialKit], ["Live Support Desk", ChatKit]] as const;
  it.each(cases)("renders %s without a runtime error", async (title, Component) => { render(<Component />); expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument(); expect(fetchMock).toHaveBeenCalled(); });
});
describe("feature interactions", () => {
  it("saves a diagram through the API", async () => { render(<DiagramKit />); await screen.findByRole("heading", { level: 1 }); fireEvent.click(screen.getByRole("button", { name: /Save diagram/ })); await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/v1/admin/kits/documents" && init?.method === "POST")).toBe(true)); });
  it("reopens email CTA from persisted structured content and disables unconfigured sending", async () => { render(<EmailCampaignBuilder />); fireEvent.click(await screen.findByRole("button", { name: /Review & send/ })); expect(screen.getByDisplayValue("Visit")).toBeInTheDocument(); expect(screen.getByDisplayValue("https://alaminn.info")).toBeInTheDocument(); expect(screen.getByRole("button", { name: /Queue campaign/ })).toBeDisabled(); });
  it("renders the Integration Hub and opens the configure dialog for a connectable adapter", async () => {
    render(<IntegrationsKit />);
    expect(await screen.findByRole("heading", { level: 1, name: "Integration Hub" })).toBeInTheDocument();
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText("Kdenlive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Configure/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/OpenRouter API key/)).toBeInTheDocument();
  });
  it("runs a connection test through the API", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url.includes("/integrations/openrouter/test") && init?.method === "POST" ? ok({ ok: true, message: "OpenRouter key is valid.", latencyMs: 10 }) : ok(fixture(url)));
    render(<IntegrationsKit />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getAllByRole("button", { name: /^Test$/ })[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/integrations/openrouter/test") && init?.method === "POST")).toBe(true));
  });
  it("sends a public support message and retains its conversation token", async () => { fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/v1/support" && init?.method === "POST" ? ok({ id: "conversation-1", token: "a".repeat(64) }) : ok({ status: "open", messages: [{ id: "m1", sender: "visitor", senderName: "Visitor", body: "I need help", createdAt: new Date().toISOString() }] })); render(<LiveSupportWidget />); fireEvent.click(screen.getByRole("button", { name: "Open live support" })); fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Visitor" } }); fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "I need help" } }); fireEvent.click(screen.getByRole("button", { name: "Send message" })); await waitFor(() => expect(sessionStorage.getItem("alaminn-support-conversation")).toContain("conversation-1")); });
});
