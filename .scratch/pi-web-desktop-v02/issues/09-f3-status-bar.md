# 09-f3-status-bar

Type: grilling
Status: resolved
Blocked by: 01

## Question

常驻状态栏的决策：

- 展示哪些信息：模型/思考等级/上下文/缓存…（哪些数据源可用，见 01 的 SDK 盘点；官方 /api/agent/[id] state 有哪些字段，先读 lib/rpc-manager.ts）
- 放哪：壳 topbar vs fork 内 UI 底部？（架构是单 fork 深改，两者都可行——壳 topbar 只能轮询 /api，fork 内可直接订阅状态）
- 更新频率、点击交互（弹出详情面板？）

决策输出：v0.2 状态栏规格。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 状态栏规格（参考 dsh / deepseek-harness）**：

1. **形态**：**dsh 形态**——统计行挂 composer 上方（跟随输入框滚动视口）+ 发送按钮旁**上下文圆环** + agent 状态点（StateDot 风格）；**07 C 布局的底部常驻栏占位取消**（不画底部栏，省纵向空间）。参照：deepseek-harness `packages/client/ui-conversation/src/client/chat/StatsLine.tsx`（234 行）+ `skeleton/ContextMeter.tsx`（153 行，14px 圆环+点击面板）+ `ui-primitives/StateDot.tsx`
2. **展示内容（只做精确数据）**：turns/steps 计数、缓存命中%（cacheRead/billedInput，get_session_stats 可算）、上下文占用%（getContextUsage）、agent 状态（useAgentSession agentPhase）、token 计数；**耗时/速度类（LLM/工具耗时、TTFT、tps）v0.2 不做**——pi 无原生 duration 字段，不做 timestamp 推算（待 pi 提供后补）
3. **点击交互**：圆环点击 → 上下文详情面板（% / usedTokens / contextWindow + token 明细 input/output/cache，数据 get_session_stats；**不做 dsh 的 system/tools/messages 三段占比**——pi 无 contextBreakdown）；统计行点击 → 复用官方会话统计弹层（AppShell.tsx:1930-1960）
4. **更新频率**：**事件驱动，无轮询**——useAgentSession 现有 sessionStats/contextUsage 状态（rpc-manager.ts:624、useAgentSession.ts:425 已在消费），agent_end/message_update 时刷新；与 PiDeck A2/dsh 一致

**实现要点**：新组件 `components/StatusLine.tsx` + `components/ContextMeter.tsx`（composer 区挂载，改造官方 ChatInput 布局）；数据复用官方统计通道（get_session_stats RPC + get_state contextUsage），不新开通道；07 布局同步——底部栏占位移除（原型已注明）。
