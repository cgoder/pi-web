---
title: PowerI AppShell 受控 fork（渲染链复制 + 文件预览正式接入）
status: done
type: task
blocked-by: [24]
---

# PowerI AppShell 受控 fork（渲染链复制 + 文件预览正式接入）

## Problem Statement

ADR-0002 分层架构的落地核心：PowerI 产品层需要自己的布局编排（AppShell），但纯包装组件无调用点（渲染链硬编码 import，工单 24 验证发现的接入 gap）。文件路径预览功能（poweri/components/MarkdownBody.tsx）已写好但未正式接入。

## Solution

受控 fork 渲染链：复制 3 个"需要改 import"的编排组件到 poweri/，在副本中替换 import 链；其余 20+ 低耦合组件（SessionSidebar/FileViewer/ChatInput/MarkdownBody 基础版等）继续引用基础层原版。

```
渲染链（fork 后）：
app/poweri/page.tsx（新入口，~10 行）
  → poweri/layout/AppShell.tsx        （复制 components/AppShell.tsx，改 import）
    → poweri/components/ChatWindow.tsx （复制 components/ChatWindow.tsx，改 import）
      → poweri/components/MessageView.tsx（复制 components/MessageView.tsx，改 import）
        → poweri/components/MarkdownBody.tsx（已有，文件预览正式接入点）
      → @/components/ChatInput、ChatMinimap、ExtensionStatusBar（基础层原版）
    → @/components/SessionSidebar、FileViewer、TabBar 等（基础层原版）
```

## 关键决策

1. **入口**：app/ 是上游目录禁止修改，但**新增** `app/poweri/page.tsx` 路由不与上游冲突（上游无此文件，合并零冲突）——这是"PowerI 入口薄文件"的合理例外，需在文件头注释说明。Tauri 壳 iframe 后续指向 `/poweri`（shell 层切换是独立步骤，本次不强制）
2. **import 替换规则**（每层副本）：
   - 目标组件 import 指向 poweri 版（AppShell 副本的 `./ChatWindow` → poweri 版；ChatWindow 副本的 `./MessageView` → poweri 版；MessageView 副本的 `./MarkdownBody` → poweri 版）
   - **其余所有相对 import**（`./ChatInput`、`./SessionSidebar`、`./TabBar` 等）→ `@/components/X`（指向基础层原版）
   - `@/hooks/`、`@/lib/` 别名 import 不动
   - 相对路径 `../` 开头的（如有）同样改为 `@/` 指向基础层
3. **同步策略**：副本文件头加注释标记"受控 fork of components/X.tsx，上游为准重放增量"；上游合并时 diff 副本与新版，重放 import 差异
4. **文件预览正式接入**：MessageView 副本中 MarkdownBody 指向 poweri 版（替代工单 24 的临时冒烟方式）

## 实施步骤

1. 复制 `components/MessageView.tsx` → `poweri/components/MessageView.tsx`，改 import：
   - `./MarkdownBody` → `@/poweri/components/MarkdownBody`
   - 其他相对 import → `@/components/X`
   - 文件头加受控 fork 注释
2. 复制 `components/ChatWindow.tsx` → `poweri/components/ChatWindow.tsx`，改 import（同上，`./MessageView` → poweri 版）
3. 复制 `components/AppShell.tsx` → `poweri/layout/AppShell.tsx`，改 import（同上，`./ChatWindow` → poweri 版）
4. 新增 `app/poweri/page.tsx`：Suspense + I18nProvider + poweri AppShell（参考 app/page.tsx 结构）
5. 验证：`node_modules/.bin/tsc --noEmit`（排除 temp/ 报错）与 `npm run lint` 无新错误；`npm run dev`（换端口）浏览器验证 /poweri 功能等价 + 文件预览点击

## 验收标准

- /poweri 页面与 / 功能等价（会话列表、聊天、文件面板、侧边栏）
- 点击消息中的文件路径 → 打开文件预览（正式接入，非冒烟）
- 基础层 components/ 零修改；app/ 只新增 app/poweri/page.tsx
- tsc（排除 temp/）与 lint 通过
- 副本文件头有受控 fork 注释

## Out of Scope

- shell/main.ts 的 iframe 切换（独立工单）
- PowerI 特有布局改造（活动栏/状态栏，Phase 4）
- 其他编排组件的 fork（SessionSidebar 等，按需再说）

## Further Notes

- 渲染链现状：AppShell 2275 行 / ChatWindow 1339 行 / MessageView 1721 行（2026-08-19）
- components/ 与上游 main 一致（git diff main..desktop -- components/ 为空，工单 24 结论）——副本即上游快照
- ChatWindow 有 `window.piDesktop?.selectDirectory` 类型声明（SessionSidebar 里，desktop 分支已有，注意别丢失）
