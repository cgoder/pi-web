# pi SDK 能力盘点（R1：stats / MCP / 权限 / plan 模式）

> 研究日期：2026-02（pi-coding-agent v0.84.2，本机 npm 缓存）
> 对应工单：`.scratch/pi-web-desktop-v02/issues/01-r1-pi-sdk-capabilities.md`（解锁 09 状态栏 / 11 统计面板 / 14 MCP / 15 权限系统）
> 主来源：`/Users/tianzhao/.npm/_npx/3cfb45d95ad33298/node_modules/@earendil-works/pi-coding-agent/`（下称「pi 包」，含 docs/、examples/、dist/*.d.ts），以及本仓库（pi-web desktop 分支）源码。
> 结论先行：**统计数据完备且 pi-web 已在用；MCP 零原生支持；权限只有「项目信任 + 工具 allow-list」，无 allow/ask/deny/YOLO；plan 模式是官方示例扩展而非内置。**

---

## 1. 统计：token / cost / 上下文使用量

**结论：完全可获取，SDK 有三层出口（进程内 API、扩展 API、RPC），且官方 pi-web 已经在消费这些数据。** 不存在「拿不到」的问题，09/11 工单只剩 UI 决策。

### 1.1 SDK 进程内 API（`AgentSession`）

- `AgentSession.getSessionStats(): SessionStats` 与 `AgentSession.getContextUsage(): ContextUsage | undefined`：
  - 定义：pi 包 `dist/core/agent-session.d.ts:174-191`（`SessionStats`：userMessages/assistantMessages/toolCalls/toolResults/totalMessages、`tokens { input, output, cacheRead, cacheWrite, total }`、`cost: number`、`contextUsage?`）、`:615-616`（方法签名）。
  - `ContextUsage` 形状：`{ tokens: number|null, contextWindow: number, percent: number|null }`（pi 包 `dist/core/extensions/types.d.ts:193-199`）。
- 附带的工具函数：`getLastAssistantUsage`、`estimateTokens`、`calculateContextTokens`、`generateSummaryWithUsage`（pi 包 `dist/index.d.ts:5`，来自 compaction 模块）。
- 模型级定价元数据：`models.json` 每条模型带 `cost { input, output, cacheRead, cacheWrite }`（每百万 token 单价，含 inputTokensAbove 分档），见 pi 包 `docs/models.md:207-217` 与 `dist/index.d.ts` 导出；`ModelRuntime` 本身不暴露统计，只暴露模型/凭据管理。

### 1.2 扩展 API

- `ctx.getContextUsage()`：返回当前模型上下文用量（有 usage 用最后一条 assistant usage，否则估算尾部消息），示例 `if (usage.tokens > 100_000)`——pi 包 `docs/extensions.md:1039-1045`。
- usage 记账：工具若做嵌套 LLM 调用，可把 `Usage` 作为 `usage` 返回，pi 会持久化到 tool result 并计入 footer、`/session` 与 RPC session totals——pi 包 `docs/extensions.md:1986`。

### 1.3 RPC 协议（pi-web 实际走的通道）

- `get_session_stats`：返回 token/cost/context 统计——pi 包 `docs/rpc.md:531-572`（`tokens`、`cost` 含 assistant 消息 + 工具 usage + compaction/branch-summary 生成；`contextUsage` 为当前上下文窗口估算，compaction 后可能为 null）。
- 事件流中 `message_update` 顶层带累计 `usage` 字段——pi 包 `docs/rpc.md:954-961`。

### 1.4 会话文件（持久化层面）

- session JSONL 中每条 assistant 消息与 toolResult 消息带 `usage: Usage`（`input/output/cacheRead/cacheWrite/totalTokens` + `cost { input, output, cacheRead, cacheWrite, total }`），compaction 条目带 `tokensBefore`——pi 包 `docs/session-format.md:85-115, 156, 234-259`。

### 1.5 pi-web 现有代码的消费情况（已存在，非空白）

- 类型：`lib/pi-types.ts:11-14`（`ContextUsage`）、`:33-51`（`SessionStatsInfo`）、`:168`（`getSessionStats()`）、`:182`（`getContextUsage()`）。
- 服务端：`lib/rpc-manager.ts:624-630` 处理 RPC `get_session_stats`（透传 SDK `AgentSession.getSessionStats()`）；`:507-525` 在 `get_state` 里带出 `contextUsage`（SDK `getContextUsage()`）。
- 前端：`hooks/useAgentSession.ts:425-461` **客户端逐条汇总每消息 usage**（input/output/cacheRead/cacheWrite/cost）；`:1606-1609` 另走 RPC `get_session_stats` 覆盖；状态栏与统计弹层渲染在 `components/AppShell.tsx:1361-1400`（tokens/cost/上下文百分比 tooltip）与 `:1930-1960`（会话统计面板：token 明细、cost、上下文、缓存命中率）。
- 会话文件解析侧：`lib/session-reader.ts:351` 读取 compaction `tokensBefore`。

---

## 2. MCP（stdio / HTTP）

**结论：pi 不原生支持 MCP——没有 settings.json 字段、没有 CLI 参数、没有内置 client/server。官方立场是「用 Skills 或自建扩展」，但扩展机制可以承载 MCP client。**

### 2.1 主来源（官方明确表态）

- pi 包 `README.md:498`：「**No MCP.** Build CLI tools with READMEs (see Skills), or build an extension that adds MCP support. [Why?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)」。
- pi 包 `docs/usage.md:304`：「It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash. You can build or install those workflows as extensions or packages…」。
- `docs/settings.md` 全表无任何 mcp 字段；`docs/usage.md:174-246` 全部 CLI flags 无 mcp 相关；`dist/` 中无 `modelcontextprotocol` 引用（grep 无命中）。

### 2.2 扩展机制是唯一官方认可的接入路径

- README 的扩展能力清单明确列出「MCP server integration」：pi 包 `README.md:394`（What's possible 列表）。
- 扩展可 `pi.registerTool()` 自定义工具（pi 包 `docs/sdk.md` Custom Tools 节、`docs/extensions.md`），因此 stdio/HTTP MCP client 可以包成工具暴露给 agent；也可注册 slash command、事件钩子等。
- 官方包内**没有** MCP 示例扩展（`examples/extensions/` 无 mcp 文件，grep 无命中），社区扩展/自建是唯一路径。

---

## 3. 权限 / 信任模型

**结论：pi 的权限面 = 「项目信任（project trust）」+「工具 allow-list」，二者都有现成 SDK/RPC 出口；没有 built-in 的 allow/ask/deny 逐工具权限弹窗，没有 YOLO/mode 概念；`--approve` 只覆盖项目信任，不是「批准一切」。逐工具确认需要自建扩展（`tool_call` 拦截），官方示例 `permission-gate.ts` 即此模式。**

### 3.1 信任模型（唯一的「ask」交互）

- `defaultProjectTrust`：`"ask"`（默认）/`"always"`/`"never"`，全局 settings 字段——pi 包 `docs/settings.md:14-18, 57`；`docs/security.md:7-29`（触发条件：`.pi/settings.json`、`.pi/extensions|skills|prompts|themes`、`.pi/SYSTEM.md|APPEND_SYSTEM.md`、项目 `.agents/skills`；决策存 `~/.pi/agent/trust.json`，最近祖先路径优先）。
- `--approve`/`-a`、`--no-approve`/`-na`：**单次运行覆盖项目信任**（非交互模式不弹窗）——pi 包 `docs/settings.md:16, 20`、`docs/security.md:29`。语义 ≠ Claude Code 的 `--dangerously-skip-permissions`。
- 扩展可接管信任决策：`project_trust` 事件，首个返回 `{ trusted: "yes"|"no" }` 的 handler 胜出并抑制内置弹窗，`remember: true` 可持久化——pi 包 `docs/extensions.md:352-380`；官方示例 `examples/extensions/project-trust.ts`（含「Trust and remember / Trust this session / 拒绝」等选择）。
- SDK 出口：`ProjectTrustStore`、`hasTrustRequiringProjectResources`（pi 包 `dist/index.d.ts:25`）、`resolveProjectTrusted()`（`dist/core/project-trust.d.ts:14`）、`ResourceLoaderReloadOptions.resolveProjectTrust`（`dist/core/resource-loader.d.ts:24-28`）。

### 3.2 工具 allow-list（read-only 等预设的底层）

- CLI：`--tools <list>`（严格 allow-list）、`--exclude-tools`、`--no-tools`、`--no-builtin-tools`——pi 包 `docs/usage.md:211-214`。
- 设置：`defaultTools`（`docs/settings.md:231`）。
- SDK：`createAgentSession({ tools, excludeTools, noTools })`——pi 包 `docs/sdk.md` Tools 节（`:526` 附近）；运行时 `setActiveToolsByName`。
- **pi-web `lib/tool-presets.ts:10-13` 的 `PRESET_*` 就是 SDK `tools` 参数的具名组合**：`PRESET_READ_ONLY=["read","grep","find","ls"]`、`PRESET_DEFAULT=["read","bash","edit","write"]`、`PRESET_FULL=[...7 个内置工具]`；在 `lib/rpc-manager.ts:1594-1651` 转成 `tools: toolsOption` 传给 `createAgentSessionFromServices`，`toolNames===[]` 时空 allow-list 并强制清空 system prompt（`rpc-manager.ts:698-700`）。

### 3.3 逐工具「门」（permission gate，需自建）

- `pi.on("tool_call")`：可原地改参（`event.input` 可变），返回 `{ block: true, reason?, terminate? }` 阻止执行——pi 包 `docs/extensions.md:751-795`；类型 `ToolCallEventResult`（`dist/core/extensions/types.d.ts:779-788`）。
- 官方示例：`examples/extensions/permission-gate.ts`（危险命令拦截 + `ctx.ui.confirm`）。
- 明确无内置沙箱/权限弹窗：pi 包 `README.md:498`（「No permission popups. Run in a container, or build your own confirmation flow with extensions」）、`docs/security.md:33`（「Pi does not include a built-in sandbox」）。

### 3.4 官方 pi-web 的 ProjectTrustDialog 背后

- `components/ProjectTrustDialog.tsx`（146 行）是**纯展示组件**（无业务逻辑），调用方先 GET `app/api/project-trust/route.ts:22-28` 查 `getProjectTrustStatus`，确认后 POST `:31-53` 写入信任并销毁该 cwd 的活跃会话。
- 核心在 `lib/project-trust.ts:4-13`：用 SDK 的 `hasTrustRequiringProjectResources` + `ProjectTrustStore(agentDir)` 读写 `~/.pi/agent/trust.json`（与 CLI 共享同一信任存储）；`:40-48` `projectTrustReloadOptions` 把 `resolveProjectTrust` 挂到 ResourceLoader 的 reload 选项上，作为项目资源加载的闸门。
- 即：**ProjectTrustDialog = 官方 `defaultProjectTrust:"ask"` 交互在 web 上的重实现**，接的是 SDK 的 trust store + `resolveProjectTrust` 钩子，而不是任何「工具权限 API」。

### 3.5 mode / YOLO 概念

- 无内置 mode/YOLO。社区/官方示例通过**扩展**实现「模式」：`examples/extensions/preset.ts` 定义命名 preset（provider/model/thinkingLevel/tools/system prompt），经 `presets.json`（全局 + 项目合并）配置，`--preset <name>` 启动、`/preset` 切换、`Ctrl+Shift+U` 循环。

---

## 4. plan 模式

**结论：pi 没有内置 plan/research 模式，但官方提供了完整示例扩展 `examples/extensions/plan-mode/`，挂 UI 所需的全部钩子（命令、flag、工具过滤、事件、widget）都开放。web 端要挂 plan UI = 自建/引入该扩展 + 走 pi-web 已有的扩展 UI 通道。**

### 4.1 主来源

- pi 包 `README.md:498`：「**No plan mode.** Write plans to files, or build it with extensions, or install a package.」；`docs/usage.md:304` 同。
- 官方示例：`examples/extensions/plan-mode/`（README.md + index.ts + utils.ts）：
  - 功能：`/plan` 切换（`registerCommand("plan")`，`index.ts:141`）、`/todos` 进度（`:146`）、`--plan` 启动 flag（`registerFlag("plan")`，`:53`）、`Ctrl+Alt+P`；
  - 只读实现：禁 edit/write 工具 + bash 只读 allow-list（`on("tool_call")` 过滤，`:164`）+ system prompt 注入（`on("context")`、`on("before_agent_start")`，`:177, 201`）；
  - 进度追踪：`Plan:` 编号步骤解析、`[DONE:n]` 标记、widget 显示（`on("turn_end")`/`on("agent_end")`，`:250, 262`）、状态跨会话持久化（`on("session_start")`，`:340`）。
- 可作为「模式」组合的还有 `examples/extensions/preset.ts`（见 3.5）。

### 4.2 可挂 UI 的钩子清单（web 侧）

- 扩展命令/flag → pi-web 已支持：slash 命令列表（`hooks/useAgentSession.ts` slashCommands）、扩展 UI 通道（`components/ExtensionWidgets.tsx`、ExtensionStatusBar、`lib/rpc-manager.ts` createExtensionUiContext）。
- 工具/上下文控制：`tool_call` 拦截（block/改参）、`context`/`before_agent_start` 改 system prompt、`pi.setTools` 类 API 与 `setActiveToolsByName`。

---

## 对 v0.2 决策的含义

- **09 状态栏**：数据源零缺口——`get_state` 已带 `contextUsage`（token/percent/contextWindow），`get_session_stats` 可随时拉 token/cost 明细；决策点只剩「展示哪些、放哪、刷新频率」（官方状态栏按钮实现可参照 `components/AppShell.tsx:1361-1400`）。
- **11 统计面板**：会话级统计现成（SDK `getSessionStats` / RPC `get_session_stats` / 每消息 usage 本地汇总三选一）；「项目级/全局/按天」需要自己聚合 `~/.pi/agent/sessions` 下 JSONL 或自建存储，官方无此能力。
- **14 MCP**：官方零基础，`settings.json`/CLI 均无入口 → 决策必然落在「自建 pi 扩展（stdio client → registerTool）还是引入社区扩展」，v0.2 范围（stdio only？HTTP？）需裁剪。
- **15 权限系统**：allow-list 与项目信任两条现成通道（`tools` 参数 + `ProjectTrustStore`/`resolveProjectTrust`/`project_trust` 事件）可直接映射；allow/ask/deny 逐工具确认与 YOLO/mode 必须自建（`tool_call` 拦截 + preset 扩展模式 + 自定义 UI），且 `--approve` 仅限信任语义，不能当作「跳过所有确认」来宣传。
