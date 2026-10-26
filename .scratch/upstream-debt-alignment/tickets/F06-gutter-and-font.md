---
title: F06 行号栏固定 + 代码字体
status: backlog
triage: ready-for-agent
upstream-commit: c713fcaa
blocked-by: 无
---

# F06 行号栏固定 + 代码字体

上游提交：c713fcaa · fix(file-viewer): keep the line-number gutter pinned and ease the code font (#1200)
涉及文件：poweri/components/FileViewer.tsx
## 问题

长代码横向滚动时行号栏跟着滚走，用户失去行号与代码的对应关系；代码字体偏硬，长时间阅读疲劳。

## 目标

行号栏在横向滚动时固定；代码字体更易读。

## 要做的事

1. 行号栏改为独立定位（sticky 语义），不随内容横向移动。
2. 代码字体与行高按上游口径调整（不新增主题变量，使用现有的 --font-mono 体系）。

## 验收

- [ ] 横向滚动时行号列不移动
- [ ] 竖向滚动时行号与代码行始终对齐（含换行行）
- [ ] 浅色/深色两套主题下行号列对比度可读
- [ ] 不引入新的 CSS 变量

## 备注

纯样式改动，风险最低。可与 F01/F02 并行。
