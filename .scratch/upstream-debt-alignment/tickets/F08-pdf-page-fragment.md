---
title: F08 PDF #page= 页片段跳转（跨替换件）
status: done
triage: ready-for-agent
upstream-commit: 5e9b997d
blocked-by: F01、F02、F03（渲染分支需先稳定）
---

# F08 PDF #page= 页片段跳转（跨替换件）

上游提交：5e9b997d · fix(file-viewer): honor #page= fragments in PDF links (#841)
涉及文件：poweri/components/FileViewer.tsx、poweri/components/TabBar.tsx、poweri/layout/AppShell.tsx
阻塞：F01、F02、F03（渲染分支需先稳定）

## 问题

Markdown 里指向 PDF 的链接带 \`#page=3\` 时，打开的是第一页，用户要自己翻。

## 为什么单独成票

上游这条改动同时触及 FileViewer、TabBar，并依赖基础层的 \`components/file-tab-state.ts\`（与上游一致）。PowerI 侧还要打通 AppShell 把页片段传进文件标签的链路。

**这是本批唯一跨三个 PowerI 文件的票**，必须独立验收，不能塞进任何一个单文件票里。

## 要做的事

1. FileViewer 接受可选的初始页参数，非 PDF 或无参数时行为不变。
2. TabBar 的标签状态保存该页片段，切换标签后仍回到那一页。
3. AppShell 在打开文件标签时把链接里的片段透传下去。
4. 复用基础层 file-tab-state 的状态形状，不自建第二套标签状态。

## 验收

- [ ] 从 Markdown 点带 \`#page=3\` 的 PDF 链接，打开的 PDF 停在第 3 页
- [ ] 切到别的标签再切回来，仍在第 3 页
- [ ] 不带片段时行为与改动前一致
- [ ] 非 PDF 文件的链接不受影响
- [ ] 缝 2 断言：三个文件都出现页片段相关标识符，且基础层 file-tab-state 仍有对应字段

## 备注

上游附带了 212 行的 e2e（\`e2e/pdf-page-fragment.mjs\`）。**不移植该 e2e**（现有 e2e 全部 goto 上游根路由，不覆盖 /poweri）。改为人工验收 + 缝 2 断言。
