# ALO Reference Tools & Agent Knowledge Catalog

| | |
|---|---|
| Status | Reference catalog (v2 — wave 2 added) |
| Created | 2026-11-28 (v1); wave 2 same day |
| Source | Operator-provided URL batches: 16 (v1) + 21 entries (v2), all verified individually |
| Scope | External open-source projects, platforms and services that ALO agents and engineering treat as reference knowledge |
| Rules | Reference only — no competitor content is copied; every ALO-side implementation stays original. Facts marked `unknown` stay unknown. Nothing here is auto-integrated; the compliance notes in Part 6 apply before any adoption. |

## Purpose

This catalog records the repositories, platforms and services supplied by the operator as reference knowledge for ALO. For each entry it captures: verified identity and metadata, what the tool does, how it relates to existing ALO modules (automation engine, API platform, AI-OS ecosystem, University & Course Intelligence, CRM/admin), and whether it is already deployed, recommended for evaluation, reference-only, or excluded.

The catalog answers three questions for any ALO contributor or agent:

1. What is this tool and how mature is it (stars, license, language, activity)?
2. Does ALO already use it, and where?
3. If not yet used, what problem of ours would it solve, and under which guardrails?

---

## Part 1 — Snapshot of all 16 entries

Verified via GitHub REST API and live pages on 2026-11-28. Star counts are point-in-time and will drift; the catalog records the snapshot date.

| # | Entry | Category | Language | License | Stars | Status in ALO |
|---|---|---|---|---|---|---|
| 1 | Monid (monid.ai + monid-ai/monid) | Agent tool marketplace | TypeScript | MIT | 5,691 | Evaluate |
| 2 | NYLLON-SOFTWARE/SignuDoc | E-signature platform | TypeScript | MIT | 3,368 | Evaluate |
| 3 | FloppyData Cloud Browser | Cloud browser / proxy infra | SaaS | Commercial | n/a | Evaluate (guardrails) |
| 4 | BerriAI/litellm | LLM gateway | Python | Other (NOASSERTION) | 64,026 | **Deployed (AI-OS)** |
| 5 | nocobase/nocobase | No-code business platform | TypeScript | Other (NOASSERTION) | 25,035 | **Deployed (AI-OS)** |
| 6 | temporalio/temporal | Durable workflow engine | Go | MIT | 24,527 | **Deployed (AI-OS)** |
| 7 | activepieces/activepieces | Workflow automation + MCP | TypeScript | Other (NOASSERTION) | 25,756 | **Deployed (AI-OS)** |
| 8 | directus/directus | Data platform / instant APIs | TypeScript | Other (NOASSERTION) | 38,716 | **Deployed (AI-OS)** |
| 9 | Aider-AI/aider | AI pair programming CLI | Python | Apache-2.0 | 50,287 | Reference |
| 10 | LibreChat-AI/LibreChat | Multi-provider AI chat UI | TypeScript | MIT | 47,585 | **Deployed (AI-OS)** |
| 11 | open-webui/open-webui | Self-hosted AI interface | Svelte | Other (NOASSERTION) | 159,688 | **Deployed (AI-OS)** |
| 12 | YouBTech01 (GitHub profile) | Individual developer profile | Mixed | Mixed (per repo) | ≤52 per repo | Watchlist only |
| 13 | vllm-project/vllm | LLM inference & serving | Python | Apache-2.0 | 97,707 | Evaluate |
| 14 | ripienaar/free-for-dev | Free-tier resource list | HTML | Not specified | 143,850 | Reference |
| 15 | Postman (postman.com) | API platform | SaaS | Commercial | n/a | Reference |
| 16 | Org URLs (BerriAI / nocobase / temporalio / directus / Aider-AI / open-webui orgs) | — | — | — | — | Covered by entries 4–11 |

Note on #16: the operator supplied six GitHub *organization* URLs (BerriAI, nocobase, temporalio, directus, Aider-AI, open-webui). Each organization's primary, canonical repository is cataloged as its own entry above; nothing of substance on those org pages falls outside those entries.

---

## Part 2 — Already deployed in the ALO AI-OS stack

Eight product services from the supplied URLs **already run** in `deploy/ai-os/docker-compose.ai-os.yml` (seven delivered in PR #105; Rocket.Chat added in wave 2 as the free self-hosted chat implementation). The catalog therefore treats them as first-party ALO infrastructure, not as new candidates. Image pins as of the compose file:

| Service | Compose image | Verified upstream metadata (2026-11-28) |
|---|---|---|
| LiteLLM gateway | `ghcr.io/berriai/litellm:main-stable` | 64,026 stars; Python + Rust core; "Call 100+ LLM APIs in OpenAI (or native) format with cost tracking, guardrails, load balancing, and logging" |
| LibreChat | `ghcr.io/danny-avila/librechat:latest` | 47,585 stars; TypeScript, MIT; Agents, MCP, Skills, multi-provider switching, multi-user auth, self-hosted |
| Open WebUI | `ghcr.io/open-webui/open-webui:main` | 159,688 stars; Svelte; supports Ollama/OpenAI APIs; RAG and MCP topics |
| Activepieces | `ghcr.io/activepieces/activepieces:latest` | 25,756 stars; TypeScript; AI agents & MCPs & workflow automation; ~400 MCP servers; positions itself as an n8n alternative |
| Temporal | `temporalio/auto-setup:1.25.2` | 24,527 stars; Go, MIT; durable execution, workflow orchestration, distributed cron |
| Directus | `directus/directus:11` | 38,716 stars; TypeScript; turns a DB into a headless CMS / admin panels / instant APIs with auth |
| NocoBase | `nocobase/nocobase:latest` | 25,035 stars; TypeScript; no-code platform for business systems with AI; agents write code, platform provides governance; topics include CRM and workflow engine |
| Rocket.Chat | `registry.rocket.chat/rocketchat/rocket.chat:9.0.0` (+ `mongo:7` replica set) | 46,584 stars; TypeScript; MIT core + separately licensed `ee/` directory; latest stable release 9.0.0 (2026-11-10); staff chat, DMs, live-chat widget — deployed as the **free self-hosted chat implementation** (see Part 8.4) |

Operational consequence: upstream metadata above is refreshed when a stack upgrade is planned; the compose pins are the source of truth for what actually runs.

---

## Part 3 — New reference entries (not yet deployed)

### 3.1 Monid — agent tool marketplace (`monid.ai/tools`, `monid-ai/monid`)

- **What it is**: "OpenRouter for agent tools". monid.ai exposes 4,282 tools and APIs behind a single integration; agents discover, compare and purchase tools at runtime with live metered billing against one balance, replacing per-vendor portals and subscriptions. Category coverage: Social Media, Lead Gen, Search & SEO, News, E-commerce, Travel, Crypto & DeFi, Finance, Gen AI, Compute & Storage, Email & Communication, Phone & Messaging, Web Tools, Data, Scrapers.
- **Repo metadata**: TypeScript, MIT, 5,691 stars, topics `ai-agents`, `developer-tools`.
- **ALO relevance**: the runtime tool-discovery + metered-billing model is directly relevant to ALO's API platform and the agent layer of the AI-OS. Candidate use: an optional marketplace provider so ALO agents can reach long-tail capabilities (scrapers, news, lead-gen data) without ALO building each connector.
- **Guardrails**: tool consumption creates external spend; any integration goes through ALO's existing API-platform cost-tracking patterns (the same discipline LiteLLM applies to LLM spend). License is MIT — clean to reference or fork patterns from.

### 3.2 SignuDoc — open-source document signature (`NYLLON-SOFTWARE/SignuDoc`)

- **Repo metadata**: TypeScript, MIT, 3,368 stars, active (pushed 2026-11-27). Description: "Open-source document signature platform. Not affiliated with DocuSign."
- **ALO relevance**: admissions and enrollment workflows involve signature-bearing documents (enrollment agreements, consent forms, higher-study application documents). A self-hosted MIT e-signature platform is the natural evaluation candidate for that need, replacing any manual print-sign-scan loop.
- **Guardrails**: evaluate against ALO's document-retention and audit-trail requirements before adoption; e-sign legal validity depends on jurisdiction and must be assessed, not assumed.

### 3.3 FloppyData Cloud Browser (`floppydata.com/cloud-browser/`)

- **What it is**: a Chrome browser running on Floppydata's servers, aimed at web scraping, AI agents and automation. Sessions start via one request, are reusable as presets, and work with Puppeteer/Playwright/Python by swapping `launch()` for `connect()`. Built-in rotating proxies (residential, mobile, datacenter), configurable country/OS, anti-detect "human-like" fingerprints. Pricing: sessions free, pay per proxy-GB of traffic, no idle charges; 60-second demo without signup.
- **ALO relevance**: the University & Course Intelligence collector (PR #106) targets JavaScript-rendered public pages where plain HTTP fetches fail. A remote-browser session is the standard pattern for that problem.
- **Guardrails — mandatory**: ALO's intelligence pipeline keeps its L1/L2/L3 source-hierarchy and robots.txt compliance rules as non-negotiable. Cloud browsing may only be used for **public** pages, never to bypass authentication, paywalls or access controls, and never for personal-data harvesting. Anti-detect features are noted as vendor capability but are **out of scope** for ALO use; if a source forbids automated access in robots.txt or terms, ALO does not collect from it, full stop. Any procurement review must confirm these boundaries in writing.

### 3.4 Aider — AI pair programming in the terminal (`Aider-AI/aider`)

- **Repo metadata**: Python, Apache-2.0, 50,287 stars, homepage aider.chat.
- **What it is**: terminal-based AI pair programming; edits code directly in a local git checkout, produces conventional commits, maps large repos to give the model context.
- **ALO relevance**: reference for agentic engineering practice — repo-map construction, git-native edit workflows and commit conventions. ALO's own autonomous-factory ambitions (see `docs/AUTONOMOUS_SOFTWARE_FACTORY.md`) can borrow these patterns conceptually. Apache-2.0 license permits pattern reuse with attribution.

### 3.5 vLLM — LLM inference and serving (`vllm-project/vllm`)

- **Repo metadata**: Python, Apache-2.0, 97,707 stars, homepage vllm.ai. "A high-throughput and memory-efficient inference and serving engine for LLMs."
- **ALO relevance**: the AI-OS stack currently consumes hosted LLM APIs through LiteLLM. vLLM is the standard self-hosting path if ALO ever serves open-weight models on its own GPU capacity (cost control, data residency for sensitive student data, or provider-outage resilience). Note: LiteLLM's provider matrix already lists vLLM as a routeable backend, so adoption later is a gateway config change, not a rewrite.
- **Guardrails**: requires GPU infrastructure and an ops owner; not a near-term deploy decision.

### 3.6 Postman (`postman.com`)

- **What it is**: the widely used commercial platform for API development — collections, environments, automated testing, mock servers, documentation and team workspaces.
- **ALO relevance**: ALO's public API platform (delivered in PR #105) needs an API-definition-first workflow. Postman (or an equivalent OpenAPI-native toolchain) is the reference for how collections/specs are authored, shared and regression-tested. Live page verification was cut short by a fetch limit this pass; treat capabilities above as general knowledge and confirm specifics against the site before any procurement decision (marked unknown: current tier names and MCP-tooling details).
- **Guardrails**: commercial SaaS; no license issue for using the tool, but ALO's API contract of record must live in version-controlled OpenAPI files in this repo, not only inside Postman workspaces.

### 3.7 free-for-dev — free-tier resource list (`ripienaar/free-for-dev`)

- **Repo metadata**: 143,850 stars, HTML, homepage free-for.dev, topics `awesome-list`, `free-for-developers`. "A list of SaaS, PaaS and IaaS offerings that have free tiers of interest to devops and infradev." License not detected by the API (unknown) — list content is reference material, not code to embed.
- **ALO relevance**: when standing up cheap infrastructure for scheduled jobs (e.g., the weekly intelligence refresh cron, monitoring, email), this is the canonical index of free tiers. Reference-only; ALO never copies list content into its docs (rule: no third-party content duplication).

---

## Part 4 — Individual developer profile (watchlist)

### 4.1 YouBTech01 (`github.com/YouBTech01`)

- **Profile**: self-described Android app and website developer; 33 public repositories; currently building something called "Track Back" (details unknown).
- **Popular repos observed**: `HTML-Ai-Chatbot` (HTML, 52★), `WiFi-Password-Cracker-Pro` (TeX, 27★), `E-commerce-App-with-AI` (JavaScript, 19★), `Shopify-Dawn-inspired-clothing-e-commerce-platform` (JavaScript, 19★), `AI-Email-Automation-Agent` (Python, 14★).
- **ALO status**: watchlist only. These are small personal projects; no formal integration value was identified this pass.
- **Compliance flag**: `WiFi-Password-Cracker-Pro` is a security-offensive tool. It is recorded here for completeness because the operator asked for the full profile, but it is **excluded from any ALO integration, learning or linkage** — it conflicts with ALO's security and legal-usage policies. Per ALO rules, unknown details stay unknown and are not speculated about.

---

## Part 5 — ALO module mapping

| ALO module / concern | Relevant catalog entries | Relationship |
|---|---|---|
| Automation engine (PR #105) | Temporal, Activepieces | Deployed. Temporal = durable execution backbone; Activepieces = connector/MCP library pattern |
| API platform (PR #105) | Postman, LiteLLM, Monid | Postman: API-definition workflow reference; LiteLLM: deployed gateway; Monid: candidate runtime tool marketplace |
| AI-OS ecosystem (PR #105) | LibreChat, Open WebUI, Directus, NocoBase, Aider, vLLM | First four deployed in compose; Aider and vLLM are pattern/option references |
| University & Course Intelligence (PR #106) | FloppyData Cloud Browser, free-for-dev | Remote-browser pattern for JS-rendered public pages (strict guardrails); free-tier index for scheduled-job infra |
| CRM / admin surfaces (PR #105) | Directus, NocoBase | Deployed as admin/data-platform options in the AI-OS stack |
| Admissions & enrollment documents | SignuDoc | Candidate self-hosted e-signature evaluation |
| Staff & student chat (wave 2) | Rocket.Chat (deployed), MirrorFly (commercial alt) | Chat implemented free in the AI-OS stack; MirrorFly documented as the commercial one-time-license alternative |
| AI call center / telephony (wave 2, future module) | rasonyang stack, call-gpt, amulchapla, 10x-Tool-Calls | Open-source voice-agent and SIP/FreeSWITCH building blocks; reference patterns, not deployed (needs SIP trunk + telephony ops) |
| Deployment alternatives (wave 2) | CapRover, Dokku | Host-level PaaS for one-click app deployment; Dokku already referenced in `deploy/ai-os/README.md` §7 |
| Frontend builders (wave 2) | GrapesJS | Open-source drag-and-drop page-builder library; candidate for ALO visual editing surfaces |
| Coding agents (wave 2) | SWE-agent, Aider, OmniCopilot, meta/astryx, free-claude-code | Agentic engineering references for the autonomous-factory track |
| Media & content (wave 2) | InfiniteTalk, OpenMausBot, lastbook | Talking-video generation, chat-bot and reading/content references |
| Engineering practice | Aider, Postman, free-for-dev | Coding-agent patterns, API testing workflow, infra cost control |

---

## Part 6 — Compliance and license guardrails

1. **Reference, not copy.** No text, imagery or content is lifted from any listed project or site into ALO. Only architectural patterns and integration options are consumed.
2. **License awareness before code adoption.** MIT/Apache-2.0 entries (monid, SignuDoc, Temporal, LibreChat, Aider, vLLM, Dokku, SWE-agent, ai-native-callcenter, InfiniteTalk, OmniCopilot, meta/astryx, OpenMausBot, lastbook) are clean starting points. Entries whose GitHub API license field reads `NOASSERTION` (litellm, nocobase, activepieces, directus, open-webui, caprover, grapesjs, free-claude-code, 10x-Tool-Calls) need a targeted license review of the upstream LICENSE file before any code or substantial pattern adoption. Rocket.Chat and Mattermost use hybrid licenses (MIT/AGPL core + separately licensed enterprise directories); Rocket.Chat community edition is deployed as an isolated network service with no code sharing. `free-for-dev` license: unknown — treat as reference material only.
3. **Collection ethics.** Any use of cloud-browser tooling stays inside ALO's existing intelligence-gathering policy: public data only, robots.txt respected, no auth/paywall bypass, no personal-data harvesting, L1/L2/L3 source hierarchy unchanged.
4. **Excluded content.** `WiFi-Password-Cracker-Pro` (YouBTech01 profile) is excluded from all ALO work on security and legal grounds.
5. **Spend control.** Marketplace/billing-based services (Monid, FloppyData, Postman paid tiers, outstand.so paid tiers, jarvis.institute, MirrorFly one-time license) require cost tracking through ALO's API-platform conventions and explicit budget approval before production use. Where the operator's rule "must add all free systems" applies, the free open-source equivalent is implemented first and the commercial product is documented as a paid alternative only.
6. **Naming implies no endorsement.** `Alishahryar1/free-claude-code` references Anthropic's Claude by name; before any evaluation, verify its actual function, the provider's terms of service and its `NOASSERTION` license. The same caution applies to any tool that wraps another vendor's product name.

---

## Part 7 — Verification record

- GitHub metadata (stars, license, language, descriptions, dates): GitHub REST API, fetched 2026-11-28 (v1) and 2026-11-28 (wave 2: 17 repos + rasonyang profile listing + `topic:jarvis-ai` search, top 15).
- `monid.ai/tools`, `floppydata.com/cloud-browser/`, `github.com/YouBTech01`: live pages fetched 2026-11-28.
- `postman.com`: fetch limit reached this pass; entry is general knowledge, marked unknown where specific (tiers, current features). Re-verify before procurement.
- Wave 2 live pages: `mirrorfly.com/self-hosted-chat-solution.php`, `outstand.so`, `jarvis.institute` fetched 2026-11-28.
- Wave 2 license checks: LICENSE files of `RocketChat/Rocket.Chat`, `mattermost/mattermost`, `chatwoot/chatwoot` read via GitHub API 2026-11-28 (hybrid core + enterprise-dir licenses).
- Docker image pins: `registry.rocket.chat/rocketchat/rocket.chat:9.0.0` confirmed present on Docker Hub 2026-11-28 (pushed 2026-11-10); latest stable GitHub release 9.0.0 (2026-11-10).
- Compose image pins: `deploy/ai-os/docker-compose.ai-os.yml` on `main` @ `5169630` (v1); wave-2 additions verified against this file.
- Star counts are snapshots and drift daily; re-verify before citing externally.

---

## Part 8 — Wave 2: second operator URL batch (verified 2026-11-28)

The operator supplied a second batch of URLs: the GitHub `jarvis-ai` topic, MirrorFly's self-hosted chat page, outstand.so, jarvis.institute, PaaS platforms (CapRover, Dokku), GrapesJS, SWE-agent, an AI-call-center cluster, and nine individual repositories. All GitHub entries were verified via the REST API on 2026-11-28; the three websites were fetched live.

### 8.1 Snapshot table

| # | Entry | Category | Language | License | Stars | Status in ALO |
|---|---|---|---|---|---|---|
| W1 | caprover/caprover | Self-hosted PaaS (one-click apps) | TypeScript | NOASSERTION (README historically Apache-2.0) | 15,210 | Reference (host layer, not a compose service) |
| W2 | dokku/dokku | Self-hosted mini-Heroku PaaS | Shell | MIT | 32,241 | Reference (already used in deploy/ai-os README §7) |
| W3 | GrapesJS/grapesjs | Drag-and-drop web page builder framework | TypeScript | NOASSERTION (historically BSD-3-Clause) | 26,437 | Reference |
| W4 | SWE-agent/SWE-agent | Autonomous coding agent (terminal) | Python | MIT | 20,883 | Reference |
| W5 | rasonyang/ai-native-callcenter | AI-native call center (SIP/FreeSWITCH + AI) | Go | Apache-2.0 | 842 | Reference (active 2026-11-26) |
| W6 | rasonyang ecosystem (freesbc 416★, cascade-realtime-gateway, web-sip-phone, sip-to-ai, talkover, tts-server, stt-server…) | Open VoIP/RTC + AI telephony building blocks | Go/Python | Apache-2.0 (MIT/CC0 for some lists) | ≤416 per repo | Reference |
| W7 | twilio-labs/call-gpt | Voice assistant (Twilio + OpenAI) | JavaScript | MIT | 497 | Reference (stale — last push 2024-12-13) |
| W8 | amulchapla/AI-Powered-Call-Center-Intelligence | Call-center transcript analytics | JavaScript | MIT | 268 | Reference (stale — last push 2023-06-29) |
| W9 | perrypixel/10x-Tool-Calls | Agent tool-call utilities | Python | NOASSERTION | 852 | Reference (license review required) |
| W10 | MeiGen-AI/InfiniteTalk | Audio-driven talking-video generation | Python | Apache-2.0 | 8,488 | Reference (GPU-heavy) |
| W11 | cheaper-inference/OmniCopilot | AI copilot tooling | TypeScript | MIT | 209 | Reference (active) |
| W12 | Alishahryar1/free-claude-code | Claude-adjacent CLI tooling | Python | NOASSERTION | 73,510 | Reference — verify function/ToS/license before any use |
| W13 | meta/astryx | Meta open-source project | TypeScript | MIT | 33,504 | Reference (active) |
| W14 | DistinctZA/patina | Small web app (Svelte) | Svelte | MIT | 8 | Watchlist (distinct from microsoft/patina — different project) |
| W15 | milind-soni/OpenMausBot | Bot platform | TypeScript | Apache-2.0 | 28,507 | Reference (active) |
| W16 | Immortal-Protocols/lastbook | Content/reading tool | Python | MIT | 3,099 | Reference |
| W17 | monid-ai/monid | Agent tool marketplace | TypeScript | MIT | 5,691 | Wave-1 entry 1 re-verified |
| W18 | NYLLON-SOFTWARE/SignuDoc | E-signature platform | TypeScript | MIT | 3,393 | Wave-1 entry 2 re-verified (stars updated) |
| W19 | mirrorfly.com (+ /self-hosted-chat-solution.php) | Commercial self-hosted chat SDK | SaaS | Commercial (one-time license) | n/a | Not free — free path implemented instead (see 8.4) |
| W20 | outstand.so | Unified social-media posting API (12 platforms, MCP) | SaaS | Commercial (free tier 3,000 posts/mo; $19 / $129 plans) | n/a | Evaluate only with budget approval |
| W21 | jarvis.institute | Commercial Windows AI assistant | SaaS (closed source) | Commercial ($9.99 one-time) | n/a | Reference — free alternatives are the topic repos below |

### 8.2 The operator's question: "is the jarvis-ai topic free with self-host?"

**Answer: yes — almost entirely.** The `jarvis-ai` topic contains 240 repositories. The top 15 by stars are overwhelmingly MIT-licensed personal AI assistants that run locally/self-hosted by design (they are desktop apps and Python programs — the user's own machine is the host):

| Repo | Stars | License | Language |
|---|---|---|---|
| GauravSingh9356/J.A.R.V.I.S | 1,506 | MIT | Python |
| kishanrajput23/Jarvis-Desktop-Voice-Assistant | 1,099 | MIT | Python |
| blogminhquy/javis-os | 931 | MIT | Python |
| akshayaggarwal99/jarvis-ai-assistant | 677 | MIT | TypeScript |
| gia-guar/JARVIS-ChatGPT | 469 | MIT | Python |
| BolisettySujith/J.A.R.V.I.S | 393 | MIT | Python |
| FlowShift-in/IRIS-AI | 233 | NOASSERTION | TypeScript |
| codewithbro95/J.A.R.V.I.S | 189 | MIT | Jupyter |
| AbuZar-Ansarii/Ultron | 171 | NOASSERTION | Python |
| Likhithsai2580/JARVIS | 153 | MIT | Python |
| AbuZar-Ansarii/Jarvis | 150 | MIT | Dart |
| Aryan-0001/Jarvis-AI | 149 | MIT | Dart |
| Avinashb722/jarvis-ai-assistant | 146 | MIT | Python |
| KKshitiz/J.A.R.V.I.S | 127 | MIT | Python |
| aerele/jarvis | 112 | AGPL-3.0 | Python |

Caveats: 12 of the top 15 are MIT (free for any use), 1 is AGPL-3.0 (copyleft — fine as a separate service, not for embedding), 2 are NOASSERTION (license review needed). Most are hobby-grade projects with uneven maintenance; the recurring cost is not the software but the LLM API keys unless run fully local via Ollama/llama.cpp. `jarvis.institute` (the commercial product the operator also linked) is the closed-source exception: $9.99 one-time Windows app, no public repo. ALO treats the topic as pattern reference for its own assistant surface — no third-party assistant code is embedded.

### 8.3 MirrorFly — what it is and what implementing it would take

Verified from `mirrorfly.com/self-hosted-chat-solution.php` (2026-11-28): MirrorFly is a **commercial** self-hosted chat solution — "one time license cost", full source-code access granted to paying customers, SDKs for ~11 platforms, deployment on customer premises/cloud, contact-sales pricing. It is **not free and not open source**: there is no public repository, no free tier, and the page does not publish prices.

If MirrorFly were procured, the implementation path would be: (1) contact sales and sign the one-time license; (2) provision a dedicated server per their spec; (3) install their self-hosted package; (4) integrate their SDK into ALO frontends. Nothing of that can start without budget approval, and ALO rules forbid copying any MirrorFly content or designs.

### 8.4 The decision taken (operator rule: "must be add all free system")

Because the operator requires free systems, ALO implemented the **free, open-source equivalent** of the MirrorFly use case instead: **Rocket.Chat community edition** (MIT core, 46,584★, latest stable 9.0.0) added to the AI-OS compose stack as the self-hosted chat platform — staff channels/DMs, live-chat widget for the main site, MongoDB replica set for durability, isolated on the internal `ai-os` network behind nginx at `/rocketchat`. A future MirrorFly migration (only if ever procured) would replace one isolated service; no ALO application code depends on the chat choice.

Alternatives evaluated via LICENSE files (2026-11-28): Mattermost (AGPL/MIT hybrid, 39,727★) and Chatwoot (MIT core + enterprise dir, 40,684★ — a support-inbox/live-chat alternative for a later phase). Rocket.Chat was chosen as the closest full-chat-platform fit.

### 8.5 AI call-center cluster

The operator collected several AI-call projects. Assessment: `rasonyang/ai-native-callcenter` (Go, Apache-2.0, active) is the strongest reference — a full open stack around FreeSWITCH/SIP with AI agents, complemented by the same author's `freesbc`, `web-sip-phone`, `sip-to-ai`, `tts-server` and `stt-server`. `twilio-labs/call-gpt` (MIT) and `amulchapla/AI-Powered-Call-Center-Intelligence` (MIT) are older, well-known patterns but stale (2024/2023). `perrypixel/10x-Tool-Calls` (NOASSERTION) needs license review. None are deployed: a call-center module needs SIP trunk procurement, telephony ops ownership and a compliance pass (call recording law in the operating jurisdictions) — all marked unknown until the operator provides them.

### 8.6 PaaS, frontend builders, coding agents and other repos

- **CapRover / Dokku**: host-level PaaS platforms for one-click self-hosted app deployment. They are not compose services (both manage the Docker host themselves); they are deployment alternatives for ALO's own VPS layer. Dokku is already referenced in `deploy/ai-os/README.md` §7 for sidecar services. CapRover's API license field is NOASSERTION — review before adoption.
- **GrapesJS**: open-source drag-and-drop page builder framework (26,437★). Candidate library for a visual editing surface in ALO frontends; license field NOASSERTION (historically BSD-3-Clause) — review before embedding.
- **SWE-agent** (MIT, 20,883★), **OmniCopilot** (MIT), **meta/astryx** (MIT), **free-claude-code** (NOASSERTION — verify function and ToS first): coding-agent references for ALO's autonomous-factory track, alongside Aider (wave 1).
- **InfiniteTalk** (Apache-2.0): audio-driven talking-video generation — relevant to ALO content/avatar ambitions; GPU-heavy, not a near-term deploy.
- **OpenMausBot** (Apache-2.0, 28,507★), **lastbook** (MIT), **DistinctZA/patina** (MIT, 8★ — watchlist): recorded for completeness; no integration value identified this pass.
- **outstand.so**: commercial unified social-posting API (12 platforms, MCP integration for AI agents; free tier 3,000 posts/mo). Relevant only if ALO adds social publishing — then it competes with free self-hosted alternatives and stays spend-controlled.
