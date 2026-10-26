---
title: F05 Prism 语言按需加载（MermaidBlock + FileViewer）
status: backlog
triage: ready-for-agent
upstream-commit: 046bc67e
blocked-by: 无（其余 Prism 相关票均依赖本票）
---

# F05 Prism 语言按需加载（MermaidBlock + FileViewer）

上游提交：046bc67e · perf(chat): load Prism languages on demand (#1183)
涉及文件：poweri/components/MermaidBlock.tsx、poweri/components/FileViewer.tsx
阻塞：无（其余 Prism 相关票均依赖本票）

## 问题

PowerI 的 \`MermaidBlock\` 用 \`react-syntax-highlighter\` 的完整 Prism 包，等于把全部语法高亮语言打进首屏。客户端启动时加载量明显偏大，聊天首屏渲染被拖慢。

## 目标

让 Prism 语言在真正需要时才加载；流式输出的代码块在语言就绪后自动补上高亮。

## 现状勘察

上游已经把该能力实现好，且**已经随合并进了基础层**（与上游逐字节一致）：

- \`lib/prism-languages.ts\` —— \`loadPrismLanguages()\` / \`prismLanguagesLoaded()\`
- \`hooks/usePrismLanguages.ts\` —— \`usePrismLanguages(enabled)\` 返回 ready 布尔

PowerI 替换件里这两个符号出现次数为 **0**。所以这是纯接线工作，不是重新实现。

## 要做的事

1. 把替换件的语法高亮入口从完整 Prism 包切到 \`prism-light\`，复用 \`usePrismLanguages\`。
2. 高亮的首次判定要等语言就绪（不要在未就绪时就把 highlighted 置为真，否则会渲染出无高亮的成品）。
3. 流式场景：语言的加载从第一个代码块就开始，而不是等流结束。
4. FileViewer 的源码视图复用同一机制——纯文本不需要加载语言，其他类型加载一次即可。

## 验收

- [ ] 聊天首屏不再加载全部 Prism 语言
- [ ] 流式代码块在语言就绪后自动补高亮，不出现"先无高亮后跳变"的闪烁
- [ ] 纯文本文件不触发语言加载
- [ ] 缝 2 断言：两个替换件都出现 usePrismLanguages，且上游对照文件仍导出该 hook
- [ ] check + typecheck + lint + test 全绿

## 备注

上游这条提交还用到了 \`lib/highlight-queue.ts\`（高亮预算），它同样已在基础层。若 M03 尚未完成，本票**不要**顺带实现延迟高亮——那是 M03 的范围，两票独立验收。
