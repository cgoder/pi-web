---
title: F02 大文件分页与「加载更多」
status: done
triage: ready-for-agent
upstream-commit: 0e712013
blocked-by: F05（Prism 按需）
---

# F02 大文件分页与「加载更多」

上游提交：0e712013 · feat: paginate large text file previews
涉及文件：poweri/components/FileViewer.tsx
阻塞：F05（Prism 按需）

## 问题

打开几万行的日志时，PowerI 一次读完整文件并尝试渲染，界面卡住甚至无响应。

## 目标

大文件先展示第一块，底部提供「加载更多」，并显示已加载字节数 / 总大小。

## 现状勘察

服务端能力**已经完全就绪且与上游一致**：

- files 路由已支持 \`?offset=\` 参数（校验整数、\`offset > stat.size\` 报 400）
- \`lib/text-preview.ts\` 提供 \`readTextPreviewChunk(filePath, size, offset)\`，返回含 \`truncated\` 与 \`nextOffset\` 的块

PowerI 的 FileViewer 里 \`truncated\` / \`nextOffset\` 出现 **0 次**——完全没接。

## 要做的事

1. 首次请求按块读，记录 truncated 与 nextOffset。
2. truncated 为真时渲染「加载更多」按钮，旁边显示 已加载 / 总大小。
3. 加载更多是**追加**，不是替换；加载中禁用按钮并显示 loading 文案。
4. HTML 预览有自己的分块策略（见 F03），不要与本票的文本分页混在一起。

## 验收

- [ ] 大文件首屏只渲染第一块，界面不卡
- [ ] 「加载更多」追加内容，向前滚动历史行仍在
- [ ] 字节数显示随加载推进
- [ ] 加载中按钮禁用，不产生重复请求
- [ ] 缝 1：复用 \`lib/text-preview.test.mjs\`（上游已有）

## 备注

i18n 文案（「加载更多」「加载中」）上游已加进三语消息表，基础层同步过来即可，不要在替换件里硬编码中文。
