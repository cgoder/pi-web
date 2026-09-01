---
id: 2
title: "feat(models): place LITTA as the first item in CUSTOM section of Add Provider picker"
status: pending
blockedBy: []
---

# 任务目标
严格遵循上游 ModelsConfig 样式心智：
1. 在 `AddProviderPicker` 中将 `CUSTOM` 分区置于顶部。
2. 将 `LITTA` 作为 `CUSTOM` 分区排在第一位的首选项，图标使用应用默认图标。
3. 点击 LITTA 后，快速初始化预置配置（Base URL: `https://llms.litta.cn/`，API: `openai-completions`）并选中进入详情页。
4. 详情页支持填写 Key 并通过 Fetch Models 动态拉取全量模型。
