# 04-s2-single-instance-notifications

Type: grilling
Status: open

## Question

单实例 + 系统通知的决策：

- 单实例：二次启动时唤起已有窗口 vs 提示？焦点行为？
- agent 完成通知：触发源（SSE agent_end？/api/agent/running 轮询？）、通知内容（会话名 + 一句话摘要？）、何时不打扰（前台聚焦时？）
- 开关位置（壳设置？本地存储？）

决策输出：v0.2 单实例 + 通知规格。
