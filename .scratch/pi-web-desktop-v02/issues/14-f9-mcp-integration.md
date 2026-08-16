# 14-f9-mcp-integration

Type: grilling
Status: resolved
Blocked by: 01

## Question

MCP 接入方案的决策（官方净增量，无基础）：

- pi SDK 是否原生支持 MCP（见 01）：支持 → 决策配置 UI（server 列表、stdio/HTTP 参数、启用开关）与管理入口（设置页？）；不支持 → 决策实现路径（pi 扩展机制？自建包装？）与范围裁剪
- v0.2 支持到哪个程度（stdio only？HTTP 也做？）

决策输出：v0.2 MCP 方案（路径 + 范围 + UI 形态）。

## Answer（2026-08-16 用户拍板：不内置，直接用 pi）

**v0.2 MCP 方案：不内置，直接用 pi 生态现成扩展。**

1. **实现路径**：不自研 MCP client——pi 生态已有成熟扩展包（已核实）：`pi-mcp-extension`（生产级，stdio+SSE+streamable HTTP 全支持，全局/项目级 mcp.json，`/mcp` 管理命令）、`pi-mcp-adapter`（功能丰富含 onboarding/上下文管理，**用户本机已安装** ~/.pi/agent/npm/node_modules/pi-mcp-adapter）、`@pi-unipi/mcp`（7800+ server 目录浏览器）等；安装 `pi install npm:<package>`，配置 `~/.pi/agent/mcp.json`（transport/command/args 或 url）
2. **范围**：无范围裁剪问题——社区扩展已覆盖 stdio + HTTP/SSE + WebSocket，超出 v0.2 自研裁剪（stdio only）的水平
3. **UI 形态**：**不需要新 UI**——MCP 扩展以 pi 包安装后，官方 PluginsConfig（/api/plugins，SettingsManager+DefaultPackageManager）已可管理（启用/禁用/移除）；server 管理走扩展自身的 `/mcp` 命令
4. **v0.2 工作项**：零（文档指引即可——spec 里注明推荐包与配置路径）；如需增强（如插件状态面板展示 MCP 工具）随后续版本

**背景**：pi 官方明确无内置 MCP（README「No MCP」），01 调研时结论为「自建/社区扩展唯一路径」——本次核实社区路径已成熟，故自研出局。
