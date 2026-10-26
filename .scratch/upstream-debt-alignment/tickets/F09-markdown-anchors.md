---
title: F09 站内锚点跳转与桌面协议链接
status: backlog
triage: ready-for-agent
upstream-commit: 5af2e04e、2cefb72f
blocked-by: 无
---

# F09 站内锚点跳转与桌面协议链接

上游提交：2cefb72f · fix(markdown): land in-page fragment links after the sanitizer's prefix (#1323)
         5af2e04e · feat(markdown): keep links to common desktop apps (obsidian://, vscode://, zoommtg://) (#1108) (#1118)
涉及文件：poweri/components/FileViewer.tsx、poweri/components/MarkdownBody.tsx
## 问题

两个相关症状：

1. 点击 Markdown 里的站内锚点（\`#some-heading\`）跳不到正确标题——因为 HTML 净化器会给 id 加前缀，直接按原始 id 查找必然落空。
2. 指向桌面应用的链接（obsidian://、vscode://）被链接过滤器移除，用户点不动。

## 现状勘察

基础层 \`lib/markdown.ts\` 已提供（与上游一致，随合并已到）：

- \`jumpToMarkdownFragment\`
- \`isExternalMarkdownHref\`
- \`markdownAppUrlTransform\`

PowerI 两个替换件里均未使用。

## 要做的事

1. 锚点点击走基础层的 jumpToMarkdownFragment，由它处理净化器前缀。
2. 桌面协议链接走 markdownAppUrlTransform / isExternalMarkdownHref 判定，不再被当普通外链过滤。
3. FileViewer 的 Markdown 预览与 MarkdownBody 用同一套判定，避免两处行为分叉。

## 验收

- [ ] 点击站内锚点跳到正确标题
- [ ] obsidian://、vscode:// 等链接保留且可点
- [ ] 普通外链行为不变
- [ ] FileViewer 与 MarkdownBody 两个入口行为一致
- [ ] 缝 2 断言：两个替换件都引用基础层这三个符号

## 备注

两处上游提交合并成一票的原因：它们改的是**同一个判定函数**（`lib/markdown.ts` 的 href 处理）。只做锚点会让桌面协议链接仍被过滤；只做协议链接会让锚点仍跳错。分开验收无法得到一致行为。

**本票会触及 `poweri/components/MarkdownBody.tsx`，但不关闭它自己的 9 条欠账。** MarkdownBody 属第二批，本票只改它的 href 判定那一行。收尾时（X01）不要把 MarkdownBody 的其他 pending 一并标记为已处置。

上游把锚点逻辑放进了 \`lib/markdown.ts\`。**不要新建 lib/markdown-anchors.ts**——基础层没有该文件，新增即越界（该文件曾在上游出现过但已并入 markdown.ts）。
