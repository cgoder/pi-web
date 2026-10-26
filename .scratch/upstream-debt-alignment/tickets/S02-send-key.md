---
title: S02 发送键切换（Enter / Ctrl+Enter）
status: done
triage: ready-for-agent
upstream-commit: 5df8278a
blocked-by: 无
---

# S02 发送键切换（Enter / Ctrl+Enter）

上游提交：5df8278a · feat(settings): configurable send key (Enter or Ctrl+Enter) (#1001)
涉及文件：poweri/components/SettingsPanel.tsx、poweri/components/ChatInput.tsx
## 问题

PowerI 的输入框只能用固定的发送键，用户无法按自己的习惯切换 Enter / Ctrl+Enter。

## 现状勘察

基础层 \`hooks/useEnterSendMode.ts\` 已提供该能力（与上游一致，随合并已到）。PowerI 两处替换件均未使用。

## 要做的事

1. 在 PowerI 自有的常规设置页加一个二选一控件（Enter 发送 / Ctrl+Enter 发送）。
2. 输入框的键盘处理改为读取该 hook 的模式。

## 验收

- [ ] 设置为 Enter 发送时，Enter 发送、Shift+Enter 换行
- [ ] 设置为 Ctrl+Enter 发送时，Enter 换行、Ctrl+Enter 发送
- [ ] 设置持久化，刷新后保持
- [ ] 缝 2 断言：两处替换件都引用 useEnterSendMode

## 备注

**这条要注意仓库既有的豁免口径**：PowerI 对上游设置项一贯是"吸收逻辑开关、不移植上游样式"（见 SettingsPanel 的豁免登记 7047460e）。因此本票要照 PowerI 的设置页视觉规范做控件，**不要照搬上游 \`app/settings.css\` 里的样式**。

## 实际结论

与票面一致：基础层 `hooks/useEnterSendMode.ts` 已就位，PowerI 的 `SettingsPanel` 与 `ChatInput` 两端都未使用。
落地为**数据驱动**的选项表而不是两个写死的按钮：

- 设置侧 `sendKeyOptions: { id: EnterSendMode; label: string }[]`（`SettingsPanel.tsx:179-182`），
  `onChange={() => setEnterSendMode(option.id)}`（`:266`）；
- 输入框侧读同一 hook（`ChatInput.tsx:29/526`），`sendShortcut` 依 `enterSendMode === "ctrlEnter"`（`:1273`），
  且把 `enterSendMode` 放进依赖数组（`:1405`）——漏了依赖会切完设置仍用旧判定。

提交 `1222d065` + `41036c81`；断言见 `SettingsPanel.behaviour.test.mjs` 与
`poweri/lib/replacement-wiring.test.mjs`「发送键切换」。
