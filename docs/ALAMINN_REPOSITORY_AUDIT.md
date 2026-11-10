# ALAMINN REPOSITORY AUDIT — Phase 1

> **Mode:** AUDIT-ONLY. Evidence gathered 2026-11-10 via the GitHub REST API
> (`gh api repos/...`, `.../contents/`, `.../readme`, `.../contents/LICENSE`),
> README inspection, root-tree inspection, and license-file verification. README claims
> are **not** treated as proof of implementation; each entry separates *claimed* from
> *verified*.
>
> **Register count note:** the master prompt lists numbered repositories 1–27 and states
> the original list contained Omarchy twice. The unique verified count is therefore
> **27 repositories**, not 28. This discrepancy is logged, not silently "fixed".

## Decision labels

| Label | Meaning |
|---|---|
| **ADAPT** | Reusable, permissively licensed (MIT/Apache-2.0) content or code patterns may be incorporated into Alaminn modules with attribution and normal code review. |
| **REFERENCE** | Architecture/design study only. No source copied. Clean-room re-implementation of ideas is allowed (facts and ideas are not copyrightable; expression is). |
| **ISOLATE** | May run as a **separate, unmodified** service/container reached over an authenticated API. No source incorporation into Alaminn. Modifications to the isolated service may trigger its own copyleft obligations — legal review required before any fork. |
| **REJECT** | Out of scope, unlicensed, or risk/benefit unfavorable. Listed for completeness. |

## License policy applied

- **AGPL-3.0** (OpenViking, siyuan, VoiceStudio, RSSHub): network copyleft. No source
  incorporation into the proprietary Alaminn codebase. ISOLATE only as unmodified
  services, or REFERENCE.
- **Elastic-2.0** (context-mode): free internal use; cannot be offered as a managed
  service where the software is the primary value; no source incorporation without legal
  review. REFERENCE.
- **LGPL-3.0** (PI-Desktop): linking/embedding obligations. REFERENCE.
- **GPL-3.0** (llm_wiki): strong copyleft on incorporation. REFERENCE.
- **MIT / Apache-2.0**: reusable with attribution (Apache requires NOTICE preservation).
- **No license file** (cursor/plugins, studytra, NextStep-Abroad, EducationConsultancyWebsite):
  **all rights reserved by default** — no code reuse in any form.

---

## Summary decision matrix

| # | Repository | License (verified) | Decision | Integration target | Priority |
|---|---|---|---|---|---|
| 1 | [omacom/omarchy](https://github.com/omacom/omarchy) | MIT | **REJECT** | — | — |
| 2 | [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | MIT | **ADAPT** | AgentOS Skills Registry (diagram skill) | P2 |
| 3 | [cursor/plugins](https://github.com/cursor/plugins) | **NONE (no LICENSE file)** | **REFERENCE** | Tool/Skill registry manifest schema | P3 |
| 4 | [AprilNEA/OpenLogi](https://github.com/AprilNEA/OpenLogi) | MIT/Apache-2.0 dual | **REJECT** | — | — |
| 5 | [ruvnet/ruflo](https://github.com/ruvnet/ruflo) | MIT (root; verified) | **REFERENCE** | AgentOS orchestration/memory/MCP patterns | P3 |
| 6 | [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT | **ADAPT (selected skills)** | AgentOS Skills Registry; AgentShield-style checks | P2 |
| 7 | [alsk1992/CloddsBot](https://github.com/alsk1992/CloddsBot) | MIT | **REJECT** | (channel-adapter list = REFERENCE only) | — |
| 8 | [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community) | Apache-2.0 (mirror repo) | **REFERENCE** | Plugin marketplace manifest + review pipeline | P3 |
| 9 | [volcengine/OpenViking](https://github.com/volcengine/OpenViking) | AGPL-3.0 | **REFERENCE / ISOLATE** | Memory OS & Knowledge OS architecture | P3 |
| 10 | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) | MIT | **ADAPT (patterns) / ISOLATE (runtime)** | Memory OS | **P1** |
| 11 | [mksglu/context-mode](https://github.com/mksglu/context-mode) | Elastic-2.0 | **REFERENCE** | AgentOS tool-output economy (clean-room) | P3 |
| 12 | [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) | GPL-3.0 | **REFERENCE** | Knowledge OS ingest/graph/search design | P2 |
| 13 | [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | AGPL-3.0 | **REFERENCE** | Knowledge OS block model / versioning UX | P3 |
| 14 | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | MIT | **ADAPT** | Marketing OS Skills Registry | **P1** |
| 15 | [every-app/open-seo](https://github.com/every-app/open-seo) | MIT | **ADAPT / ISOLATE** | SEO Intelligence module | **P1** |
| 16 | [blader/humanizer](https://github.com/blader/humanizer) | MIT | **ADAPT** | Content Studio quality skill | **P1** |
| 17 | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | MIT | **ISOLATE** | Content Studio video service | P2 |
| 18 | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 | **ADAPT / ISOLATE** | Content Studio video rendering | P2 |
| 19 | [DIYgod/RSSHub](https://github.com/DIYgod/RSSHub) | AGPL-3.0 | **ISOLATE** | Knowledge OS RSS ingestion | P2 |
| 20 | [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) | AGPL-3.0 | **REFERENCE / ISOLATE** | Content Studio voice pipeline | P3 |
| 21 | [Lakr233/vphone-cli](https://github.com/Lakr233/vphone-cli) | MIT | **REJECT** | — | — |
| 22 | [public-apis/public-apis](https://github.com/public-apis/public-apis) | MIT | **REFERENCE** | Integrations discovery catalog | P3 |
| 23 | [vastsa/PI-Desktop](https://github.com/vastsa/PI-Desktop) | LGPL-3.0 | **REFERENCE** | AgentOS workspace/plugin architecture | P3 |
| 24 | [fmtlib/fmt](https://github.com/fmtlib/fmt) | MIT | **REJECT** | — | — |
| 25 | [nabaleducation/EducationConsultancyWebsite](https://github.com/nabaleducation/EducationConsultancyWebsite) | **NONE (Figma bundle)** | **REJECT** (design glance only) | — | — |
| 26 | [arupdas0825/studytra](https://github.com/arupdas0825/studytra) | **NONE** (README badge claims MIT; no LICENSE file) | **REFERENCE (UX only)** | Higher Study UX taxonomy | P3 |
| 27 | [Bhawana0218/NextStep-Abroad](https://github.com/Bhawana0218/NextStep-Abroad) | **NONE** | **REJECT** | — | — |

---

## Detailed entries

### 1. omacom/omarchy — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/omacom/omarchy |
| Purpose | Omarchy: a desktop Linux distribution ("beautiful, fun & agentic") by DHH. Shell/Lua configuration, themes, hotkeys, desktop apps. |
| License | **MIT** (LICENSE present; GitHub API agrees) |
| Framework | Shell, Lua (Neovim), Arch Linux packaging |
| Dependencies | System packages (pacman); no npm/Python manifest relevant to Alaminn |
| Architecture | `bin/`, `shell/`, `config/`, `applications/`, `install/`, `migrations/` (OS-level), `manual/` (47-chapter docs) |
| Security | OS-level hardening docs; not applicable to a web app |
| Compatibility | **None.** Operating-system project; zero overlap with a Next.js/Prisma web platform |
| Reusable components | None (theming concepts only) |
| Integration method | — |
| Reason | Hardware/OS scope. The "agentic OS" branding is metaphorical for a desktop distro; nothing here can be imported into a web application. Listed in the register only to close the audit loop. |

### 2. cathrynlavery/diagram-design — ADAPT

| Field | Verified information |
|---|---|
| Repository | https://github.com/cathrynlavery/diagram-design |
| Purpose | Agent Skill that renders **branded, self-contained HTML+SVG diagrams** (45 diagram types: architecture, sequence, quadrant, etc.) with import from drawio/mermaid/excalidraw/PlantUML and PNG/SVG export. |
| License | **MIT** (LICENSE + badge; API agrees) |
| Framework | Agent Skills spec package: `skills/`, `prompts/`, `commands/`, `scripts/`, `assets/`; docs site generation (HTML) |
| Dependencies | None required at runtime (skill consumed by coding agents); Node for tooling |
| Architecture | Skill markdown + prompt templates + validation scripts; `.claude-plugin/` manifest; CI-validated |
| Security | `PRIVACY.md` documents network behavior (onboarding can fetch a target site's palette — SSRF caution when reimplemented server-side) |
| Compatibility | High — content-style skills translate directly into Alaminn's AI gateway prompt/skill registry |
| Reusable components | `skills/`, `prompts/`, `commands/` (diagram type definitions, brand-onboarding flow) |
| Integration method | **Library/content**: port skill definitions into the AgentOS Skills Registry (server-side rendering must add URL allow-listing) |
| Reason | MIT, actively maintained (pushed 2026-11-09, 66k★), directly serves the Content Studio / agent deliverables. Its "brand palette onboarding" concept maps to Alaminn's Brand Templates requirement. |

### 3. cursor/plugins — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/cursor/plugins |
| Purpose | Official Cursor plugin marketplace collection: ~40 standalone agent plugins (teaching, continual-learning, thermos code review, ralph-loop, orchestrate, advisor, cursor-sdk, plus `third_party/` MCP connectors for Google/HubSpot/Salesforce/Semrush/Ahrefs/…) |
| License | **NONE** — no LICENSE file in the repository root (GitHub API `license: null`). Individual plugin directories may carry their own terms; the aggregate has no verified license. |
| Framework | TypeScript; `.cursor-plugin/plugin.json` per plugin; agent-skills markdown |
| Dependencies | Per-plugin; MCP servers over stdio/HTTP |
| Architecture | Flat directory-per-plugin; marketplace manifest convention; `schemas/` |
| Security | Third-party connectors handle OAuth credentials; each plugin trusts its MCP endpoint |
| Compatibility | Conceptual only |
| Reusable components | **None legally reusable.** Patterns observable: plugin manifest schema, orchestrate's planner/worker/verifier fan-out, thermos' review rubric |
| Integration method | — (study only) |
| Reason | No license ⇒ no copying. Its manifest/orchestration *shapes* are worth mirroring in the Alaminn Tool Registry design (clean-room). The `third_party/` list also validates Alaminn's existing integrations registry choices (Semrush/Ahrefs/etc. are API adapters, not vendored code). |

### 4. AprilNEA/OpenLogi — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/AprilNEA/OpenLogi |
| Purpose | Native, local-first alternative to Logitech Options+: Rust drivers for Logitech mice/keyboards/webcams over HID++ and UVC (macOS/Linux/Windows). |
| License | **MIT / Apache-2.0 dual** (`LICENSE-MIT`, `LICENSE-APACHE`) |
| Framework | Rust (Cargo workspace, `crates/`), Nix/devenv tooling |
| Dependencies | `Cargo.toml` workspace; HID/USB libraries |
| Architecture | Rust crates + packaging per OS; `design/` mockups |
| Security | Hardware-access tooling; device-level attack surface irrelevant here |
| Compatibility | **None.** Native hardware utility |
| Reusable components | None |
| Integration method | — |
| Reason | Out of scope: no web, no AI, no marketing/communication overlap. |

### 5. ruvnet/ruflo — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/ruvnet/ruflo |
| Purpose | "Agent meta-harness" around Claude Code/Codex: coordinated agent swarms, self-learning memory (local vector retrieval + contrastive updates), federated comms, MCP server, security guardrails. npm package `claude-flow` v3.75.x. |
| License | **MIT** at root (LICENSE file content verified: "MIT License Copyright (c) 2024-2026 ruvnet"). Note: monorepo contains `plugins/`, `crates/` (symlink), `chatgpt-plugin/`, vendored `third_party`-like dirs — **per-component license sweep required before any code-level reuse**. |
| Framework | TypeScript/Node ≥20 (`package.json` engines), npm workspaces; Rust components via `Cargo.toml` |
| Dependencies | Self-owned `@claude-flow/*` packages (cli-core, mcp, neural, security, plugin-agent-federation) |
| Architecture | `bin/` CLI (`npx ruflo init`), `plugins/` (swarm, rag-memory, intelligence, security-audit), MCP server, hooks, memory store (`agentdb.rvf`), console UI |
| Security | Security-audit plugin exists; federation claims "no data leaking" (unverified marketing). README contains **explicitly illustrative** download counters — treat all README metrics as marketing, not evidence. |
| Compatibility | Architectural only (harness tooling, not a web library) |
| Reusable components | Patterns: swarm coordination topology, trajectory-learning loop, MCP tool contracts, memory federation model (study `docs/`, `plugins/ruflo-swarm/`, `plugins/ruflo-rag-memory/`) |
| Integration method | — (study only) |
| Reason | MIT root is permissive, but the deliverable for Alaminn is *design vocabulary* (orchestrator/worker/verifier, memory federation) for the AgentOS collaboration + Memory OS specs. Code-level reuse deferred; if ever copied, run per-component license + provenance review first (the repo lineage includes claude-flow; docs contain unverifiable claims). |

### 6. affaan-m/ECC — ADAPT (selected skills)

| Field | Verified information |
|---|---|
| Repository | https://github.com/affaan-m/ECC |
| Purpose | "Agent harness operating system": 71 specialized agents, 314 skills, 98 command shims, hooks, rules, memory, continuous learning, AgentShield security scanning; multi-harness support (Claude Code native, adapters for Cursor/Gemini/Copilot/etc.). |
| License | **MIT** (LICENSE + badge; API agrees) |
| Framework | JavaScript/TypeScript; `.claude-plugin/`, `.mcp.json`; multi-tool config dirs (`.codex`, `.cursor`, `.gemini`, …) |
| Dependencies | npm (`ecc-universal`), per-skill tooling |
| Architecture | Skill/agent/command registries as directories of markdown + scripts; validation via CI + markdownlint; `.gitleaksignore` hygiene |
| Security | AgentShield scanning concept; secrets hygiene present (gitleaks). Skills execute via host agents — permission boundaries must be re-cut for server-side use |
| Compatibility | High at **content level** (skill markdown), low at runtime level (built for CLI harnesses) |
| Reusable components | Selected skill definitions (TDD, research, security, docs, frontend, ops) and the skill-taxonomy structure — MIT permits adaptation with attribution |
| Integration method | **Library/content**: curated skill imports into the Alaminn Skills Registry (server-side), each re-reviewed for tool-permission boundaries |
| Reason | MIT, huge curated skill corpus aligned with the Agent Skills spec. Uncontrolled bulk import would bloat the registry and import unvetted tool calls — hence *selected* adaptation behind Alaminn's permission model, not wholesale ingestion. |

### 7. alsk1992/CloddsBot — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/alsk1992/CloddsBot |
| Purpose | AI trading terminal for prediction markets, crypto spot/perps with leverage, token launches (Pump.fun et al.), Bittensor mining; 21 messaging-platform channels; Solana/EVM wallet integration. |
| License | MIT (LICENSE; API agrees) |
| Framework | TypeScript/Node ≥22, Rust components (`rust/`), Docker |
| Dependencies | Exchange SDKs, wallet libs, messaging adapters |
| Architecture | `src/` agent with 118+ trading strategies, channels layer, webchat, forum |
| Security | **High-risk domain**: private-key handling, financial transactions, leverage trading, memecoin token launch (README publishes a Solana CA). Messaging-channel breadth is the only relevant part and is inseparable from wallet code. |
| Compatibility | Domain mismatch with Alaminn's mission |
| Reusable components | The *idea* of a normalized multi-channel messaging adapter layer (REFERENCE for Communication Hub channel architecture — already partly realized in `src/lib/social/adapters.ts`) |
| Integration method | — |
| Reason | Financial-trading + key custody + token-launch risk profile is unacceptable for the Alaminn platform. REJECT code entirely. |

### 8. anthropics/claude-plugins-community — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/anthropics/claude-plugins-community |
| Purpose | Read-only mirror of the Claude community plugin marketplace; `.claude-plugin/marketplace.json` lists plugins that passed Anthropic's internal security review pipeline. |
| License | Apache-2.0 (repo-level; each listed plugin retains its own license) |
| Framework | Manifest JSON + a handful of example plugin dirs (`eli5`, `html-plan`, `next-steps`, `quickdesign`, `testdino`, `tres-finance-plugin`) |
| Dependencies | None |
| Architecture | Nightly sync from an internal review pipeline; PRs auto-closed |
| Security | Value is precisely the **review pipeline model**: submission → automated security scanning → approval → distribution |
| Compatibility | Conceptual |
| Reusable components | Marketplace manifest conventions; review-gate design for Alaminn's future Skills/Tools Registry (every third-party skill passes scanning before listing) |
| Integration method | — (study only) |
| Reason | The mirror itself contains little code; its governance model is the reusable asset. Alaminn's registry should copy the *process* (scan → approve → publish), not the files. |

### 9. volcengine/OpenViking — REFERENCE / ISOLATE

| Field | Verified information |
|---|---|
| Repository | https://github.com/volcengine/OpenViking |
| Purpose | "Context database for AI agents": one virtual filesystem (`viking://`) holding knowledge (resources), memory, and skills; directory summaries; scoped semantic search (`find`/`search`); Web Studio UI. |
| License | **AGPL-3.0** (LICENSE file content verified — GNU Affero GPL v3) |
| Framework | Python (`openviking/` package, `MANIFEST.in`), Rust crates (`crates/`), React frontend (`frontend/`), Caddy, Docker Compose, npm bindings |
| Dependencies | Python ML/embedding stack (per `pyproject`-style layout), vector index internals |
| Architecture | `viking://` URI scheme; context types (resource/memory/skill); retrieval planner; agent-plugins; benchmark suite; `bot/`, `integrations/` |
| Security | Stores agent knowledge; permission/isolation model must be evaluated against Alaminn's per-user/org isolation needs before any deployment |
| Compatibility | High conceptually with Memory OS + Knowledge OS goals; **zero code compatibility** (AGPL) |
| Reusable components | None copied. Design: context taxonomy (resource/memory/skill), URI-addressable memory tree, summary-first retrieval |
| Integration method | **REFERENCE** (primary). Optional **ISOLATE**: run the upstream container unmodified behind an authenticated internal API — but AGPL network clauses bite on any modification; get legal approval before deploying even unmodified in a commercial SaaS context |
| Reason | The prompt's own policy flags AGPL. Its architecture is the best available map for the Memory/Knowledge OS split ("one filesystem for knowledge, memory, skills"), which aligns with Alaminn's existing `docs/MEMORY_ARCHITECTURE.md` proposal (isolation, provenance, permissions). |

### 10. akitaonrails/ai-memory — ADAPT (patterns) / ISOLATE (runtime)

| Field | Verified information |
|---|---|
| Repository | https://github.com/akitaonrails/ai-memory |
| Purpose | Long-term memory server for coding agents: cross-agent (20+ harnesses), cross-project, cross-machine shared memory; typed handoff protocol (owner + claim-once), cross-project work profile, multi-user auth, per-person attribution, audit log. |
| License | **MIT** (LICENSE + badge; API agrees) |
| Framework | Rust (Cargo workspace, `crates/`, `bin/`), Docker, `deny.toml` (cargo-deny), gitleaks config |
| Dependencies | Rust 1.95+ toolchain; companion adapters (`companions/`) per harness |
| Architecture | Memory server + harness companions; docs cover handoffs, cross-project profile, DATA_HANDLING.md, SECURITY.md; `evals/` |
| Security | Multi-user auth + audit built in (claimed in README; verify in Phase 8 if deployed); DATA_HANDLING.md documents data flows; local-first posture |
| Compatibility | High conceptually (Memory OS); runtime would be a separate Rust service |
| Reusable components | Design patterns: typed handoff record, claim-once semantics, work-profile layering, attribution model, memory write/read lifecycle (`docs/`) |
| Integration method | **REFERENCE/ADAPT patterns** into Alaminn Prisma `Memory*` models (Phase 4 design), and/or **ISOLATE** the Rust server as an optional memory backend behind the existing auth layer |
| Reason | MIT + actively maintained (pushed 2026-11-10). Its handoff/attribution/audit design is the strongest verified match for the Memory OS spec — and it upgrades the "unverified" note in `docs/MEMORY_ARCHITECTURE.md`. Rust runtime ⇒ isolate, don't embed. |

### 11. mksglu/context-mode — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/mksglu/context-mode |
| Purpose | Local plugin for 10 coding agents: runs tool work in a sandbox, stores full output in a local SQLite index, feeds the agent only requested slices ("Thinking in Code"), ~99% context-byte savings; MCP tools. |
| License | **Elastic License 2.0** (LICENSE file content verified: "Elastic License 2.0 (ELv2) Copyright 2026 Mert Koseoglu") |
| Framework | TypeScript/Node **≥24.15** (`package.json` engines), local sandbox, SQLite |
| Dependencies | npm `context-mode`; MCP SDK |
| Architecture | hooks → sandbox runner → `~/.context-mode/context.db` index → slice/query tools |
| Security | Local-only storage, zero telemetry claimed (documented network calls); sandbox boundaries matter if reimplemented server-side |
| Compatibility | Conceptual (AgentOS tool-output economy) |
| Reusable components | None copied (ELv2 + prompt policy). Design: spool large tool output to a store, return handles/summaries, "write-a-script-to-query" pattern |
| Integration method | — (clean-room study) |
| Reason | ELv2 permits internal use but restricts offering the software as a managed service; copying source into the commercial platform needs legal sign-off. The **idea** (tool-output spooling to protect context windows) should be clean-roomed into the AgentOS execution engine — that alone will materially cut AI cost. |

### 12. nashsu/llm_wiki — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/nashsu/llm_wiki |
| Purpose | Personal knowledge base that builds itself: two-step chain-of-thought ingest with source traceability, multimodal PDF/image ingestion, multi-format parsing (PDF/Office/EPUB/media/URLs), 4-signal knowledge graph + Louvain communities, LanceDB vector search, persistent ingest queue, deep research, Rust chat agent, MCP server, Chrome clipper. |
| License | **GPL-3.0** (LICENSE file content verified: "GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007"). README badge mislabels nothing, but GitHub API reports NOASSERTION — file inspection is authoritative: **GPL-3.0** (not AGPL). |
| Framework | TypeScript + Vite + React frontend, Tauri desktop shell (`src-tauri/`), Rust backend agent, `mcp-server/` |
| Dependencies | LanceDB, MinerU (optional PDF), Tavily/SerpApi/SearXNG for research |
| Architecture | Ingest pipeline (analyze → generate wiki pages, incremental cache), knowledge graph (direct links, source overlap, Adamic-Adar, type affinity), source-grounded retrieval mode, review queue |
| Security | Local desktop app; "Read Sources Only" mode is an anti-hallucination control worth mirroring |
| Compatibility | Conceptual match to Knowledge OS |
| Reusable components | None copied (GPL-3.0). Design: ingest queue with crash recovery, source-traceability model, graph-signal weighting, "answer only from sources" mode |
| Integration method | — (study only) |
| Reason | GPL-3.0 incorporation would copyleft Alaminn. Its pipeline design is the best blueprint for the Knowledge OS ingestion + citation requirements. Karpathy LLM-Wiki pattern referenced in README is independently usable. |

### 13. siyuan-note/siyuan — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/siyuan-note/siyuan |
| Purpose | Privacy-first, block-based note-taking & knowledge base ("from thought to insight, with agents"): content-addressed asset store, document versioning, full-text search, sync, Docker/K8s hosting. |
| License | **AGPL-3.0** (badge + LICENSE; API agrees) |
| Framework | Go kernel (`kernel/`), TypeScript/Electron app (`app/`), SQLite |
| Dependencies | Go toolchain, Node for the app |
| Architecture | Kernel HTTP API + S3-like asset repo; block model (every paragraph a block with ID); `THIRD_PARTY_NOTICES.md` hygiene |
| Security | Local-first; data repo key model documented in FAQ |
| Compatibility | Conceptual (Knowledge OS document model) |
| Reusable components | None copied. Design: block-level addressability, document versioning, asset content-addressing |
| Integration method | — (study only) |
| Reason | AGPL-3.0 ⇒ no incorporation. Mature reference for how a knowledge store should version documents and address content — feeds the Knowledge OS schema design (Phase 4). |

### 14. coreyhaines31/marketingskills — ADAPT

| Field | Verified information |
|---|---|
| Repository | https://github.com/coreyhaines31/marketingskills |
| Purpose | Curated **marketing agent skills** (Agent Skills spec): product-marketing foundation + SEO & content, CRO, copy, paid/ads, growth/retention, sales/GTM, strategy; plus a tools registry with scoped-credential connection guides. |
| License | **MIT** (LICENSE + README; API agrees) |
| Framework | Markdown skills (`skills/`), docs, evals, validation scripts (`validate-skills*.sh`), `tools/` |
| Dependencies | None at runtime |
| Architecture | Skill graph: `product-marketing` read first by all others; per-skill SKILL.md conventions; partner integrations disclosed via `partners.json` |
| Security | Credential scoping guidance (`tools/SETUP.md`); partner disclosure policy — good governance pattern to mirror |
| Compatibility | Very high — content drops into an agent skills registry |
| Reusable components | `skills/` (seo-audit, cro, copywriting, cold-email, ab-testing, launch, etc.), skill-graph design, eval harness idea |
| Integration method | **Library/content**: import skills (MIT + attribution) into Marketing OS Skills Registry; adapt tool steps to Alaminn's own API layer (never import partner SDKs blindly) |
| Reason | Best-in-class curated marketing methodology, MIT, active (pushed 2026-11-10). Directly satisfies the "Marketing Skills as architectural reference" instruction — and can be *used*, not just referenced. |

### 15. every-app/open-seo — ADAPT / ISOLATE

| Field | Verified information |
|---|---|
| Repository | https://github.com/every-app/open-seo |
| Purpose | Open-source Semrush/Ahrefs alternative: keyword research, rank tracking, competitor insights, backlinks, site audits, AI visibility; BYO DataForSEO key (pay-per-use); MCP server + agent skills; self-hostable (first-visitor admin, invite links). |
| License | **MIT** (LICENSE; API agrees) |
| Framework | TypeScript; `@ai-sdk/react`, `better-auth` (+api-key), Drizzle ORM (`drizzle/`), Cloudflare-flavored config (`cloudflare.config.ts`, `@cloudflare/workers-oauth-provider`), pnpm |
| Dependencies | DataForSEO (data source), `@every-app/sdk`, AI SDK |
| Architecture | Next-style app + `plugins/`, MCP server, skills; `compose.yaml` self-host path; `deploy/` |
| Security | Standard web app surface; `SECURITY.md`, `.oss-scanner` present. DataForSEO keys must stay server-side |
| Compatibility | High for SEO Intelligence; different auth/ORM stack (better-auth + Drizzle) — Alaminn keeps its own Prisma/auth and borrows **workflows + API mapping** |
| Reusable components | SEO workflow definitions, DataForSEO request/response mapping, MCP tool contracts, skills (`plugins/`) |
| Integration method | **ADAPT**: port workflow + DataForSEO adapter patterns into `src/lib/ai` + new SEO services (Alaminn RBAC on top). Optionally **ISOLATE** the whole app as an internal SEO appliance (MIT — safe either way) |
| Reason | Verified, MIT, active (pushed 2026-11-07). The single best fit for the "SEO and Competitor Intelligence" pillar. Note its UI stack differs; do not merge stacks — adapt capability, preserve Alaminn conventions. |

### 16. blader/humanizer — ADAPT

| Field | Verified information |
|---|---|
| Repository | https://github.com/blader/humanizer |
| Purpose | Agent skill that rewrites AI-sounding text into human prose **without changing meaning**, based on Wikipedia's "Signs of AI writing"; 26 pattern rewrites (e.g. "Not X but Y", one-line closers). Explicitly *not* an AI-detector evader. |
| License | **MIT** (LICENSE; API agrees) |
| Framework | Agent Skill (markdown `SKILL.md`), `agents/`, `scripts/`, `package.json` |
| Dependencies | None |
| Architecture | Pattern catalog + rewrite instructions; plugin manifests for Claude/Cursor |
| Security | None material (text transformation only) |
| Compatibility | Very high — becomes a Content Studio quality pass |
| Reusable components | `SKILL.md` + the 26-pattern catalog |
| Integration method | **Library/content**: Content Studio "Humanize" action + agent skill (MIT + attribution) |
| Reason | MIT, active (pushed 2026-11-10), directly serves "AI Content Studio" quality requirements. Honest scope (no detector evasion) matches Alaminn's claim-governance culture. |

### 17. harry0703/MoneyPrinterTurbo — ISOLATE

| Field | Verified information |
|---|---|
| Repository | https://github.com/harry0703/MoneyPrinterTurbo |
| Purpose | One-stop AI short-video generator: topic → script (LLM) → stock-material matching → subtitles (ASR) → BGM → MP4; WebUI + REST API. |
| License | **MIT** (LICENSE; API agrees) |
| Framework | Python 3.11+, FastAPI-style API + WebUI, moviepy/ffmpeg, `uv.lock`, Docker (CPU + GPU variants), `cli.py` |
| Dependencies | LLM provider keys, TTS/ASR, Pexels-style material APIs (per config.toml), ffmpeg |
| Architecture | `app/` services (material, script, video, subtitle, voice), `test/`, `requirements-security.txt` (supply-chain hygiene), `resource/` |
| Security | Outbound fetches to third-party material sources (SSRF/content-license caution); API must be internal-only behind Alaminn auth |
| Compatibility | Runtime-compatible as a **separate Python service** (matches "optional isolated services" rule) |
| Reusable components | N/A as library; the service API is the contract |
| Integration method | **ISOLATE**: run container internally; Alaminn Content Studio calls its API through a server-side adapter with job queue + approvals |
| Reason | MIT, extremely active (pushed 2026-11-10). Video generation needs Python/ffmpeg/GPU-class resources — wrong runtime for the Node monolith, ideal as an isolated worker. Stock-footage licensing must be surfaced in the UI (don't ship scraped assets). |

### 18. heygen-com/hyperframes — ADAPT / ISOLATE

| Field | Verified information |
|---|---|
| Repository | https://github.com/heygen-com/hyperframes |
| Purpose | "Write HTML. Render video. Built for agents." Deterministic MP4 rendering from HTML/CSS/media/seekable animations; CLI + agent skills; free Studio desktop app; HeyGen paid models optional (Pro). |
| License | **Apache-2.0** (LICENSE + badge; API agrees) |
| Framework | TypeScript/Node ≥22, npm package `hyperframes`; `DESIGN.md`, `TRIAGE.md` engineering docs |
| Dependencies | Headless rendering stack (Chromium-class + ffmpeg under the hood — verify at integration) |
| Architecture | CLI + skills (`npx hyperframes skills update`), block catalog (data-chart etc.), Dockerfile.test |
| Security | Rendering arbitrary HTML ⇒ sandbox the renderer; never render untrusted templates with network access |
| Compatibility | High — Node-native, npm-distributable, agent-oriented |
| Reusable components | The npm package + skills (Apache-2.0: keep NOTICE), block catalog concepts for brand templates |
| Integration method | **ADAPT** as a library behind Content Studio "video from template" (server-side render jobs), or **ISOLATE** as a render worker if Chromium footprint is unwanted in the main service |
| Reason | Apache-2.0, active (pushed 2026-11-10), deterministic HTML→video matches Alaminn's brand-template + content-studio needs better than full video-editing stacks. HeyGen Pro APIs are optional — keep BYO/BYO-voice paths first. |

### 19. DIYgod/RSSHub — ISOLATE

| Field | Verified information |
|---|---|
| Repository | https://github.com/DIYgod/RSSHub |
| Purpose | "Everything is RSSible": generates RSS feeds for 5,000+ websites/services (news, social, academic…). Self-hostable (Docker), huge route ecosystem. |
| License | **AGPL-3.0** (LICENSE; API agrees) |
| Framework | TypeScript/Node (Hono-class HTTP layer, per `lib/`), Docker, `docker-compose.yml`, `cloudflare.config.ts` deploy target |
| Dependencies | Route-scoped scrapers (cheerio-class), cache layers |
| Architecture | `lib/routes/` (community routes), `lib/middleware/`, deployment configs |
| Security | Route scrapers fetch third-party sites (SSRF/ToS/rate-limit concerns); self-host on internal network only |
| Compatibility | Perfect functional fit for Knowledge OS RSS ingestion; zero code fit (AGPL) |
| Reusable components | None copied. Operate the **unmodified upstream container** as an internal feed factory |
| Integration method | **ISOLATE**: RSSHub container on the internal network; Alaminn Knowledge OS consumes its feeds over HTTP; route allow-listing + caching in Alaminn |
| Reason | AGPL: running unmodified upstream keeps Alaminn's codebase clean; forking/modifying it would trigger source disclosure. Established ops model (5,000+ instances) makes unmodified self-hosting low-risk. |

### 20. debpalash/VoiceStudio — REFERENCE / ISOLATE (legal gate)

| Field | Verified information |
|---|---|
| Repository | https://github.com/debpalash/VoiceStudio |
| Purpose | On-device AI voice studio: cloning, voice design, dubbing, dictation, transcription, narration ("646 languages"); runs on laptops/servers/phones; commercial Pro/Cloud tiers exist. |
| License | **AGPL-3.0** (LICENSE file content verified — GNU AGPL v3; README badge says AGPL-3.0; API agrees) |
| Framework | Python backend (`backend/`, `alembic.ini`, `Makefile`), Electron frontend (`cli/`, `bun.lock`), Docker, `.dagger/` CI |
| Dependencies | Local model stack (TTS/ASR/clone models — heavy GPU optional), alembic migrations |
| Architecture | Backend API + desktop shell + model management; `LICENSE-NOTICE.md` third-party terms |
| Security | Voice cloning = deepfake/impersonation risk ⇒ consent management mandatory (spec already requires consent); biometric-voice data has privacy-law exposure |
| Compatibility | Voice pillar only; heavyweight runtime |
| Reusable components | None copied. Design: voice pipeline stages (clone/design/dub/dictate/transcribe/narrate) for the Content Studio voice-over spec |
| Integration method | **REFERENCE** for pipeline design. **ISOLATE** (unmodified container, internal) only with explicit legal approval given AGPL + commercial dual-track upstream |
| Reason | AGPL-3.0-only confirmed. Combined with deepfake liability, this stays behind a legal gate; the *feature taxonomy* still improves the Content Studio requirements. |

### 21. Lakr233/vphone-cli — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/Lakr233/vphone-cli |
| Purpose | Run a virtual iPhone on Apple Silicon Macs (Virtualization.framework + PCC research VMs) for security research/reverse engineering. |
| License | MIT |
| Framework | Swift (Xcode workspace), macOS-only |
| Architecture | `VPhoneKit`, `VPhoneDaemon`, `VPhoneLaunchpad`, guest components |
| Security | Explicit crypto-scam warning in README (project name abused by scammers) |
| Compatibility | **None** for a web platform |
| Reusable components | None |
| Reason | Hardware-virtualization research tool; irrelevant to Alaminn. |

### 22. public-apis/public-apis — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/public-apis/public-apis |
| Purpose | Curated directory of free public APIs (by category), with CI validation scripts. |
| License | **MIT** (LICENSE; API agrees) — note: each listed API has its own terms |
| Framework | Python scripts for link/CI validation; the value is the README dataset |
| Architecture | `scripts/` + `README.md` (2,896 lines) |
| Security | Third-party APIs vary wildly in trust; catalog ≠ endorsement |
| Compatibility | Feeds Integrations module discovery |
| Reusable components | The catalog data (MIT) as seed content for the Integrations page; validation-script idea for link health |
| Integration method | **REFERENCE/data**: curated import of relevant entries (marketing/education/comms) into the existing `src/lib/integrations/registry.ts` conventions |
| Reason | Low effort, real value for the Integrations requirement; entries must be individually vetted before any runtime adapter is written. |

### 23. vastsa/PI-Desktop — REFERENCE

| Field | Verified information |
|---|---|
| Repository | https://github.com/vastsa/PI-Desktop |
| Purpose | Modular desktop workspace for AI agents: projects, agents, models, plugins, workflows in one persistent local environment (local-first, model-agnostic). |
| License | **LGPL-3.0** (LICENSE; API agrees) |
| Framework | TypeScript monorepo (`pnpm-workspace.yaml`, `packages/`, `apps/`), Rust crates (`crates/`), desktop shell |
| Dependencies | pnpm, Tauri/Electron-class stack, plugin SDK |
| Architecture | `apps/` desktop, `packages/` (plugin API, model adapters), `docs/plugin-development.md`, `examples/`, `tests/` |
| Security | Local-first claims; plugin model executes third-party code — sandboxing is the key study point |
| Compatibility | Conceptual (AgentOS workspace + plugin system) |
| Reusable components | None copied (LGPL linking obligations). Design: plugin manifest/API boundaries, model-adapter abstraction, persistent workspace layout |
| Integration method | — (study only) |
| Reason | LGPL-3.0 embedding into a proprietary SaaS requires legal engineering (dynamic linking + relink rights); early-preview status (0.21.x) adds churn risk. Its plugin API design directly informs the Alaminn Tool Registry + Agent Builder specs. |

### 24. fmtlib/fmt — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/fmtlib/fmt |
| Purpose | The de-facto C++ formatting library (basis of `std::format`). |
| License | MIT (with a small BSD-style doc exception — standard for the project) |
| Framework | C++ (CMake) |
| Compatibility | **None.** Alaminn has no C++ component |
| Reason | Included in the register for completeness; nothing to integrate. |

### 25. nabaleducation/EducationConsultancyWebsite — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/nabaleducation/EducationConsultancyWebsite |
| Purpose | Figma-generated code bundle ("Education Consultancy Website" from a Figma design). 10-line README; `dist/` committed; `node_modules` committed (!). |
| License | **NONE** — no LICENSE file; Figma export bundles carry no open-source grant (API `license: null`) |
| Framework | Vite + React + shadcn-style theme (`default_shadcn_theme.css`) |
| Security | Committed `node_modules` signals poor hygiene; unverifiable provenance |
| Compatibility | Design domain overlaps (education consultancy) but code is unusable legally |
| Reusable components | None. Layout ideas may be glanced at; Alaminn already has a superior design system |
| Reason | Unlicensed Figma export. REJECT code; no design dependency needed — Alaminn's Higher Study module is far ahead. |

### 26. arupdas0825/studytra — REFERENCE (UX only)

| Field | Verified information |
|---|---|
| Repository | https://github.com/arupdas0825/studytra |
| Purpose | "AI-powered study-abroad execution platform" for Indian students (Germany/USA/Canada/UK/Australia): plan → decide → track → execute; IELTS prep to landing; Groq AI + Firebase. |
| License | **NONE verified** — README badge *claims* MIT but **no LICENSE file exists** (API `license: null`; direct LICENSE fetch failed). Treat as **unlicensed**. |
| Framework | React 18 + Vite 5 + React Router 6 + Firebase (Auth/Firestore) + Groq; `vercel.json` |
| Architecture | `src/` SPA, `api/` (functions), `firestore.rules`, `knowledge-base/` |
| Security | Firebase rules present; AI prompts via Groq |
| Compatibility | Domain overlap with Higher Study module (which is far larger: 30+ models vs. Firestore collections) |
| Reusable components | **No code.** UX/feature taxonomy (execution-tracking framing: "Plan · Decide · Track · Execute") can inform Higher Study UX copy |
| Integration method | — (study only) |
| Reason | No license ⇒ no reuse regardless of the badge. Stale (last push 2026-07-03). Alaminn's Higher Study module already exceeds it. |

### 27. Bhawana0218/NextStep-Abroad — REJECT

| Field | Verified information |
|---|---|
| Repository | https://github.com/Bhawana0218/NextStep-Abroad |
| Purpose | Frontend technical-assessment demo: "Help Study Abroad" admin dashboard using DummyJSON fake API; README publishes demo credentials (`emilys`/`emilyspass`). |
| License | **NONE** (API `license: null`) |
| Framework | Next.js 16 + MUI v9 + Zustand + Recharts + react-hook-form |
| Architecture | `nextstep-abroad/` single app; auth is a demo shim (localStorage token + cookie flag) |
| Security | Demo auth patterns (localStorage tokens) must **never** be copied |
| Compatibility | None beyond stack naming (Next 16) |
| Reason | Assessment demo with fake data and no license. REJECT. |

---

## Cross-cutting findings

1. **License distribution (verified):** MIT ×15, AGPL-3.0 ×4 (OpenViking, siyuan, VoiceStudio, RSSHub), Apache-2.0 ×3 (OpenLogi [dual], claude-plugins-community, hyperframes), GPL-3.0 ×1 (llm_wiki), Elastic-2.0 ×1 (context-mode), LGPL-3.0 ×1 (PI-Desktop), **no license** ×4 (cursor/plugins, studytra, NextStep-Abroad, EducationConsultancyWebsite).
2. **Prompt-vs-verified corrections:** (a) register count is 27 unique, not 28; (b) llm_wiki is **GPL-3.0** (GitHub NOASSERTION) — confirmed by file; (c) studytra's README *claims* MIT but no LICENSE exists — must be treated as unlicensed; (d) ruflo root license **is** MIT as claimed, but per-component sweep still required; (e) VoiceStudio is AGPL-3.0 (consistent with "AGPL-3.0-only").
3. **README marketing ≠ evidence:** ruflo ships explicitly "illustrative" download counters; CloddsBot publishes a token contract address; NextStep-Abroad publishes demo passwords. None of these claims were adopted as facts.
4. **Maintenance:** 23 of 27 repos pushed within the last ~30 days (many within 48h of this audit). The 4 exceptions: the two education demos and studytra (July 2026), EducationConsultancyWebsite (Sept 2026).
5. **Stack alignment:** of the ADAPT/ISOLATE targets, only MoneyPrinterTurbo (Python), ai-memory (Rust) and RSSHub (Node) are foreign runtimes — all three fit the "optional isolated services" lane the master spec already allows. The rest are Node/TypeScript or pure content.
6. **Overlap warning:** open-seo and MoneyPrinterTurbo already appear in Alaminn's existing `src/lib/integrations/registry.ts` (42-entry register) — integration planning must stay consistent with that registry's `adapter | service | reference | desktop | unavailable | excluded` taxonomy (see `ALAMINN_INTEGRATION_PLAN.md`).

---

## Status report (required fields)

| Field | Value |
|---|---|
| **Completed work** | All 27 unique repositories inspected: metadata, root trees, READMEs, license files, manifests. Verified licenses. Decisions + integration methods + priorities assigned. Prompt-vs-reality corrections documented. |
| **Pending work** | Deep code-level review of ADAPT targets (per-component license sweep of ruflo; skill-content review of ECC/marketingskills); runtime/dependency vulnerability scans (`npm audit` etc.) — blocked until install is approved. |
| **Blockers** | Audit-only mode prevents dependency installation and running repos; security scans of *these* repos are limited to static license/structure review. |
| **Security concerns** | 4 unlicensed repos (zero-copy enforced); AGPL ×4 and ELv2/LGPL/GPL ×3 confined to REFERENCE/ISOLATE lanes; deepfake risk flagged for VoiceStudio; SSRF/content-license risks flagged for RSSHub/MoneyPrinterTurbo/OpenSEO scraping paths; wallet-key-handling repo (CloddsBot) fully rejected. |
| **Files changed** | `docs/ALAMINN_REPOSITORY_AUDIT.md` (+ companion `docs/ALAMINN_*.md`). No application files. |
| **Tests executed** | None (static audit; API-verified metadata as evidence). |
| **Test results** | Evidence artifacts: GitHub API metadata (licenses/stars/dates), LICENSE file excerpts, root trees, README captures — retained in the audit workspace during the session. |
| **Rollback instructions** | Documentation-only; delete/checkout `docs/ALAMINN_*.md`. Nothing in application code, DB, or services changed. |
