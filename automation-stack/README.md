# automation-stack — Full AI-automation server provider stack

Vendored reference clones (git submodules, `--depth 1`) of the projects that
power ALAMINN's "one platform, any automation" capability. They are **not app
code** — they are excluded from ESLint, the Docker build context and release
ZIPs, and are pinned here so the automation capability set is versioned,
auditable and always at hand.

Update any of them with:

```bash
git submodule update --remote automation-stack/<name>
```

## The stack

| Submodule | Upstream | Role in ALAMINN |
| --- | --- | --- |
| `agency-agents/` | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | 190+ production-grade AI agent personas across engineering, design, paid media, sales, marketing, finance, healthcare and more — each with personality, process and proven deliverables. Installable into Claude Code, Cursor, Codex, Gemini and friends; the roster feeds ALAMINN's agent library. |
| `agency-agents-zh/` | [jnMetaCode/agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) | 328 Chinese-language expert roles across 22 departments — the bilingual/multi-market layer of the same roster concept, installable into 20 AI coding tools. |
| `ai-agency-agents/` | [Anas-Khan93/ai-agency-agents](https://github.com/Anas-Khan93/ai-agency-agents) | "Open Agency" — 55+ specialized agents in 9 divisions (engineering, design, growth, research, strategy, creativity), MIT-licensed, 10k+ lines of persona/process specs. |
| `agency-orchestrator/` | [jnMetaCode/agency-orchestrator](https://github.com/jnMetaCode/agency-orchestrator) | The orchestration backbone: zero-code YAML workflows, 276 professional roles, single-sentence task breakdown, role matching, parallel DAG execution. CLI + web studio + Electron desktop. The alternative to AutoGen/CrewAI/LangGraph that ALAMINN's automation layer aligns with. |
| `ybt-army-135m/` | [YouBTech01/YBT-Army-135M](https://github.com/YouBTech01/YBT-Army-135M) | Compact 135M-parameter offline AI assistant (Python + Streamlit chat UI, reply styles incl. Hinglish, conversation export). Reference node for zero-API-key, fully-local chat — useful where no external LLM API is allowed. |
| `nginx/` | [nginx/nginx](https://github.com/nginx/nginx) | The official nginx source. ALAMINN already ships production nginx configuration (`deploy/nginx-alaminn-info.conf`, upstream on port 3056); the vendored source is the reference for edge tuning, and the base for RTMP/media proxying scenarios. |
| `obs-studio/` | [obsproject/obs-studio](https://github.com/obsproject/obs-studio) | OBS Studio — the streaming/recording engine (C/C++). Reference for media capture, scene composition and RTMP output when ALAMINN automates live-streaming or recording workflows. |

## Why submodules

- The main repo stays small: only gitlinks are committed, never source blobs.
- Every automation capability is pinned to a known-good commit (reproducible).
- ESLint, TypeScript, Next.js build, Docker context and release ZIPs all ignore
  this directory — the app's quality gates only ever measure ALAMINN's own code.

## Boundaries

These are upstream reference clones. Integration code (API routes, workers,
connectors) lives in `src/` and `mini-services/` and is the only code covered
by the CI quality gates. Nothing in `automation-stack/` is imported at runtime.
