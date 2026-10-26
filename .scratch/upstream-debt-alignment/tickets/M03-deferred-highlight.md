---
title: M03 高亮预算与延迟高亮
status: done
triage: ready-for-agent
upstream-commit: b2b6a45b
blocked-by: F05（Prism 按需）
---

# M03 高亮预算与延迟高亮

上游提交：b2b6a45b · perf: image caching, subagent relation cache, view-cache sizing, deferred code highlighting (#1181)
涉及文件：poweri/components/MermaidBlock.tsx
阻塞：F05（Prism 按需）

## 问题

一段很长的回复里有大量代码块时，全部同步高亮会卡住主线程，流式输出时尤其明显。

## 现状勘察

基础层 \`lib/highlight-queue.ts\` 已提供高亮预算机制（takeHighlightBudget / waitForHighlight），与上游一致，随合并已到。PowerI 替换件未使用。

## 要做的事

1. 代码块高亮前先申请预算；超出预算的块先以纯文本渲染，等轮到它时再高亮。
2. 流式输出期间不做高亮，结束后再补。
3. 与 F05 的"语言就绪"判定组合：两个条件都满足才高亮。

## 验收

- [ ] 含 20+ 代码块的长回复流式输出不卡顿
- [ ] 超预算的代码块最终仍会高亮（不是永久纯文本）
- [ ] 语言未就绪时不尝试高亮

## 备注

上游这条提交很大（190 行新增），但只有约 10 行落在 MermaidBlock。其余在会话缓存与图片路由（基础层，已同步）。**只移植 MermaidBlock 那部分。**
