# ALO Reference Tools & Agent Knowledge Catalog

| | |
|---|---|
| Status | Reference catalog (v1) |
| Created | 2026-11-28 |
| Source | Operator-provided list of 16 URLs (verified individually) |
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

Seven of the supplied URLs correspond to services that **already run** in `deploy/ai-os/docker-compose.ai-os.yml` (delivered in PR #105). The catalog therefore treats them as first-party ALO infrastructure, not as new candidates. Image pins as of the compose file:

| Service | Compose image | Verified upstream metadata (2026-11-28) |
|---|---|---|
| LiteLLM gateway | `ghcr.io/berriai/litellm:main-stable` | 64,026 stars; Python + Rust core; "Call 100+ LLM APIs in OpenAI (or native) format with cost tracking, guardrails, load balancing, and logging" |
| LibreChat | `ghcr.io/danny-avila/librechat:latest` | 47,585 stars; TypeScript, MIT; Agents, MCP, Skills, multi-provider switching, multi-user auth, self-hosted |
| Open WebUI | `ghcr.io/open-webui/open-webui:main` | 159,688 stars; Svelte; supports Ollama/OpenAI APIs; RAG and MCP topics |
| Activepieces | `ghcr.io/activepieces/activepieces:latest` | 25,756 stars; TypeScript; AI agents & MCPs & workflow automation; ~400 MCP servers; positions itself as an n8n alternative |
| Temporal | `temporalio/auto-setup:1.25.2` | 24,527 stars; Go, MIT; durable execution, workflow orchestration, distributed cron |
| Directus | `directus/directus:11` | 38,716 stars; TypeScript; turns a DB into a headless CMS / admin panels / instant APIs with auth |
| NocoBase | `nocobase/nocobase:latest` | 25,035 stars; TypeScript; no-code platform for business systems with AI; agents write code, platform provides governance; topics include CRM and workflow engine |

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
| Engineering practice | Aider, Postman, free-for-dev | Coding-agent patterns, API testing workflow, infra cost control |

---

## Part 6 — Compliance and license guardrails

1. **Reference, not copy.** No text, imagery or content is lifted from any listed project or site into ALO. Only architectural patterns and integration options are consumed.
2. **License awareness before code adoption.** MIT/Apache-2.0 entries (monid, SignuDoc, Temporal, LibreChat, Aider, vLLM) are clean starting points. Entries whose GitHub API license field reads `NOASSERTION` (litellm, nocobase, activepieces, directus, open-webui) need a targeted license review of the upstream LICENSE file before any code or substantial pattern adoption. `free-for-dev` license: unknown — treat as reference material only.
3. **Collection ethics.** Any use of cloud-browser tooling stays inside ALO's existing intelligence-gathering policy: public data only, robots.txt respected, no auth/paywall bypass, no personal-data harvesting, L1/L2/L3 source hierarchy unchanged.
4. **Excluded content.** `WiFi-Password-Cracker-Pro` (YouBTech01 profile) is excluded from all ALO work on security and legal grounds.
5. **Spend control.** Marketplace/billing-based services (Monid, FloppyData, Postman paid tiers) require cost tracking through ALO's API-platform conventions and explicit budget approval before production use.

---

## Part 7 — Verification record

- GitHub metadata (stars, license, language, descriptions, dates): GitHub REST API, fetched 2026-11-28.
- `monid.ai/tools`, `floppydata.com/cloud-browser/`, `github.com/YouBTech01`: live pages fetched 2026-11-28.
- `postman.com`: fetch limit reached this pass; entry is general knowledge, marked unknown where specific (tiers, current features). Re-verify before procurement.
- Compose image pins: `deploy/ai-os/docker-compose.ai-os.yml` on `main` @ `5169630`.
- Star counts are snapshots and drift daily; re-verify before citing externally.
