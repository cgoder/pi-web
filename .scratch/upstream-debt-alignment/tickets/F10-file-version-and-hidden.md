---
title: F10 文件版本判重 + 隐藏页释放事件流
status: done
triage: ready-for-agent
upstream-commit: 70b2947c
blocked-by: 无
---

# F10 文件版本判重 + 隐藏页释放事件流

上游提交：70b2947c · fix(sessions): let hidden pages release idle event streams (#1328)
涉及文件：poweri/components/FileViewer.tsx
## 问题

两个相关症状：

1. 切换窗口回来、或 SSE 重连时，文件查看器无条件重新加载并重渲染，即使文件根本没变——画面闪。
2. 页面被隐藏（切到别的标签）时，文件监听的事件流仍占着连接，开很多标签页会耗尽后端连接。

## 现状勘察

基础层已提供（与上游一致，随合并已到）：

- \`lib/file-version.ts\` —— \`fileVersion({size, mtime})\` / \`fileVersionChanged(shown, next)\`
- \`hooks/usePageHidden.ts\` —— \`usePageHiddenFor\` 与宽限常量

PowerI 替换件的多处轮询/流处理里对这些符号引用为 **0**。

## 要做的事

1. 每类查看器（文本、图片、视频、文档）各自记住"屏幕上那一版"的版本串。
2. 收到变更通知时先比版本；相同则直接返回，不 setState、不重渲染。
3. 页面隐藏时释放事件流，回到前台后按版本决定是否需要重新拉取。
4. 不要扩展宽限常量——用基础层已有的值。

## 验收

- [ ] 文件未变时，切窗口回来不触发重渲染
- [ ] 文件在别处被修改后（size 或 mtime 变化）能自动更新
- [ ] 页面隐藏后事件流被释放；回到前台连接恢复
- [ ] 图片/视频/文档查看器同样适用
- [ ] 缝 2 断言：替换件引用 fileVersion、fileVersionChanged、usePageHiddenFor

## 备注

上游这条提交共 799 行新增，其中大部分在 \`hooks/useAgentSession.ts\`（基础层，已同步）。PowerI 只需处理 FileViewer 那一部分（上游 diff 里约 92 行）。**不要把基础层的会话逻辑再搬一遍。**
