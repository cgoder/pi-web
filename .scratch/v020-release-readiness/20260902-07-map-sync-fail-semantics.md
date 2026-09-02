---
title: 07 工单地图口径同步 + 同步失败语义对齐
status: backlog
type: task
labels: [ready-for-agent]
---

## 背景（Spec A4，低）

两处口径漂移：

1. 原 README（skill-repo-updates）工单表仍标 `06 订阅凭据泄露加固 task（backlog）`，但票06 文件已 `status: done` 且 `944faae` 已实施（`toPublicSubscription` 白名单投影、`writeSubscriptions` 0600、clone 后 `set-url` 清凭据、`redactSecrets`）。
2. 票03 文字："同步失败……退回上次已知结果"。实现 `resolveUpdateState()`（`poweri/lib/skill-subscriptions.ts:394,414` 两处 catch）返回 `{}`——badge 直接消失，而非保留上次已知态。

## 要做什么

1. README 工单表 06 行改 done。
2. 同步失败语义对齐票03 原文：catch 时若磁盘缓存仓库仍可读，用陈旧缓存继续判定（即"上次已知结果"）；缓存也不可用才维持现状 fail-soft（返回空 → unknown）。实现前先读 `resolveUpdateState` 两处 catch 的上下文定最小改法。
3. 补测试：mock 同步失败但缓存目录存在 → updateState 仍按缓存内容给出判定，而非空对象。

## 验收

1. `node --test poweri/lib/skill-subscriptions.test.mjs poweri/lib/skill-updates.test.mjs`
2. `node_modules/.bin/tsc --noEmit`
