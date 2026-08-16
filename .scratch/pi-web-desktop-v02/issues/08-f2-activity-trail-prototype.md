# 08-f2-activity-trail-prototype

Type: prototype
Status: open
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
