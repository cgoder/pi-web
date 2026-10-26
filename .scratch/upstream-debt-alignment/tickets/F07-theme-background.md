---
title: F07 主题切换时代码块背景正确
status: done
triage: ready-for-agent
upstream-commit: 9da54e12
blocked-by: 无
---

# F07 主题切换时代码块背景正确

上游提交：9da54e12 · fix(file-viewer): keep the source view background across theme switches
涉及文件：poweri/components/FileViewer.tsx
## 问题

在浅色与深色主题之间切换时，源码视图的 \`<pre>\` 背景不跟随，出现背景与主题错位或闪烁。

## 原因（上游结论）

Prism 的两套主题用不同属性设置背景：浅色用 backgroundColor，深色用 background。只覆盖其中一个，切换主题时另一个会顶回来。

## 要做的事

1. 源码视图的 \`<pre>\` 由自身持有背景，不依赖 Prism 主题的默认值。
2. 确保写入的是能覆盖两套主题的属性组合。

## 验收

- [ ] 浅色切深色、深色切浅色，代码块背景都正确
- [ ] 切换过程中无闪烁
- [ ] 与 M02（MermaidBlock 的同一问题）口径一致

## 备注

M02 修的是同一个根因，只是发生在聊天里的代码块。两票的实现应保持一致，**不要各自造一套背景变量**。
