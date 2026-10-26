---
title: M01 浅色主题去掉代码块双重边框
status: done
triage: ready-for-agent
upstream-commit: cfcf2a1a
blocked-by: 无
---

# M01 浅色主题去掉代码块双重边框

上游提交：cfcf2a1a · fix(chat): drop the light theme's own border inside code blocks
涉及文件：poweri/components/MermaidBlock.tsx
## 问题

浅色主题下代码块看起来有双重边框。

## 原因（上游结论）

Prism 的浅色 vs 主题给 \`<pre>\` 加了 1px #ddd 边框，而代码块外层容器本身已经画了框，于是叠成两圈。

## 要做的事

代码块内层 \`<pre>\` 显式去掉边框，由外层容器独占这道框。

## 验收

- [ ] 浅色主题下代码块只有一层边框
- [ ] 深色主题外观不变
- [ ] 有语言标签头与无标签头两种形态都正常

## 备注

极小改动（上游只有 2 行）。它的价值不在代码量，而在于"账目里这一条终于关掉了"。
