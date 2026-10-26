---
title: S01 设置里接入 MCP 配置与信任流程
status: backlog
triage: ready-for-agent
upstream-commit: 8716e708、92489b77、eeda8624、ce615e7c
blocked-by: 无
---

# S01 设置里接入 MCP 配置与信任流程

上游提交：8716e708、92489b77、eeda8624、ce615e7c · 四条 MCP 相关提交（列表、信任、粘贴添加、/mcp 跳转）
涉及文件：poweri/components/SettingsPanel.tsx
## 问题

PowerI 的设置面板没有 MCP 分区。用户无法查看有哪些 MCP 服务器、无法信任某个项目、无法通过粘贴配置添加服务器、也没有 /mcp 快捷入口跳到设置。

## 现状勘察

上游把整套 MCP 设置 UI 都做完了，且**已随合并进了基础层**（与上游逐字节一致）：

- \`components/McpConfig.tsx\` —— 支持 embedded 模式，接受 cwd、trust、onTrustProject、onProjectTrustChanged、onClose
- \`components/mcp-config-helpers.ts\`、\`components/mcp-add-helpers.ts\`、\`lib/mcp-add.ts\`、\`lib/project-trust.ts\`
- MCP 相关 API 路由

PowerI 的 SettingsPanel 里 McpConfig 出现次数为 **0**，分区列表里也没有 MCP 项。

## 为什么四条合并成一票

四条上游提交是**同一条能力链**：列表 → 信任 → 添加 → 快捷入口。分开做会出现"能看到列表但点信任没反应"这种半成品状态，无法独立验收。

## 要做的事

1. 在 PowerI 的设置分区列表里新增 MCP 分区，位置按 PowerI 信息架构定（建议在 agents 之后）。
2. 渲染上游 McpConfig 的 embedded 形态，供给 cwd、trust、onTrustProject、onProjectTrustChanged。
3. 信任对话框的调用链路接到 AppShell 已有的 ProjectTrustDialog（PowerI 已有该组件）。
4. /mcp 斜杠命令跳到设置 MCP 分区——上游已在 \`hooks/useAgentSession.ts\`（基础层）实现跳转意图，PowerI 只需在 AppShell 消费该意图并打开设置面板。

## 验收

- [ ] 设置里出现 MCP 分区，能列出当前项目的 MCP 服务器
- [ ] 能从设置里信任一个项目的 MCP 服务器
- [ ] 能粘贴一段配置添加服务器，添加后可立即看到
- [ ] /mcp 打开设置面板并停在 MCP 分区
- [ ] 无项目上下文时该分区不崩溃（与其他 requiresProject 分区行为一致）
- [ ] 缝 2 断言：SettingsPanel 引用 McpConfig，且上游对照文件仍导出该组件

## 备注

**禁止复制 McpConfig**（627 行）。它已经是 embedded 就绪的上游叶子组件，复制会产生第二份需要同步的资产。

i18n：MCP 相关文案上游已加进三语表，基础层已有，直接复用 key。
