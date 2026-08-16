# 01-r1-pi-sdk-capabilities

Type: research
Status: resolved

## Question

pi SDK（`@earendil-works/pi-coding-agent`，本机 npm 缓存内附 docs/）能力盘点，回答四个事实：

1. **统计**：token / cost / 上下文数据是否可获取？（stats API？SessionContext 字段？ModelRuntime？）
2. **MCP**：MCP servers（stdio/HTTP）是否原生支持？配置入口在哪？
3. **权限**：信任/权限模型现状（allow/ask/deny、工具 allow-list、--approve 等价物、有无 YOLO/模式概念；官方 pi-web 的 ProjectTrustDialog 背后接的什么）
4. **plan 模式**：pi 是否有 plan / research 模式钩子可挂 UI（feature-borrowing-matrix 里"先查 pi-web 有无 plan 钩子"）

产出：`docs/desktop/pi-sdk-capabilities-research.md`，逐条给来源（文档路径/源码行）。此工单解锁 09/11/14/15 的决策。

## Findings

- Findings 文档：`docs/desktop/pi-sdk-capabilities-research.md`（pi v0.84.2，逐条含本地路径+行号）
- 统计：✅ 三层出口齐全——SDK `AgentSession.getSessionStats()/getContextUsage()`、扩展 `ctx.getContextUsage()`、RPC `get_session_stats`，会话 JSONL 每消息带 `usage`；官方 pi-web 已消费（rpc-manager.ts:624、useAgentSession.ts:425、AppShell.tsx:1361/1930）
- MCP：❌ 不原生支持（README.md:498「No MCP」、usage.md:304），settings.json/CLI 无入口；唯一路径是自建/引入扩展（registerTool 包 stdio/HTTP client）
- 权限：无 allow/ask/deny/YOLO/mode；现成的是「项目信任」（defaultProjectTrust/trust.json/project_trust 事件/ProjectTrustStore + resolveProjectTrust，官方 ProjectTrustDialog 即此）与「工具 allow-list」（--tools / SDK tools 参数，tool-presets PRESET_* 即 SDK tools 具名组合）；`--approve` 仅覆盖项目信任；逐工具确认需自建扩展（tool_call 拦截，示例 permission-gate.ts）
- plan 模式：无内置（README.md:498「No plan mode」），官方示例扩展 examples/extensions/plan-mode/（/plan、--plan、只读工具集+widget）提供全部可挂 UI 的钩子（registerCommand/registerFlag/tool_call/context/turn_end/agent_end）
