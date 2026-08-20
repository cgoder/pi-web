# 11-f6-usage-stats-panel

Type: grilling
Status: done
Blocked by: 01

## Question

使用统计面板的决策：

- 展示哪些指标：token / cost / 上下文（数据源可用性见 01；官方 stats 数据在哪，读 lib/ 确认）
- 统计范围：会话级 / 项目级 / 全局？时间维度（本次/今日/累计）？
- UI 形态与入口：右分屏 tab？状态栏详情？独立页面？
- 数据存储：本地计算（~/.pi/agent 文件）vs 服务端聚合，隐私

决策输出：v0.2 统计面板规格。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 统计面板规格**：

1. **cost 策略**：**全局/项目级不做 cost**——会话级 cost 现成（get_session_stats，官方 topbar 已在显示）；全局聚合算不出（session 文件无价格信息，02 确认）；不做自建快照存储
2. **范围与维度**：**ct-jyjntc 全套全局统计**——总量（tokens/会话数/消息数/活跃天数）+ 连续天数 streak + 模型占比 + 趋势柱状图（7-365 天可调，按模型分段着色）+ 26 周热力图；不做项目级维度（v0.2）
3. **数据来源**：**JSONL 流式解析 + 缓存**——服务端 `GET /api/usage`：逐行 substring 提取 timestamp/role/usage.totalTokens/model（不整行 JSON.parse）+ 按 size:mtime 签名只重解析变更文件 + soft 45s / hard 15min TTL + agent_end 后前端 debounce 失效刷新（ct-jyjntc 全套实现：app/api/usage/route.ts、components/UsagePanel.tsx，实测可用）
4. **入口与形态**：**活动栏「统计」面板**（07 已定图标集含统计）——面板内顶部聚合卡 + 趋势图 + 热力图 + 模型占比；会话级统计不走此面板（官方 topbar 按钮已覆盖）

**实现要点**：照 ct-jyjntc 移植 `app/api/usage/route.ts`（适配本仓库 session 目录路径 ~/.pi/agent/sessions 与 API 风格）+ `components/UsagePanel.tsx`（活动栏面板容器内）；图表用轻量自绘或引入现有依赖；与 09 状态栏数据互补（09 会话级、11 全局）。

## 移植记录（2026-08-20，desktop 分支）

**入口后置**：本工单只交付「统计面板功能」本身（API + 组件 + 样式 + 单测），
**不接活动栏入口**。活动栏挂载点由 26-poweri-appshell-fork 的活动栏改造承接，
届时 import `poweri/features/UsagePanel`（已导出 `prefetchUsage`/`invalidateUsage`
供预热与 agent_end 后失效刷新接线）。

**移植文件清单（源 ct-jyjntc → 目标 pi-web desktop）**：

| 源 | 目标 | 说明 |
| --- | --- | --- |
| `app/api/usage/route.ts` | `app/poweri/api/usage/route.ts` | Next.js 薄包装（参数解析 + JSON）；聚合纯逻辑拆到 `poweri/lib/usage-stats.ts` 以便单测 |
| `app/api/usage/route.ts` 纯逻辑 | `poweri/lib/usage-stats.ts` | parseSessionFile / mergeSlices / buildAggregate / getAggregate / summarizeUsage（响应整形），soft 45s / hard 15min TTL、size:mtime 签名缓存、并发合并全保留 |
| `lib/session-reader.ts` 的 listSessionFiles + SessionFileStat、`lib/agent-dir.ts` 的 getAgentDir、readSessionHeader | `poweri/lib/session-files.ts` | 独立成文件，SDK-free（不 import pi-coding-agent，避免 /poweri/api/usage 冷启动加载 SDK 模块图）；readSessionHeader 内联一份（目标 lib/session-reader.ts 顶层 import SDK，不能引用） |
| `components/UsagePanel.tsx` | `poweri/features/UsagePanel.tsx` | 6 张 StatCard + 26 周热力图 + 7/30 天趋势条 + 模型占比 SVG 环形图（e30bc0d 版形态，对应本工单「顶部聚合卡 + 模型占比」拍板）；useLocale→自带中文文案、settings-ui 包装→div、apiFetch→fetch |
| `app/globals.css` usage 段 | `poweri/styles/usage-panel.css` | 作用域收在 .poweri-usage 下；--radius-*/--destructive 目标无 → 字面值 + 私有变量 |

**适配点**：不依赖 useLocale / settings-ui / api-transport / lucide 图标（零新增依赖）；
图表全 CSS/SVG 自绘，与 ct 一致。

**验证**：`node --experimental-strip-types --test poweri/lib/usage-stats.test.mjs`
3/3 通过（临时 PI_CODING_AGENT_DIR + 合成 .jsonl：按日聚合/streak/models/trend/heatmap、
soft TTL 秒回、force 感知文件变更、substring 提取）；`tsc --noEmit` poweri 零错误；
`npm run lint` poweri 零问题；dev 起服 curl `GET /poweri/api/usage?days=7` 200
（totals/streak/topModel/models/trend/heatmap 结构校验全过），二次 curl 5ms soft-TTL 命中。

## 原型（2026-08-20，throwaway 分支）

活动栏面板 / Topbar 抽屉 / 独立整页三变体原型（app/prototype/usage，?variant=A|B|C + 底部切换条），
**已 capture 到 throwaway 分支 `prototype/usage-stats-f6`（commit d85be94）**，desktop 不再保留原型代码。

## 胜出设计（用户确认 2026-08-20）

1. **入口**：活动栏面板（variant A）——图标列 + 侧边统计面板；面板可再扩展其他活动栏入口/全屏页
2. **双视图**：全局统计（ct-jyjntc 全套：聚合卡/热力图/趋势/模型圆环）+ 历史会话
   - 历史会话：默认显示全部会话列表（token 迷你条可视化，无性能问题——批量摘要 API 复用 usage 文件缓存），点击行下钻三栏详情
   - 详情层：会话信息（文字）+ 消息/Token（SVG 圆环 + 明细列表 + 百分比），减少数字负累
3. **自适应**：容器查询（container-name poweri-usage / poweri-stats），窄面板上下堆叠、宽容器横向多列；聚合卡窄 2 列兜底 1 列
4. **数据**：`/poweri/api/usage`（全局）+ `/poweri/api/session-summaries`（每会话 token/消息）+ `/poweri/api/session-stats/[id]`（离线三栏 stats）

## 正式实现（2026-08-20 提交 a8300fd）

- poweri/features/ActivityBar.tsx：活动栏（会话/文件/统计，F1）
- poweri/features/StatsPanel.tsx：双视图容器
- poweri/features/SessionListPanel.tsx：历史会话列表 + 圆环详情
- poweri/lib/usage-stats.ts：summarizeBySession（复用文件缓存按会话归并）
- app/poweri/api/session-summaries/route.ts：批量会话摘要 API
- poweri/layout/AppShell.tsx：活动栏挂载 + 右侧面板 files|stats 双模式互斥
- 浏览器验收：/poweri 全流程通过（面板切换/双视图/圆环/自适应 1↔2↔3 列）

## 历史会话时间线形态（2026-08-20 用户定稿）

原型 `prototype/history`（变体 A 时间线树 / B 单行扁平）**已 capture 到 throwaway 分支 `prototype/history-timeline`**。
胜出设计 = 变体 B + 用户三点修正（时间前置 / 天内扁平时间线 / 行下全宽展开详情）：

1. **面向人**：时间线是主框架（工作路径），项目是次维度——天内严格时间升序、不按项目分组（交替并行工作自然呈现），项目 chip 标识
2. **双模式**：按天（默认，天头聚合 会话数/tokens/费用/缓存命中率）| 按工作区（该项目的专属时间线，区内降序，跨天带日期）
3. **行展开**：session 行本身不变，详情在行下方全宽展开（圆环并排，宽度 = 行宽，实测 251px→393px 列宽提升）
4. **详情并排**：消息/Token 圆环固定 2 列并排（高度 -40%），会话信息在上方

正式实现（提交 5f7b2a2 待定）：
- poweri/lib/session-groups.ts：分组/格式化/聚合纯逻辑（groupByDayFlat/groupByWorkspace/dayLabel/groupCacheHitRate 等）
- poweri/features/SessionListPanel.tsx：时间线面板（TimelineRow 行下展开）+ SessionStatsView/SessionDetail（圆环并排）
- poweri/styles/usage-panel.css：poweri-tl-* 样式
- 数据：/poweri/api/session-summaries 已带 input/cacheRead/cacheWrite/cost（9c77190）

性能待办：issues/27-history-performance-research.md（即时 jsonl 解析 vs 本地数据库缓存）
