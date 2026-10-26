---
title: S03 Code mode 工具设置
status: backlog
triage: ready-for-agent
upstream-commit: 1c387b47
blocked-by: 无
---

# S03 Code mode 工具设置

上游提交：1c387b47 · feat(tools): write the Code mode choice through /api/tools/settings
涉及文件：poweri/components/SettingsPanel.tsx
## 问题

PowerI 设置里没有 Code mode 的工具选择入口，用户只能靠记忆它的 API 或直接改文件。

## 现状勘察

基础层已就绪（与上游一致，随合并已到）：

- \`lib/codemode-settings.ts\` —— 读写的单一来源
- \`app/api/tools/settings/route.ts\` —— 该提交已把写入路径统一到这里
- \`lib/global-settings-file.ts\` —— 底层文件读写

## 要做的事

1. 在设置里增加 Code mode 相关分区或区块（与上游语义一致，位置按 PowerI 信息架构定）。
2. 读写一律走 /api/tools/settings，**不要直接改 settings.json**——这正是上游那条提交修掉的问题。
3. 复用 codemode-settings 的类型与校验。

## 验收

- [ ] 设置里能看到并切换 Code mode 的工具选择
- [ ] 切换后立即生效（不需要重启会话）
- [ ] 写入走 API 路由，不直接触碰配置文件
- [ ] 缝 2 断言：SettingsPanel 引用 codemode-settings 或对应 API 路径

## 备注

上游该提交还重构了 PowerShell 设置与全局设置文件的读写，那些在基础层已完成，本票不要重复。
