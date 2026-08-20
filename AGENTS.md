# PowerI — Development Notes

PowerI 是基于上游 pi-web 的 fork（desktop 分支）打造的桌面产品：Tauri 壳（src-tauri/ + shell/）+ Next.js 内核，产品层独立于上游（poweri/）。
本文件是 Agent 的核心工作指引（红线、设计理念、关键机制）；细节用渐进式披露链接到 `docs/desktop/`，需要时再读。

## ⛔ 绝对红线：不修改上游 pi-web 源码

动手改任何文件前先确认归属——上游文件（`lib/`、`hooks/`、`app/api/`、`components/`、`bin/`、`app/` 除 `app/prototype/`、`public/`、根目录配置、上游 `docs/adr/0001`）一律禁止修改。判断：

```bash
git cat-file -e origin/main:<path> && echo "上游文件，禁止修改" || echo "desktop 自有，可改"
```

desktop 自有可改：`shell/`、`src-tauri/`、`poweri/`、`scripts/`、`vite.config.ts`、`.scratch/`、`docs/desktop/`、`docs/agents/`、`docs/adr/0002-*`。

上游能力缺失时：新 UI/功能写 `poweri/` 替换式接入；复用上游能力直接 import；配置类用运行时参数/独立配置文件；上游行为缺陷记 `.scratch/` issue 等上游发版同步。
**违反此原则的改动，即使功能正确也会被拒收。**

## PowerI 产品设计理念（所有编码的指导思想）

> 用户（产品负责人）反复表达并亲自拍板的设计哲学。任何功能/修复：**分析方案 → 设计方案 → 实现方案**，三思后行；违反会被要求返工。

1. **以人为本（第一性原则）**：呈现首先服务人——**时间线是主框架、项目是次维度**（天内严格时间升序、不按项目分组——用户并行交替工作；项目用 chip 标识）；点击展开时**行纹丝不动**、详情在行下方全宽展开（横向空间最大化、高度更矮）；小可视化**并排横放**减竖向压力；**可视化优先于数字罗列**（donut/heatmap/mini-bar 是默认呈现，数字是下钻层）。
2. **原型先行**：UI 必须看到效果。先出 2-3 个**结构性变体**（`?variant=` 切换对比）→ 用户拍板 → 设计决策先问清楚再动手 → 胜出设计 capture 到 throwaway 分支（`prototype/<feature>`）→ 才落正式实现。**不经用户确认不得落正式实现。**
3. **上下文感知**：面板行为与用户状态联动（会话内开统计 → 当前会话置首、默认展示）；活动栏互斥语义（VS Code 式：点已激活=收起）。
4. **双模式与默认全量**：同类信息给两种可切换视角（按天↔按工作区 = "找某天的事" vs "找某项目的事"；全局↔历史）；**默认显示全部**，不做筛选下拉，点击行才下钻。
5. **自适应布局**：用 CSS **container queries**（跟随容器宽度，兼容窄面板与未来全屏），不用 `@media`；断点：窄=堆叠 / 中=两列 / 宽=多列。
6. **数据真实可对账**：统计口径与官方/SDK 一致并标注（全文件累计 vs 上下文窗口）；重要数字**实测验证**不报估算；对不上的账查根因（上游缺陷记 issue 不本地改）；性能问题单独立项研究。
7. **视觉细节**：数字**右对齐 + 固定列宽**（整齐右边缘）；时间等宽字体（tabular-nums）固定宽度、Git log 式；天/组头聚合 `N 会话 · X tokens · $Y · 缓存命中 Z%`；费用弱化色、命中率绿色；小圆环并排间距一致、中心显示总计。

## Quick Start

```bash
npm run dev                            # port 30141
node_modules/.bin/tsc --noEmit         # typecheck
npm run lint
# Never run `next build` during dev — pollutes .next/ and breaks npm run dev
# cargo/rustc 已软链 ~/.pi/agent/bin，直接调用；macOS 链接器用系统 /usr/bin/clang
```

## 架构速览

headless 后端（37 个 API 路由，session 经 `lib/rpc-manager.ts` 的进程内 AgentSession 驱动 + SSE 推流）＋ 浏览器前端；Tauri 壳启动 pi-web 并以 iframe 承载（`?cwd=` 参数通信）。完整文件地图见 `docs/desktop/file-map.md`。

## 分层架构

两层：**基础层**（`lib/`、`hooks/`、`app/api/`、低耦合组件 = 上游，跟随合并）+ **PowerI 产品层**（`poweri/` 全部自有，永不参与合并）。核心原则：**替换而非修改**——基础层 `AppShell.tsx` 不动，PowerI 用自己的 AppShell（`poweri/layout/`），入口 `app/poweri/page.tsx`（`/poweri` 路由，上游无此文件零冲突）。详见 [ADR-0002](docs/adr/0002-layered-architecture.md)。

## 关键陷阱（完整 14 条见 docs/desktop/traps.md）

- **Fork 后必须立即 destroy wrapper**：`fork()` 原地改写 wrapper 内部状态，旧 id 下残留会污染后续 fork 链（`lib/rpc-manager.ts`）
- **ToolCall 字段归一化**：文件格式 `{type:toolCall,id,name,arguments}` vs UI `{toolCallId,toolName,input}`，必须经 `normalizeToolCalls()`（`lib/normalize.ts`）
- **路径比较用 `samePath()`，never `===`**（Windows 大小写/分隔符）；git 输出经 `toNativePath()`
- **`enabledModels` 不要字面比较**：委托 `lib/model-scope.ts` 的 SDK `resolveModelScopeWithDiagnostics()`

## 会话文件格式

`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`，逐行 JSON（session / model_change / message / compaction / session_info）；`entryIds[]` 与 `messages[]` 平行。详见 `docs/desktop/session-file-format.md`。

## Agent 工作流

- Issue tracker：`.scratch/<feature>/` 下 markdown，frontmatter `status: backlog|active|done|wontfix`；triage 标签 `needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix`（见 docs/agents/）
- 域文档：单一 CONTEXT.md + docs/adr/
- CSS 变量（app/globals.css）：`--bg --bg-panel --bg-hover --bg-selected --border --text --text-muted --text-dim --accent --user-bg --tool-bg --font-mono`
