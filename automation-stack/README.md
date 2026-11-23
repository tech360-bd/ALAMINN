# automation-stack — Reference AI & Edge Automation Stack

This directory documents the external open-source reference projects aligned with ALAMINN's AI agent orchestration and media/edge capabilities.

> **Important:** None of these external repositories are imported at runtime or tracked as git submodules in this repository. All runtime application code, AI routing, and connectors live in `src/` and `mini-services/` and are covered directly by the repository's TypeScript, ESLint, Vitest, and CI quality gates.

## Upstream Reference Projects

| Project | Upstream Repository | Reference Scope |
| --- | --- | --- |
| `agency-agents` | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Production AI agent personas and structured deliverable templates. |
| `agency-agents-zh` | [jnMetaCode/agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) | Bilingual/multi-market specialist agent role specifications. |
| `ai-agency-agents` | [Anas-Khan93/ai-agency-agents](https://github.com/Anas-Khan93/ai-agency-agents) | Specialized agency agent divisions (engineering, growth, research, strategy). |
| `agency-orchestrator` | [jnMetaCode/agency-orchestrator](https://github.com/jnMetaCode/agency-orchestrator) | Declarative YAML workflow and DAG task breakdown patterns. |
| `ybt-army-135m` | [YouBTech01/YBT-Army-135M](https://github.com/YouBTech01/YBT-Army-135M) | Compact offline local-inference reference architecture. |
| `nginx` | [nginx/nginx](https://github.com/nginx/nginx) | Upstream reference for `deploy/nginx-alaminn-info.conf` reverse-proxy tuning. |
| `obs-studio` | [obsproject/obs-studio](https://github.com/obsproject/obs-studio) | Reference for external media/RTMP capture workflows. |
