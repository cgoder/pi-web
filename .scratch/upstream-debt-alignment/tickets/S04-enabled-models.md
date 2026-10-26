---
title: S04 enabledModels 开关（先勘察，可能无需改动）
status: backlog
triage: ready-for-agent
upstream-commit: 50f6cce9
blocked-by: 无（但必须先勘察再动手）
---

# S04 enabledModels 开关（先勘察，可能无需改动）

上游提交：50f6cce9 · feat(models): enabledModels switches in Settings → Models, as minimal edits (#930)
涉及文件：poweri/components/SettingsPanel.tsx（待确认）
阻塞：无（但必须先勘察再动手）

## 问题

登记表说 PowerI "模型设置为自研面板，未采用上游 enabledModels 开关"。如果为真，用户无法逐项控制哪些模型出现在选择器里。

## 这条的前提可能需要推翻

实测发现：**PowerI 的 SettingsPanel 已经复用上游 ModelsConfig**（第 549 行：sectionHost("models", <ModelsConfig embedded ... />)），而上游 ModelsConfig 内部**已经包含 enabledModels 开关**（EnabledModelsProviderSwitch、EnabledModelsSection、useEnabledModels 等 27 处引用）。

也就是说：**开关很可能早就能用了，只是登记表的理由停留在旧状态。**

## 第一步：勘察（必须先做）

1. 在 /poweri 页面的设置 → 模型 里，实际确认 enabledModels 开关是否可见、可用。
2. 若可用：本票的正确处置是 \`ack --port 50f6cce9 --reason "上游 ModelsConfig 已含 enabledModels 开关，PowerI 已复用该组件，无需改动"\`，**票直接关闭，不写代码**。
3. 若不可用：查明缺的是哪一环（controller 未供给？provider 未传？i18n key 缺失？），再按缺口修。

## 验收

- [ ] 明确结论：开关可用 / 不可用
- [ ] 若可用：登记表该条转 ported，理由写明依据
- [ ] 若不可用：修到可用，并说明缺的是哪一环
- [ ] 无论哪种，都不新建或复制 ModelsConfig

## 备注

这是本批唯一一张**可能以"不改代码"结案的票**。它的价值是纠正账目——审计体系必须能容纳"其实已经做了"这个结论，否则会驱使实现者为了关票而造无用的代码。
