# PowerI — Development Notes

PowerI 是基于上游 pi-web 的 fork（poweri / desktop 分支）打造的桌面产品：Tauri 壳（`src-tauri/`，含 Rust 宿主与 `src-tauri/shell/` 宿主前端）+ Next.js 内核，产品层独立于上游（`poweri/`）。
本文件是 Agent 的核心工作指引（红线、设计理念、关键机制）；细节用渐进式披露链接到 `docs/desktop/`，需要时再读。

## 分支模型：三层主干（2026-09-02 拍板）

```
upstream（镜像 agegr/pi-web，只 fast-forward，零自有提交）
  └─ poweri      Web 层主干：PowerI 产品层，终态 = @poweri/poweri-web npm 包
      └─ desktop    壳层：poweri 全部内容 + src-tauri/，终态 = Native App
```

数据流单向 `poweri → desktop`（desktop 定期 merge poweri，反向不存在）。**提交按文件归属落分支**：Web 层（`poweri/`、`app/poweri/`、`.github/`、`scripts/`、`docs/desktop/`、`package.json` 等）→ `poweri`；壳（`src-tauri/`）→ `desktop`；混合需求必须拆提交。`main`/`origin/main` 已删除（2026-09-03，历史可追溯），勿基于它开发。上游同步 SOP 与完整纪律见 [`docs/desktop/branch-model.md`](docs/desktop/branch-model.md)；镜像跟随：`node scripts/sync-upstream.mjs`。

**开发工作模式（agent 必须遵守）**：一个任务一个短命分支（从对应层主干开出：Web 层任务基于 `poweri`、纯壳任务基于 `desktop`），完成即 merge 归位并删除分支；**发布从 desktop 主干打 tag，不使用长命 release 分支**；worktree 仅作本地并行手段（预研/agent 隔离/热修），merge 后立即删分支与 worktree 并 `git worktree prune` 收尾，worktree 目录名与分支同名（`../pi-web-<branch>`）。**多 session 并发**：主 checkout 先到先得，开工先做三查（status/branch/HEAD），发现他人未提交改动不切分支、不提交、不 stash，改走临时 worktree；提交必须显式路径 add 并用 `git status --porcelain` 核对 staged 集合后才 commit。详细 SOP 见 [`docs/desktop/branch-model.md`](docs/desktop/branch-model.md) §开发工作模式/§多 session 并发纪律；版本管理策略与发布门禁见 [`docs/desktop/release.md`](docs/desktop/release.md)。

## ⛔ 绝对红线：不修改上游 pi-web 源码

动手改任何文件前先确认归属——上游文件（`lib/`、`hooks/`、`app/api/`、`components/`、`bin/`、`app/` 除 `app/poweri/`、`public/`、根目录配置、上游 `docs/adr/0001`）一律禁止修改。判断：

```bash
# 基线用真上游，不用 origin/main（origin/main 是冻结的旧 fork 主线，会误判自家文件）
# 列表优先于命令：`.github/` 上游无此目录但属 PowerI 持有；内容级精确判定见 ownership.md §6
git cat-file -e upstream/main:<path> && echo "上游持有，禁止修改" || echo "PowerI 持有，可改"
```

PowerI 持有可改：`src-tauri/`（含 `src-tauri/shell/`）、`poweri/`、`app/poweri/`、`scripts/`、`vite.config.ts`、`.github/`、`docs/desktop/`、`docs/agents/`、`docs/adr/0002-layered-architecture.md`（**勿写 `0002-*` 通配**：`0002-chat-only-tool-selection.md` 是上游的）。

完整名册、已登记例外（品牌图标、`main` 上的 WSL 路径修复等）、合并策略与名册再生成命令见 [`docs/desktop/ownership.md`](docs/desktop/ownership.md)。**新改一个上游文件，必须同 PR 在该文件例外表登记理由。**

上游能力缺失时：新 UI/功能写 `poweri/` 替换式接入（**包括“只是改几行”的上游组件：一律复制为 `poweri/components/` 替换件，不在 `components/` 上动刀**）；复用上游能力直接 import；配置类用运行时参数/独立配置文件；上游行为缺陷提 issue 等上游发版同步。
**违反此原则的改动，即使功能正确也会被拒收。**

## PowerI 产品设计理念（所有编码的指导思想）

> 用户（产品负责人）反复表达并亲自拍板的设计哲学。任何功能/修复：**分析方案 → 设计方案 → 实现方案**，三思后行；违反会被要求返工。

1. **以人为本（第一性原则）**：呈现首先服务人——**时间线是主框架、项目是次维度**（天内严格时间升序、不按项目分组——用户并行交替工作；项目用 chip 标识）；点击展开时**行纹丝不动**、详情在行下方全宽展开（横向空间最大化、高度更矮）；小可视化**并排横放**减竖向压力；**可视化优先于数字罗列**（donut/heatmap/mini-bar 是默认呈现，数字是下钻层）。
2. **原型先行**：UI 必须看到效果。先出 2-3 个**结构性变体**（`?variant=` 切换对比）→ 用户拍板 → 设计决策先问清楚再动手 → 胜出设计 capture 到 throwaway 分支（`prototype/<feature>`）→ 才落正式实现。**不经用户确认不得落正式实现。**
3. **上下文感知**：面板行为与用户状态联动（会话内开统计 → 当前会话置首、默认展示）；面板导航互斥语义（VS Code 式：点已激活=收起；载体为顶栏收纳，见 ADR-0003）。
4. **双模式与默认全量**：同类信息给两种可切换视角（按天↔按工作区 = "找某天的事" vs "找某项目的事"；全局↔历史）；**默认显示全部**，不做筛选下拉，点击行才下钻。
5. **自适应布局**：用 CSS **container queries**（跟随容器宽度，兼容窄面板与未来全屏），不用 `@media`；断点：窄=堆叠 / 中=两列 / 宽=多列。
6. **数据真实可对账**：统计口径与官方/SDK 一致并标注（全文件累计 vs 上下文窗口）；重要数字**实测验证**不报估算；对不上的账查根因（上游缺陷记 issue 不本地改）；性能问题单独立项研究。
7. **视觉细节**：数字**右对齐 + 固定列宽**（整齐右边缘）；时间等宽字体（tabular-nums）固定宽度、Git log 式；天/组头聚合 `N 会话 · X tokens · $Y · 缓存命中 Z%`；费用弱化色、命中率绿色；小圆环并排间距一致、中心显示总计。
8. **高频上主界面、低频进设置**（2026-08-22 拍板）：设置类（工具安装、MCP 配置、扩展安装配置等低频操作）一律收拢到统一的设置入口（上游 SettingsPanel，general/models/skills/agents/plugins）；顶栏只保留高频功能，分工表见 ADR-0003 §2。

## Quick Start

```bash
npm run dev                            # port 9989（poweri-web 专用端口，不再与 pi-web 上游 30141 共用）
node_modules/.bin/tsc --noEmit         # typecheck
npm run lint
# Never run `next build` during dev — pollutes .next/ and breaks npm run dev
# cargo/rustc 已软链 ~/.pi/agent/bin，直接调用；macOS 链接器用系统 /usr/bin/clang
```

## 架构速览

headless 后端（37 个 API 路由，session 经 `lib/rpc-manager.ts` 的进程内 AgentSession 驱动 + SSE 推流）＋ 浏览器前端；Tauri 壳启动 pi-web 并以 iframe 承载（`?cwd=` 参数通信）。完整文件地图见 `docs/desktop/file-map.md`。

## 分层架构

两层：**基础层**（`lib/`、`hooks/`、`app/api/`、低耦合组件 = 上游，跟随合并）+ **PowerI 产品层**（`poweri/` 全部自有，永不参与合并）。核心原则：**替换而非修改**——基础层 `AppShell.tsx` 不动，PowerI 用自己的 AppShell（`poweri/layout/`），入口 `app/poweri/page.tsx`（`/poweri` 路由，上游无此文件零冲突）。详见 [ADR-0002](docs/adr/0002-layered-architecture.md)。

**替换件上游同步审计（防上游新增功能被替换件静默忽略）**：poweri/ 替换件不随上游合并自动更新，上游新增功能/修复会静默缺失。登记表 [`docs/desktop/replacements.json`](docs/desktop/replacements.json) 记录"替换件 ↔ 上游对照文件 + watermark"。硬性约定：

1. **新建替换件时**：同 PR 在 replacements.json 登记对照关系，watermark = 当时上游 HEAD。
2. **上游同步 PR（如 merge upstream/main）**：必须跑 `node scripts/upstream-replacement-audit.mjs check`，对每个替换件新出现的上游提交逐项判定——移植到替换件，或 `ack --waive` 登记理由——然后 `ack --watermark` 推进水位；CI 同名 workflow 会拦未过账差异。
3. **已知待办**：登记表 `pending` 列出确认缺失、暂未移植的上游提交，审计时人工消化。

## 关键陷阱（完整清单见 docs/desktop/traps.md）

- **Fork 后必须立即 destroy wrapper**：`fork()` 原地改写 wrapper 内部状态，旧 id 下残留会污染后续 fork 链（`lib/rpc-manager.ts`）
- **ToolCall 字段归一化**：文件格式 `{type:toolCall,id,name,arguments}` vs UI `{toolCallId,toolName,input}`，必须经 `normalizeToolCalls()`（`lib/normalize.ts`）
- **路径比较用 `samePath()`，never `===`**（Windows 大小写/分隔符）；git 输出经 `toNativePath()`；**测试文件同理禁止硬编码本机绝对路径**——本地绿 ≠ CI 绿
- **`enabledModels` 不要字面比较**：委托 `lib/model-scope.ts` 的 SDK `resolveModelScopeWithDiagnostics()`
- **发布走 CI 不走本地**：tag 必须 `poweri-v*`，打 tag 前 npm/shell 测试本地全绿 + Rust CI 绿过；tag 推送即固化不可移，失败只能 bump 重发——流程见 [`docs/desktop/release.md`](docs/desktop/release.md)

## 会话文件格式

`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`，逐行 JSON（session / model_change / message / compaction / session_info）；`entryIds[]` 与 `messages[]` 平行。详见 `docs/desktop/session-file-format.md`。

## Agent 工作流

- Issue tracker：`.scratch/<feature>/` 下 markdown，frontmatter `status: backlog|active|done|wontfix`；triage 标签 `needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix`（见 docs/agents/）
- 域文档：单一 CONTEXT.md + docs/adr/
- CSS 变量（app/globals.css）：`--bg --bg-panel --bg-hover --bg-selected --border --text --text-muted --text-dim --accent --user-bg --tool-bg --font-mono`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
