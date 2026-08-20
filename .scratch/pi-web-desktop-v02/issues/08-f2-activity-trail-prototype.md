# 08-f2-activity-trail-prototype

Type: prototype
Status: resolved
Blocked by: 02

## Question

活动轨迹聚合（思考/工具调用/回答分段）怎么呈现？产出粗糙原型供讨论（/prototype skill）：

- 分段模型：哪些事件分哪些段（思考、工具调用、回答；官方 SSE 已有工具调用进度事件，先读 hooks/useAgentSession.ts 确认事件面）
- 展示形态：时间线？折叠块？每段标题/图标？
- 与现有流式渲染的融合（不破坏打字机效果）
- 参考：02 的 PiDeck 轨迹聚合细节

决策输出：v0.2 活动轨迹的呈现规格。

## 原型（2026-08-16 产出）

- **位置**：`app/prototype/trail/`（page.tsx + variants.ts + switcher.tsx + variant-v1/v2/v3.tsx + shared.tsx + data.ts + trail-prototype.css），复用 F1 活动栏外壳（import 07 的 layout-prototype.css）；throwaway 快照同 `prototype/f1-layout` 分支
- **运行**：`http://127.0.0.1:30141/prototype/trail?variant=1`（换 2/3 或浮动条 ←→）
- **三变体**：1 折叠账本（turn 聚合展开列表，最贴近官方现状）；2 车道时间线（横向三车道思考/工具/回答，块宽∝时长，PiDeck 式）；3 概览下钻（聚合统计卡 总耗时/思考占比/工具数/字数 → turn 明细 + 内嵌迷你时间线条）
- **已覆盖交互**（playwright 实测通过）：turn 展开/折叠、段点击 → inspector（工具参数/结果预览/耗时）、live 段脉冲指示、V2 块点击高亮+标尺、V3 聚合条
- **截图**：`temp/prototypes/f2-trail/variant-{1,2,3}.png`（未提交）

## 官方事件面事实（Explore 报告）

- SSE：`thinking_start/delta/end`（end 带全文 content）、`toolcall_start/delta/end`（delta 拼 rawInput，end 落 input）、`tool_execution_start/update/end`（update 带 partialResult 进度）——hooks/useAgentSession.ts:1022-1256、lib/streaming-message.ts:60-140
- **无 duration/startedAt 字段**：时长渲染端推算——thinking=prevTimestamp→message.timestamp（MessageView.tsx:634），toolCall=message.timestamp→toolResult.timestamp（:643）；轨迹面板沿用同一推算即可
- 现有渲染：ThinkingBlock（折叠+时长 s）、ToolCallBlock（工具名+input 预览+时长+chevron）、toolResult 配对渲染不独立展示；消息结构无 plan 块
- 仓库无 trajectory/timeline/activity 代码 → 轨迹面板是净新增（数据源=同一消息流，不另开通道）
- 含义：live 轨迹可订阅同一 SSE 事件流（thinking/toolcall/tool_execution 增量），**不影响现有打字机渲染**（面板是独立投影）；时长推算有现成先例

## Answer（2026-08-16 用户拍板）

**Winner：车道时间线（V2 形态）；实现 = 直接照搬 deepseek-harness 的轨迹功能。** 用户确认 V2 与 https://github.com/deepseek-ai/deepseek-harness 的「轨迹」几乎一模一样，指示直接照搬。

**来源**：`deepseek-harness/packages/client/ui-trajectory`（@deepseek-ai/dsh-client-ui-trajectory v0.1.0-rc.5，**MIT**），克隆于 temp/research/deepseek-harness（浅克隆）

**功能全貌**（README 摘要）：turn 感知事件账本（User/Assistant/Tool/嵌套 Subtool，粗线标 turn 边界）+ 固定 Overview 时间线（Chrome Network 式，记录 start/duration 从左到右投影，TTFT 与解码分段）+ 选择 inspector（token 用量/耗时/Input/Output/Timing）+ @tanstack/react-virtual 虚拟滚动（仅挂载可见行窗）+ 缩放/平移/区间选择（拖拽区间→账本聚焦）/右键清选 + 流式更新尾随（上滚暂停跟随）+ 搜索/折叠 + Request 合计

**照搬可行性评估（已逐项核实源码）**：
- 组件层 ~4600 行：TrajectoryView(506)/Timeline(730)/Table(3074)/Turn/Cell/Toolbar + snapshot-builder/virtual-rows/duration-store/timeline/contract + 12 个 CSS modules
- 运行时外部依赖**仅** `@tanstack/react-virtual` + `diff`（structuredPatch）；cordis 8 处 import **全部是 `import type { Context }` 纯类型**（可替换为本地类型，零运行时成本）；ui-primitives 仅 Tooltip + 1 图标（本地 mini 实现）
- React 19 兼容：peerDep ^18.2.0 需放宽（代码用 18 API，兼容 19）
- 数据契约：TrajectorySnapshot（eventNodes/requests/callSchemas/partial/runningCalls）深度绑定 dsh-client-runtime 类型 → **需写 pi adapter**：事件节点←jsonl 消息条目、requests←agent 运行、partial/runningCalls←SSE 流式态；usage/timestamp 字段现成，时长推算沿用官方先例（MessageView.tsx:634/643）
- 挂载：作为 F1 活动栏面板（C 布局），conversation slot 注册机制简化为 props 直传

**实现路径（v0.2）**：① vendor 拷贝 ui-trajectory 源码 → 替换 cordis/ui-primitives 引用、加两依赖、放宽 React peer；② `lib/trajectory-adapter.ts` 映射 pi 数据 → TrajectorySnapshot；③ 活动栏「轨迹」面板挂载 + 订阅官方 SSE 事件面（thinking/toolcall/tool_execution 增量）实现 live 尾随。原型 V1 账本/V3 概览弃用（快照保留在 prototype/f1-layout 分支作对照，V1 的 turn 账本与官方 ledger 同构，不必自研）

## 决策更新（2026-08-19，用户拍板）

**F2 形态改为：照搬 dsh ui-trajectory，替换 pi-web 的「完整历史」呈现**（替代原"活动栏新增面板"方案）：

- 用户确认：轨迹面板与 pi-web「完整历史」同类（回看会话历史），dsh 轨迹是交互式超集（turn 账本 + 时间线 + inspector + 搜索）
- **实现形态**：poweri AppShell 副本中 `handleViewFullHistory` 从"打开静态 HTML 新标签页"改为"打开轨迹视图"（右抽屉/模态，宿主形式实现期定）；不新增活动栏图标
- **分层**：/poweri 完整历史 → 轨迹视图（产品层）；/ 完整历史 → 静态 HTML（基础层原版，跟随上游）
- **适配层**：`lib/trajectory-adapter.ts` 把 pi 会话 .jsonl 数据 → TrajectorySnapshot（usage 现成、时长推算沿用 MessageView.tsx:634/643）
- **vendor**：ui-trajectory ~4600 行 MIT 源码到 poweri/vendor/，替换 cordis 纯类型/ui-primitives 依赖，放宽 React 19 peer（风险 #2 冒烟）
- **前置依赖**：Phase 3 fork 已完成（26），F1 活动栏完成后有宿主可挂；或直接以右抽屉为宿主（不依赖 F1）
