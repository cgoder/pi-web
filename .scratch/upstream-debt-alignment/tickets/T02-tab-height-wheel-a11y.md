---
title: T02 标签 36px 高度 + 滚轮横向滚动
status: backlog
triage: ready-for-agent
upstream-commit: f4adfd04
blocked-by: T01
---

# T02 标签 36px 高度 + 滚轮横向滚动

上游提交：f4adfd04 · fix(files): keep the panel tabs 36px and scroll them with the wheel (#1236)
涉及文件：poweri/components/TabBar.tsx
阻塞：T01

## 问题

在 T01 之后仍有两个遗留：标签条高度在有无滚动条时不一致（跳动）；触控板/滚轮用户无法横向滚动标签条（横向滚动条本身被隐藏）。

## 要做的事

1. 标签条保持恒定 36px，滚动条不改变总高度。
2. 隐藏横向滚动条外观，但保留滚动手感。
3. 鼠标滚轮在标签条上产生横向滚动。

## 验收

- [ ] 有/无滚动条时标签条高度都恰好 36px，无跳动
- [ ] 滚轮在标签条上横向滚动
- [ ] 滚动条本身不显示（但仍可滚）

## 备注

上游把"隐藏滚动条"与"滚轮接管"做成一对：隐藏了滚动条就必须接管滚轮，否则触控板以外的用户彻底没法滚。**不要只做一半。**
