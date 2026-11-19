/**
 * Integration registry — verified external projects and how each one connects.
 *
 * IMPORTANT (honesty + licensing):
 *  - We do NOT vendor these repositories into this codebase. Many are GPL/AGPL,
 *    GB-scale, or native desktop/GPU projects (C/C++/Swift/Java/Python). Copying
 *    them in would break their licenses and this platform's build.
 *  - "adapter"  = we ship a real HTTP client + connection test against an official API.
 *  - "service"  = self-host the project, then connect it here via base URL + key.
 *  - "reference"= documentation / recipes / recipes to study, not a runtime dependency.
 *  - "desktop"  = runs on a workstation/GPU, not embeddable in this web server.
 *  - "unavailable" = the link did not resolve at verification time.
 *  - "excluded" = intentionally not integrated (offensive tooling / out of scope).
 *
 * Verification metadata (license/language/size) was read from the GitHub API.
 */
export type IntegrationMode = "adapter" | "service" | "reference" | "desktop" | "unavailable" | "excluded";
export type IntegrationCategory =
  | "Messaging & SMS"
  | "CRM & Inbox"
  | "Social Publishing"
  | "AI & Agents"
  | "Video & Media"
  | "SEO & Growth"
  | "Voice & VoIP"
  | "Dev Tooling"
  | "Reference"
  | "Excluded";

export interface ConfigField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  required?: boolean;
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  url: string;
  category: IntegrationCategory;
  mode: IntegrationMode;
  license: string;
  language: string;
  summary: string;
  /** How this platform actually uses it. */
  integrationNote: string;
  docsUrl?: string;
  /** Only adapter/service modes expose configuration fields. */
  fields?: ConfigField[];
  /** Connector id used by the test runner (adapter/service). */
  connector?: string;
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  // ── Messaging & SMS ──────────────────────────────────────────────
  { id: "httpsms", name: "httpSMS", url: "https://github.com/NdoleStudio/httpsms", category: "Messaging & SMS", mode: "adapter", license: "AGPL-3.0", language: "Go", connector: "httpsms",
    summary: "Send/receive SMS through your own Android phone via a hosted or self-hosted API.",
    integrationNote: "Native adapter: store your httpSMS API key, test the connection, and route consent-based SMS through your own device. AGPL server is self-hosted separately; only the MIT API contract is used here.",
    docsUrl: "https://docs.httpsms.com", fields: [{ key: "apiKey", label: "httpSMS API key", secret: true, required: true, placeholder: "xsms-..." }, { key: "baseUrl", label: "API base URL", placeholder: "https://api.httpsms.com" }] },
  { id: "httpsms-node", name: "httpSMS Node client", url: "https://github.com/NdoleStudio/httpsms-node", category: "Messaging & SMS", mode: "reference", license: "MIT", language: "TypeScript",
    summary: "Official MIT-licensed Node client for the httpSMS API.",
    integrationNote: "Reference for the httpSMS adapter's request/response shapes. The adapter speaks the same REST contract directly, so no extra dependency is required." },
  { id: "opensms", name: "OpenSMS", url: "https://github.com/daslearning-org/OpenSMS", category: "Messaging & SMS", mode: "service", license: "Apache-2.0", language: "Python", connector: "generic",
    summary: "Self-hosted SMS API server.",
    integrationNote: "Self-host OpenSMS, then point this connector at its base URL + key. Connection test verifies reachability; sending is wired through the generic SMS gateway once you confirm its API shape.",
    fields: [{ key: "baseUrl", label: "OpenSMS base URL", required: true, placeholder: "https://sms.example.com" }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "domovina-sms", name: "sms.domovina.ai", url: "https://github.com/domovinatv/sms.domovina.ai", category: "Messaging & SMS", mode: "service", license: "no asserted license", language: "Go", connector: "generic",
    summary: "Free SMS gateway built on httpSMS.",
    integrationNote: "No license is asserted on the repo, so we treat it as an external service only (connect by URL), never copy code. Prefer the licensed httpSMS adapter for production.",
    fields: [{ key: "baseUrl", label: "Gateway base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "textbelt", name: "Textbelt", url: "https://textbelt.com", category: "Messaging & SMS", mode: "adapter", license: "Proprietary (free tier)", language: "REST", connector: "textbelt",
    summary: "Free SMS API — 1 SMS per day per phone number without a key (US/Canada best-effort); paid keys send more.",
    integrationNote: "Native adapter: POST /text with { phone, message, key } (key=TEXTBELT for the free daily tier). Listed under jixserver/free-for-dev → SMS. No code is copied; we call the documented public API only.",
    fields: [{ key: "apiKey", label: "Textbelt key", secret: true, placeholder: "TEXTBELT (free daily tier) or paid key" }, { key: "baseUrl", label: "API base URL", placeholder: "https://textbelt.com" }] },
  { id: "twilio", name: "Twilio", url: "https://www.twilio.com", category: "Messaging & SMS", mode: "service", license: "Proprietary API", language: "REST", connector: "generic",
    summary: "Commercial SMS API with a free trial (~$15 trial credit).",
    integrationNote: "Listed under jixserver/free-for-dev → SMS. Self-managed commercial service; connect Account SID + Auth Token by URL. Not vendored. Use only with numbers/consent you own.",
    fields: [{ key: "accountSid", label: "Account SID", required: true }, { key: "authToken", label: "Auth Token", secret: true, required: true }, { key: "from", label: "From / Messaging Service SID", placeholder: "+15017122661" }] },
  { id: "plivo", name: "Plivo", url: "https://www.plivo.com", category: "Messaging & SMS", mode: "service", license: "Proprietary API", language: "REST", connector: "generic",
    summary: "SMS/Voice API with free trial credits.",
    integrationNote: "Listed under jixserver/free-for-dev → SMS. Self-managed commercial service; connect Auth ID + Auth Token by URL. Not vendored.",
    fields: [{ key: "authId", label: "Auth ID", required: true }, { key: "authToken", label: "Auth Token", secret: true, required: true }, { key: "from", label: "From number", placeholder: "+14155550000" }] },
  // ── Email (free provider failover loop, from jixserver/free-for-dev → Email) ─────
  { id: "sparkpost", name: "SparkPost", url: "https://www.sparkpost.com", category: "Messaging & SMS", mode: "adapter", license: "Proprietary (free tier)", language: "REST", connector: "sparkpost",
    summary: "First 100,000 emails/month free — enterprise-grade email API.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Native adapter: POST /api/v1/transmissions. No code is copied; we call the documented public API only.",
    fields: [{ key: "apiKey", label: "SparkPost API key", secret: true, required: true, placeholder: "YOUR_API_KEY" }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "mailgun", name: "Mailgun", url: "https://www.mailgun.com", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "REST", connector: "generic",
    summary: "First 10,000 emails/month free — popular email API/SMTP service.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect API key + sandbox domain by URL. Not vendored.",
    fields: [{ key: "apiKey", label: "Mailgun API key", secret: true, required: true, placeholder: "key-..." }, { key: "domain", label: "Sandbox domain", required: true, placeholder: "sandbox.mailgun.org" }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "sendgrid", name: "SendGrid", url: "https://sendgrid.com", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "REST", connector: "generic",
    summary: "12,000 emails/month and 2,000 contacts free.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect your API key. Not vendored.",
    fields: [{ key: "apiKey", label: "SendGrid API key", secret: true, required: true, placeholder: "SG...." }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "mailjet", name: "Mailjet", url: "https://www.mailjet.com", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "REST", connector: "generic",
    summary: "6,000 emails/month free.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect API key + secret key. Not vendored.",
    fields: [{ key: "apiKey", label: "Mailjet API key", secret: true, required: true, placeholder: "..." }, { key: "authToken", label: "Secret key", secret: true, required: true, placeholder: "..." }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "sendinblue", name: "SendinBlue (Brevo)", url: "https://www.sendinblue.com", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "REST", connector: "generic",
    summary: "9,000 emails/month free (300/day) — email/SMS marketing platform.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect your API key. Not vendored.",
    fields: [{ key: "apiKey", label: "SendinBlue API key", secret: true, required: true, placeholder: "xkeysib-..." }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "sendpulse", name: "SendPulse", url: "https://sendpulse.com", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "REST", connector: "generic",
    summary: "50 emails free/hour, first 12,000 emails/month free.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Connect client ID + secret. Not vendored.",
    fields: [{ key: "clientId", label: "Client ID", required: true }, { key: "clientSecret", label: "Client secret", secret: true, required: true }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "pepipost", name: "Pepipost", url: "https://www.pepipost.com", category: "Messaging & SMS", mode: "adapter", license: "Proprietary (free tier)", language: "REST", connector: "pepipost",
    summary: "Unlimited free for first three months, then first 25,000 emails/month free.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Native adapter: POST /send_mail. No code is copied; we call the documented public API only.",
    fields: [{ key: "apiKey", label: "Pepipost API key", secret: true, required: true, placeholder: "..." }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "elasticemail", name: "Elastic Email", url: "https://elasticemail.com", category: "Messaging & SMS", mode: "adapter", license: "Proprietary (free tier)", language: "REST", connector: "elasticemail",
    summary: "First 150,000 emails/month free — the largest free tier.",
    integrationNote: "Listed under jixserver/free-for-dev → Email. Native adapter: POST /v4/email/send. No code is copied; we call the documented public API only.",
    fields: [{ key: "apiKey", label: "Elastic Email API key", secret: true, required: true, placeholder: "..." }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "resend", name: "Resend", url: "https://resend.com", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "REST", connector: "generic",
    summary: "Modern email API with free tier — already integrated in src/lib/email/transport.ts.",
    integrationNote: "Already used by the platform's email transport. Listed here so it can participate in the email failover loop.",
    fields: [{ key: "apiKey", label: "Resend API key", secret: true, required: true, placeholder: "re_..." }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  { id: "smtp", name: "Custom SMTP", url: "", category: "Messaging & SMS", mode: "service", license: "Proprietary (free tier)", language: "SMTP", connector: "generic",
    summary: "Bring your own SMTP server — already integrated in src/lib/email/transport.ts.",
    integrationNote: "Already used by the platform's email transport. Listed here so it can participate in the email failover loop.",
    fields: [{ key: "host", label: "SMTP host", required: true, placeholder: "smtp.example.com" }, { key: "port", label: "SMTP port", required: true, placeholder: "587" }, { key: "user", label: "SMTP user", required: true }, { key: "pass", label: "SMTP password", secret: true, required: true }, { key: "from", label: "From address", required: true, placeholder: "hello@example.com" }] },
  // ── CRM & Inbox ──────────────────────────────────────────────────
  { id: "wacrm", name: "WACRM", url: "https://github.com/ArnasDon/wacrm", category: "CRM & Inbox", mode: "service", license: "MIT", language: "TypeScript", connector: "generic",
    summary: "Self-hostable WhatsApp CRM template: shared inbox, contacts, Meta Cloud API.",
    integrationNote: "Self-host WACRM and connect its base URL. This platform already has its own CRM + WhatsApp AI; WACRM is offered as an optional external inbox, not merged into the codebase.",
    docsUrl: "https://wacrm.tech/docs/getting-started", fields: [{ key: "baseUrl", label: "WACRM base URL", required: true }, { key: "apiKey", label: "API key / token", secret: true }] },
  { id: "deskcomm", name: "DeskcommCRM", url: "https://github.com/melgarafael/DeskcommCRM", category: "CRM & Inbox", mode: "service", license: "MIT", language: "TypeScript", connector: "generic",
    summary: "Open-source AI sales OS with native AI agents.",
    integrationNote: "Large MIT project; run it separately and connect by URL if desired. Not vendored. Use as a reference for AI-agent CRM patterns.",
    fields: [{ key: "baseUrl", label: "Deskcomm base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "ai-marketing-crm", name: "Ai-Markting-crm", url: "https://github.com/engralaminn-collab/Ai-Markting-crm", category: "CRM & Inbox", mode: "unavailable", license: "unknown", language: "unknown",
    summary: "Link returned 404 at verification time.",
    integrationNote: "The repository was not found (404). If it is private or renamed, share a working URL or access and it can be re-verified. Nothing was integrated from a dead link." },

  // ── Social Publishing ────────────────────────────────────────────
  { id: "postiz", name: "Postiz", url: "https://github.com/gitroomhq/postiz-app", category: "Social Publishing", mode: "service", license: "AGPL-3.0", language: "TypeScript", connector: "generic",
    summary: "Agentic social-media scheduling tool.",
    integrationNote: "AGPL: self-host Postiz separately and connect its API. This platform's own Social Scheduler remains the native path; Postiz is an optional external publisher. No AGPL code is copied in.",
    docsUrl: "https://docs.postiz.com", fields: [{ key: "baseUrl", label: "Postiz base URL", required: true }, { key: "apiKey", label: "Postiz API key", secret: true }] },
  { id: "meta-ai", name: "Meta for Developers / AI", url: "https://developer.meta.com/ai", category: "Social Publishing", mode: "adapter", license: "proprietary API", language: "REST", connector: "meta",
    summary: "Official Meta Graph / WhatsApp Cloud / Llama API surface.",
    integrationNote: "Native adapter uses the official Graph API with your page/WhatsApp token (already used by the Social + WhatsApp kits). We use documented endpoints only — no reverse engineering of private APIs.",
    docsUrl: "https://developers.facebook.com/docs/graph-api", fields: [{ key: "accessToken", label: "Graph access token", secret: true, required: true }, { key: "apiVersion", label: "Graph API version", placeholder: "v21.0" }] },
  { id: "meta-cookbook", name: "Meta Model Cookbook", url: "https://github.com/meta-models/meta-model-cookbook", category: "AI & Agents", mode: "reference", license: "MIT", language: "Python",
    summary: "Developer recipes for Meta Model API agentic workflows.",
    integrationNote: "MIT recipes used as reference for tool-calling agent loops. Not a runtime dependency." },

  // ── AI & Agents ──────────────────────────────────────────────────
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/blog/tutorials/build-tool-calling-agent-loop", category: "AI & Agents", mode: "adapter", license: "proprietary API", language: "REST", connector: "openrouter",
    summary: "Unified LLM gateway; tool-calling agent loop tutorial.",
    integrationNote: "Native adapter: OpenRouter is already one of the free-AI providers. Store a key here and test it against the official /api/v1 key endpoint. Documented API only.",
    docsUrl: "https://openrouter.ai/docs", fields: [{ key: "apiKey", label: "OpenRouter API key", secret: true, required: true, placeholder: "sk-or-..." }] },
  { id: "dify", name: "Dify", url: "https://github.com/langgenius/dify", category: "AI & Agents", mode: "service", license: "custom (Dify Open Source)", language: "Python", connector: "generic",
    summary: "Agentic workflows, RAG pipelines and model management.",
    integrationNote: "Self-host Dify and connect its base URL + API key. Its custom license restricts multi-tenant SaaS resale; review it before commercial use. Not vendored.",
    docsUrl: "https://docs.dify.ai", fields: [{ key: "baseUrl", label: "Dify base URL", required: true }, { key: "apiKey", label: "Dify API key", secret: true }] },
  { id: "container", name: "Container (agent sandbox)", url: "https://github.com/aerovato/container", category: "AI & Agents", mode: "reference", license: "BSD-3-Clause", language: "TypeScript",
    summary: "Persistent Linux workspaces for agentic development.",
    integrationNote: "Reference for sandboxed agent execution. Running arbitrary agent code in-process is out of scope for this web server; use a dedicated isolated runner if needed." },
  { id: "runninghub", name: "ComfyUI RunningHub API", url: "https://github.com/HM-RunningHub/ComfyUI_RH_APICall", category: "AI & Agents", mode: "service", license: "no asserted license", language: "Python", connector: "generic",
    summary: "ComfyUI plugin to call RunningHub cloud workflows.",
    integrationNote: "Connect a RunningHub API key to trigger ComfyUI image/video workflows externally. No license asserted on the plugin; we use the hosted API contract only.",
    fields: [{ key: "baseUrl", label: "RunningHub base URL", placeholder: "https://www.runninghub.cn" }, { key: "apiKey", label: "RunningHub API key", secret: true, required: true }] },

  // ── Video & Media ────────────────────────────────────────────────
  { id: "remotion", name: "Remotion", url: "https://github.com/remotion-dev/remotion", category: "Video & Media", mode: "reference", license: "custom (Remotion License)", language: "TypeScript",
    summary: "Make videos programmatically with React.",
    integrationNote: "Remotion has a company license for commercial use. The native Video Studio exports scripts/storyboards; a Remotion render farm can be added later as a separate licensed service. Not vendored." },
  { id: "moneyprinter", name: "MoneyPrinterTurbo", url: "https://github.com/harry0703/MoneyPrinterTurbo", category: "Video & Media", mode: "service", license: "MIT", language: "Python", connector: "generic",
    summary: "One-click AI short-video generation.",
    integrationNote: "MIT; self-host and connect its API to generate short videos from a topic. GPU/CPU heavy — runs as a separate worker, not inside this server.",
    fields: [{ key: "baseUrl", label: "MoneyPrinter base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "openshorts", name: "OpenShorts", url: "https://github.com/mutonby/openshorts", category: "Video & Media", mode: "service", license: "MIT", language: "Python", connector: "generic",
    summary: "Turn long videos into viral short clips.",
    integrationNote: "MIT; self-host and connect by URL for clip generation. Separate worker.",
    fields: [{ key: "baseUrl", label: "OpenShorts base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "pixelle", name: "Pixelle-Video", url: "https://github.com/ATH-MaaS/Pixelle-Video", category: "Video & Media", mode: "service", license: "Apache-2.0", language: "Python", connector: "generic",
    summary: "Fully automated AI short-video engine.",
    integrationNote: "Apache-2.0; self-host and connect by URL. Separate GPU worker.",
    fields: [{ key: "baseUrl", label: "Pixelle base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "voicebox", name: "Voicebox", url: "https://github.com/jamiepine/voicebox", category: "Video & Media", mode: "service", license: "MIT", language: "Python", connector: "generic",
    summary: "Open-source AI voice studio: clone, dictate, create.",
    integrationNote: "MIT; self-host and connect for TTS/voice. Only clone voices you have rights to. Separate worker.",
    fields: [{ key: "baseUrl", label: "Voicebox base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "videocaptioner", name: "VideoCaptioner", url: "https://github.com/WEIFENG2333/VideoCaptioner", category: "Video & Media", mode: "desktop", license: "GPL-3.0", language: "Python",
    summary: "LLM-based subtitle generation/correction desktop app.",
    integrationNote: "GPL desktop tool. Run it on a workstation; not embedded. GPL code is not copied into this platform." },
  { id: "rescript", name: "Rescript", url: "https://github.com/wassgha/rescript", category: "Video & Media", mode: "desktop", license: "no asserted license", language: "TypeScript",
    summary: "Transcript-based video/audio editor.",
    integrationNote: "Desktop/editor project; reference only. No license asserted — not vendored." },
  { id: "kdenlive", name: "Kdenlive", url: "https://github.com/KDE/kdenlive", category: "Video & Media", mode: "desktop", license: "GPL-3.0", language: "C++",
    summary: "Free open-source video editor (MLT).",
    integrationNote: "Native desktop editor (5GB+ C++). Run separately; cannot be embedded in a web server. GPL." },
  { id: "obs", name: "OBS Studio", url: "https://github.com/obsproject/obs-studio", category: "Video & Media", mode: "desktop", license: "GPL-2.0", language: "C",
    summary: "Live streaming / recording studio.",
    integrationNote: "Desktop streaming app. Can be controlled via obs-websocket on a workstation; not embedded here. GPL." },
  { id: "cogvideo", name: "CogVideo", url: "https://github.com/zai-org/CogVideo", category: "Video & Media", mode: "desktop", license: "Apache-2.0", language: "Python",
    summary: "CogVideoX text/image-to-video models.",
    integrationNote: "GPU model weights + inference code. Run on a GPU host or via a hosted inference API; not embeddable in this server. Connect a hosted endpoint through RunningHub/generic if available." },
  { id: "hunyuanvideo", name: "HunyuanVideo", url: "https://github.com/Tencent-Hunyuan/HunyuanVideo", category: "Video & Media", mode: "desktop", license: "custom (Tencent Hunyuan)", language: "Python",
    summary: "Large video-generation framework.",
    integrationNote: "GPU model with a custom community license. Run on dedicated GPU infrastructure; review license before commercial use. Not vendored." },
  { id: "infinitetalk", name: "InfiniteTalk", url: "https://github.com/MeiGen-AI/InfiniteTalk", category: "Video & Media", mode: "desktop", license: "Apache-2.0", language: "Python",
    summary: "Unlimited-length talking-video generation.",
    integrationNote: "GPU inference project. Separate GPU worker; not embedded." },
  { id: "reddit-video", name: "RedditVideoMakerBot", url: "https://github.com/elebumm/RedditVideoMakerBot", category: "Video & Media", mode: "desktop", license: "GPL-3.0", language: "Python",
    summary: "Create Reddit-style videos from a command.",
    integrationNote: "GPL CLI bot. Run separately; not vendored. Respect Reddit content rights." },
  { id: "videorecorder", name: "VideoRecorder", url: "https://github.com/qdrzwd/VideoRecorder", category: "Video & Media", mode: "desktop", license: "Apache-2.0", language: "Java",
    summary: "Android video recording library.",
    integrationNote: "Android (Java) library; mobile-only, not a web-server dependency." },
  { id: "youtube-dl", name: "youtube-dl", url: "https://github.com/ytdl-org/youtube-dl", category: "Video & Media", mode: "reference", license: "Unlicense", language: "Python",
    summary: "Command-line video downloader.",
    integrationNote: "Reference only. Downloading third-party video may violate terms/copyright; not wired into the platform. Use only for content you own." },
  { id: "claude-video", name: "claude-video", url: "https://github.com/bradautomates/claude-video", category: "Video & Media", mode: "reference", license: "MIT", language: "Python",
    summary: "Give an LLM the ability to 'watch' a video.",
    integrationNote: "MIT reference for video-understanding pipelines. Not a runtime dependency." },
  { id: "videocode", name: "VideoCode", url: "https://github.com/MarkTechStation/VideoCode", category: "Video & Media", mode: "reference", license: "no asserted license", language: "Jupyter",
    summary: "Notebook/video code samples.",
    integrationNote: "Reference notebooks; no license asserted. Not vendored." },
  { id: "3b1b-videos", name: "3b1b/videos", url: "https://github.com/3b1b/videos", category: "Video & Media", mode: "reference", license: "no asserted license", language: "Python",
    summary: "Manim scenes from 3Blue1Brown videos.",
    integrationNote: "Reference for programmatic animation (Manim). Content is rights-reserved; not vendored." },

  // ── SEO & Growth ─────────────────────────────────────────────────
  { id: "open-seo", name: "OpenSEO", url: "https://github.com/every-app/open-seo", category: "SEO & Growth", mode: "service", license: "MIT", language: "TypeScript", connector: "generic",
    summary: "Open-source Semrush/Ahrefs alternative.",
    integrationNote: "MIT; self-host and connect for keyword/backlink data. The native SEO kit remains the on-page audit path.",
    fields: [{ key: "baseUrl", label: "OpenSEO base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "scrapling", name: "Scrapling", url: "https://github.com/D4Vinci/Scrapling", category: "SEO & Growth", mode: "reference", license: "BSD-3-Clause", language: "Python",
    summary: "Adaptive web-scraping framework.",
    integrationNote: "BSD reference. The native SEO audit already does bounded same-site HTML fetching; Scrapling is a reference for a future Python crawler worker. Scrape only where permitted." },
  { id: "mailcheap", name: "Mailcheap", url: "https://github.com/marclou/mailcheap", category: "SEO & Growth", mode: "service", license: "AGPL-3.0", language: "JavaScript", connector: "generic",
    summary: "Agent-friendly newsletter platform (pay per email).",
    integrationNote: "AGPL; self-host separately and connect by URL. The native Email Builder + consent queue remains the default. No AGPL code copied in.",
    fields: [{ key: "baseUrl", label: "Mailcheap base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "presenton", name: "Presenton", url: "https://github.com/presenton/presenton", category: "SEO & Growth", mode: "service", license: "Apache-2.0", language: "TypeScript", connector: "generic",
    summary: "Open-source AI presentation generator + API.",
    integrationNote: "Apache-2.0; self-host and connect to generate decks from a brief. Separate service.",
    fields: [{ key: "baseUrl", label: "Presenton base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },

  // ── Voice & VoIP ─────────────────────────────────────────────────
  { id: "linphone", name: "Linphone iPhone", url: "https://github.com/BelledonneCommunications/linphone-iphone", category: "Voice & VoIP", mode: "desktop", license: "GPL-3.0", language: "Swift",
    summary: "SIP VoIP/video softphone for iOS.",
    integrationNote: "GPL iOS app. Mobile client only; not a web-server dependency." },
  { id: "voip-privacy", name: "VoIP (0perationPrivacy)", url: "https://github.com/0perationPrivacy/VoIP", category: "Voice & VoIP", mode: "service", license: "GPL-3.0", language: "JavaScript", connector: "generic",
    summary: "Web Telnyx/Twilio VoIP interface (SMS/MMS/calls).",
    integrationNote: "GPL web app; self-host separately if desired. For native calling, prefer official Twilio/Telnyx APIs. Not vendored.",
    fields: [{ key: "baseUrl", label: "VoIP app base URL", required: true }, { key: "apiKey", label: "API key", secret: true }] },
  { id: "voip-sample", name: "VoIP-Call-Sample", url: "https://github.com/developerspace-samples/VoIP-Call-Sample", category: "Voice & VoIP", mode: "reference", license: "Apache-2.0", language: "Java",
    summary: "Android ConnectionService VoIP sample.",
    integrationNote: "Android sample; reference only." },
  { id: "ipftrace2", name: "ipftrace2", url: "https://github.com/YutaroHayakawa/ipftrace2", category: "Dev Tooling", mode: "reference", license: "custom", language: "C",
    summary: "Packet-oriented Linux kernel function-call tracer.",
    integrationNote: "Low-level kernel/eBPF debugging tool, unrelated to this product's runtime. Reference only; not integrated." },

  // ── Dev Tooling ──────────────────────────────────────────────────
  { id: "electron-ipc", name: "electron-promise-ipc", url: "https://github.com/sibnerian/electron-promise-ipc", category: "Dev Tooling", mode: "reference", license: "MIT", language: "TypeScript",
    summary: "Promise-flavored IPC for Electron.",
    integrationNote: "Electron-only utility; this is a Next.js web app, so it does not apply. Reference only." },

  // ── Excluded ─────────────────────────────────────────────────────
  { id: "wifi-cracker", name: "WiFi-Password-Cracker-Pro", url: "https://github.com/YouBTech01/WiFi-Password-Cracker-Pro", category: "Excluded", mode: "excluded", license: "MIT", language: "TeX",
    summary: "Wi-Fi credential-cracking tooling.",
    integrationNote: "Intentionally NOT integrated. Cracking Wi-Fi passwords you do not own/authorize is unauthorized access and is out of scope for this platform. Listing it here for transparency only." },
];

export const INTEGRATION_BY_ID: Record<string, IntegrationDefinition> = Object.fromEntries(INTEGRATIONS.map(i => [i.id, i]));
export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  "Messaging & SMS", "CRM & Inbox", "Social Publishing", "AI & Agents", "Video & Media", "SEO & Growth", "Voice & VoIP", "Dev Tooling", "Reference", "Excluded",
];
export function isConnectable(mode: IntegrationMode): boolean { return mode === "adapter" || mode === "service"; }
