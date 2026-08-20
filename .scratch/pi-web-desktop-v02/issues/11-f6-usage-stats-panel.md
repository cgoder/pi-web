# 11-f6-usage-stats-panel

Type: grilling
Status: resolved
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
