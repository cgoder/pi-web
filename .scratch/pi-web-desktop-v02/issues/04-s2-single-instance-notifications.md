# 04-s2-single-instance-notifications

Type: grilling
Status: resolved

## Question

单实例 + 系统通知的决策：

- 单实例：二次启动时唤起已有窗口 vs 提示？焦点行为？
- agent 完成通知：触发源（SSE agent_end？/api/agent/running 轮询？）、通知内容（会话名 + 一句话摘要？）、何时不打扰（前台聚焦时？）
- 开关位置（壳设置？本地存储？）

决策输出：v0.2 单实例 + 通知规格。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 单实例 + 通知规格**：

1. **单实例**：`tauri-plugin-single-instance` 标准行为——二次启动 → 第一实例收事件 → **唤起并聚焦主窗口**（最小化/隐藏到托盘时恢复显示）。无提示弹窗
2. **完成通知触发源**：壳侧订阅 `GET /api/agent/running/events` SSE 流，running 会话集合**从非空→空**即 agent 完成 → 发系统通知。零 web 代码改动、无轮询（与 03 原则一致）；通知权限走 `tauri-plugin-notification`（macOS 首次弹权限由系统处理）
3. **通知内容**：**会话名 + 完成时间**（壳在触发时 `GET /api/sessions` 把 id 映射为会话名：「三栏布局原型设计 · 已完成」）；一句话摘要 v0.2 不做（需解析会话内容，留待后续）
4. **不打扰条件**：窗口可见且聚焦 → 不发通知（用户在看着）；最小化/隐藏/后台 → 发。**无开关**（默认开，保持简洁）；macOS 额外尊重系统「勿扰模式」（系统通知 API 自动处理）

**实现要点**：Cargo.toml 加 `tauri-plugin-single-instance` + `tauri-plugin-notification`；单实例插件回调里 show+set_focus（复用 03 的显示逻辑）；SSE 订阅用壳内 HTTP client（reqwest 或轻量实现），断线自动重连（服务重启后恢复订阅）；与 03 托盘联动——单实例唤窗与托盘显示窗口走同一函数。
