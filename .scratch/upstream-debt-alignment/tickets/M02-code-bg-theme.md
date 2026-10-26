---
title: M02 主题切换时代码块背景正确
status: backlog
triage: ready-for-agent
upstream-commit: e2ea7da3
blocked-by: 无
---

# M02 主题切换时代码块背景正确

上游提交：e2ea7da3 · fix(markdown): preserve code backgrounds across theme changes (#1060)
涉及文件：poweri/components/MermaidBlock.tsx
## 问题

切主题时代码块背景不跟随或出现两套背景打架。

## 原因（上游结论）

与 F07 同源：Prism 浅色主题用 backgroundColor，深色用 background。只覆盖一个，另一个会在切换后顶回来。

## 要做的事

代码块由自身 \`<pre>\` 持有背景，并确保覆盖两套主题使用的属性。

## 验收

- [ ] 浅色 ↔ 深色切换，代码块背景正确
- [ ] 与语言标签头、行内代码的背景层级协调
- [ ] 与 F07 的实现口径一致（同一个根因，不要两套解法）

## 备注

与 F07 应**同一个人、同一轮**做，避免产出两种风格不同的背景处理。
