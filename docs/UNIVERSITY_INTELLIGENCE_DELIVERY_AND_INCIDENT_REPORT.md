# ALO Education 大学与课程实时情报系统 — 交付与事件证据报告

日期：2026-11-27（UTC+8 时区）
仓库：tech360-bd/ALAMINN
分支：`feat/university-course-intelligence`（提交 `07c44b0`）
PR：**#106 — 已合并 main**（合并提交 `5169630`，https://github.com/tech360-bd/ALAMINN/pull/106）

---

## 一、模块交付内容（对照规格 9 节）

按规格 §9 前置要求，实现前先完成现有数据库审计（文档：`docs/UNIVERSITY_COURSE_INTELLIGENCE_AUDIT.md`，已随 PR 合入），确认 132 → 138 模型全部复用、零批量替换、零既有路由/数据/模块删除或重建。

| 规格 | 交付 |
|---|---|
| §1 目标 | 文档化来源注册表（`HigherStudySourceOrg`）：L1 官方大学/政府源、L2 发现平台（ApplyBoard Assist / Edvoy / AHZ Associates / IDP Education / **MARGE（URL 待确认，采集默认禁用，需人工确认后开启）**）、L3 可信公共源；ALO 自有目录，不复制竞品内容 |
| §2 采集字段 | 权限门控采集器：robots.txt 解析（正确的 agent-group 语义 + 最长匹配 + crawl-delay）、robots 不可达 → 保守跳过并记录 `skipped-permissions`，**绝不绕过限制**；未知值存 null（unknown），原文措辞有界摘录 + 归一化值并存 |
| §3 来源层级与冲突 | 每条事实记录来源组织/URL/层级/类型；L2 仅用于发现，L1 验证才可标记官方确认；**冲突时保留全部候选值**（`HigherStudyConflict.candidates` JSON）+ 人工审核任务，系统绝不静默择一；人工裁决必须从已保留候选中选，L1 候选通过后 verified，L2 候选继续留审 |
| §4 实时监控与状态 | 8 状态机（DISCOVERED → SOURCE_CHECK_REQUIRED → OFFICIAL_SOURCE_VERIFIED → APPROVED_FOR_PUBLICATION，侧态 CONFLICTING_INFORMATION / OUTDATED / UNAVAILABLE / HUMAN_REVIEW_REQUIRED）含合法流转校验；每条证据带 collectedAt/lastCheckedAt/lastVerifiedAt/学年/变更历史；周级 cron `/api/cron/university-intelligence`（与既有监控共享锁防双跑）；按层级复检策略（L1 每周、L2/L3 每月）标记 OUTDATED，连续失败标记 UNAVAILABLE |
| §5 原创内容与品牌 | 既有内容不动；课程详情页新增"事实级数据验证轨迹"（Verified 绿 / Awaiting confirmation 琥珀、来源链接区分 official/discovery、学年、最后检查日期）；不复制竞品描述/图片/版式；无隶属或背书暗示 |
| §6 目录与详情页 | 既有 33 层级 course-finder（学费区间/奖学金/英语要求/研究成分/验证状态等过滤器）复用；15 项详情内容既有覆盖 + 新增验证轨迹；已验证 vs 待确认明确区分 |
| §7 研究与 PhD | 既有 supervisor/research 模型复用（`acceptingStudents` 默认 false，绝不虚构名额）；验证管线接入 L1 官方主页验证；proposal builder 与真人审核流程不变 |
| §8 管理后台 | `/admin/higher-study/intelligence` 仪表盘（来源注册表、证据、冲突、重复、失败任务+重试、审核队列、MARGE URL 确认、CSV 导出）+ 10 个角色门控 admin API；L2 批量导入（行进入 DISCOVERED + draft + 未发布，含去重保护与 dry-run）；发布门禁（任何展示事实未验证或有开放冲突 → 拒绝，服务端强制） |
| §9 验收 13 条 | 见下文逐条核验 |

### 13 条验收标准核验

1. 来源全部文档化 ✅ `SOURCE_ORG_DEFINITIONS` + 注册表种子 + 审计文档 §源注册表
2. 采集遵守权限与技术限制 ✅ robots 门控 + 单元测试（allow/deny/unknown/404/crawl-delay 五类）+ `skipped-permissions` 记录
3. 每条已发布记录可溯源 ✅ 证据行含 sourceUrl/sourceLevel/sourceOrgKey + 导出 CSV 全字段归因 + 页面展示
4. 官方 vs 第三方可区分 ✅ L1/L2/L3 字段 + 页面"official source / discovery source"标识
5. 学费/截止带学年或日期 ✅ evidence.academicYear 采集（2026-27 等格式检测）+ 详情页展示
6. 缺失不编造 ✅ `normaliseSignalValue` null 保持 null；importer 国家缺失即报错不猜
7. 变更可溯源 ✅ evidence.changeHistory JSON + 既有 DataChange 审批流不动
8. 重复可检测 ✅ 归一化名 + URL 碰撞检测 + 人工合并决定（自动合并永不执行）
9. 冲突进人工审核 ✅ 冲突保留全部候选 + ReviewTask + API 裁决（非候选拒绝）
10. 内容独立原创 ✅ 零竞品文案复制；仅事实数据点 + ALO 措辞
11. 移动端+桌面端可用 ✅ 沿用既有响应式设计系统（DetailCard/布局组件）
12. 管理员可验证/审批/更正/下架 ✅ evidence PATCH（合法流转 + L1-only 验证）+ approvePublication + 既有 CRUD/下架不变
13. 采集失败可见可恢复 ✅ CollectionJob 记录 + 失败计数 + nextRetryAt + admin 重试端点；无删除

**附加约束**：不删除/重建现有路由 ✅（全部 additive：6 新模型、10 新 API、1 新页面、1 新 cron）；不批量替换现有数据 ✅（富集仅经"复检 → 证据 → 人工审批"路径）。

## 二、门禁结果（全绿）

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | 0 错误 |
| `eslint .` | 0 错误（警告 38，全部为存量模式） |
| 单元 + lib + 集成测试 | **769/769 通过**（新增 40：robots 语义、状态机、冲突保留、发布门禁、L2 导入、导出转义、注册表种子） |
| Disposable API 套件 | 67/67 通过 |
| 安全套件 | 全部通过（44 PASS） |
| SQLite 迁移重放（fresh + restored upgrade） | 通过 |
| Prisma 双库 parity | **138 模型双 provider 对齐**（sqlite + mysql），MySQL 类型校验通过 |
| `next build` | 成功，无 OOM（194 静态页） |
| TODO 扫描 | 无真实 TODO 新增 |

**CI（GitHub Actions，提交 07c44b0 / main 5169630）**：全部通过 —— 含 **MariaDB migration and persistence（真实 MariaDB 11.4 容器重放全量迁移链 + schema parity）**、Typecheck·Lint·Test·Security·Build、Container build and runtime readiness、CodeQL、gitleaks、npm audit。

## 三、生产部署与站点事件（重要）

### 时间线（UTC）
- 01:05 PR #105 合并 → 01:05 版本 tag → 手动部署成功 → 01:42–01:47 live 验证 51/51 路由 200
- **06:27 PR #106 创建；07:25 前后合并（合并提交 5169630）**；06:40:22 Versioned Release 流水线产出发布 tag `v20261127-064022Z-...-51696308284a`（构建产物就绪）
- **06:41 起站点全路由 503**（含 `/`、`/api/health`）——**先于本次部署尝试，且合并后从未执行任何部署**（deploy 为 workflow_dispatch 手动触发架构，最近无 deploy 运行）
- 07:25–07:28 我方两次触发官方 Deploy 工作流：第 1 次因未携带备份/迁移审批输入被守门正确拦截；第 2 次守门通过（CI 绿验证），**Preflight 失败于 Tailscale**：
  ```
  Status: 400, Message: "requested tags [tag:github-actions] are invalid or not permitted"
  ```
  即 Tailscale OAuth 客户端已无法为 runner 自分配 `tag:github-actions`（管理台 tag 授权被移除/变更），runner 无法进入 tailnet SSH 到 alo-server-lap (100.94.234.101)。
- 07:15–07:30 多点探测确认：通过 Cloudflare 挑战后，源站对 `/`、`/api/health`、admin 路由持续返回**空 body 503**（`server: cloudflare`，无 content-type）——公网侧源站不可达。

### 结论
1. **站点宕机与 PR #106 无关**：合并未触发自动部署（部署为手动架构），生产仍运行 01:05 部署的 PR #105 release；宕机发生在 01:47–06:41 之间的 VPS 侧（延续上一报告的间歇 503 问题，已升级为持续宕机）。
2. **当前阻塞项（均在沙箱可达范围之外，需运营者处理）**：
   - Tailscale 管理台：恢复 OAuth client 的 `tag:github-actions` tag 授权（或重建带该 tag grant 的 OAuth client / 更新 ACL）；
   - VPS：检查 alo-server-lap 电源/网络/PM2（`pm2 status`、`pm2 logs alaminn`、`journalctl -u pm2-alamin`、nginx `error.log`、`curl localhost:3056/api/health`）；
   - 二者恢复后，在 GitHub Actions 手动触发 `Deploy (manual approval)`，填 commit `51696308284ab71435db33589cfd358d86caa06d` 并勾选 `approve_database_backup` + `approve_database_migrations`（部署步骤内置备份执行、迁移、健康验证与失败自动回滚到上一 release）。
3. **部署后一键验证**：运行 [verify-intel-live.js](/home/z/my-project/download/verify-intel-live.js)（真实 Chromium 过 Cloudflare 挑战，覆盖 21 条路由：首页/健康/新 admin 情报页/新 API 401/cron 401/既有 admin 回归/学生目录）。

### 本次可确认的部署就绪状态
- 发布 tag 已由流水线构建（Versioned Release 成功）；CI 全绿（含真实 MariaDB 迁移重放）；合并提交已在 main。
- 一旦基础设施恢复，部署仅剩一次手动触发。
