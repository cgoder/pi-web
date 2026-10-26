---
title: F03 超 256KB 的 HTML 文件仍可预览
status: done
triage: ready-for-agent
upstream-commit: 93b3aba5
blocked-by: F02（共用分块加载链路）
---

# F03 超 256KB 的 HTML 文件仍可预览

上游提交：93b3aba5 · feat(files): preview HTML files larger than one 256 KB chunk (#1155)
涉及文件：poweri/components/FileViewer.tsx
阻塞：F02（共用分块加载链路）

## 问题

HTML 文件超过一个分块大小（256 KB）后，预览模式直接降级/失效，用户只能看源码。

## 目标

大 HTML 仍能预览：先给分块内容，再单独拉取完整内容喂给 iframe。

## 现状勘察

上游做法是引入一个「HTML 预览上限」常量并在预览分支里区分 truncated 与完整文本；完整内容走单独请求。基础层的 \`lib/file-types.ts\` 已有该上限常量（随合并已到），PowerI 替换件未使用。

## 要做的事

1. 预览模式判定不再被 truncated 一刀切掉。
2. 分块内容用于源码视图；预览视图按需拉完整 HTML。
3. 完整内容只在用户切到预览时请求，不要一打开就拉。

## 验收

- [ ] 超过单块大小的 HTML 仍能切到预览并正确渲染
- [ ] 未切预览时不发完整内容请求
- [ ] 源码视图仍分页（F02 的行为不被破坏）

## 备注

上游这条改动同时给 \`components/FileViewer.test.mjs\` 加了断言。**不要照搬那个测试文件到 poweri/**（会变成第二份需要同步的资产）；改为在缝 2 加一条接线断言，纯逻辑部分复用基础层已有测试。
