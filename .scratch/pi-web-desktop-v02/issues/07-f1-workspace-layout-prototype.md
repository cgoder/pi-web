# 07-f1-workspace-layout-prototype

Type: prototype
Status: open
Blocked by: 02

## Question

工作区布局（类 Codex 三栏）长什么样？产出粗糙原型供讨论（/prototype skill；HTML 静态稿或 fork 内 stub 页面，产物链接进本工单）：

- 三栏划分：项目+会话 | 对话 | 右分屏（右侧放什么：GitPanel？上下文/统计？）
- 各栏可折叠性、宽度记忆（行宽滑块）
- 会话历史抽屉 + 右键菜单（随本工单覆盖）
- 拖拽排序
- 参考：02 的 PiDeck 布局细节 + 官方 AppShell/SessionSidebar 现状（读 components/）

决策输出：v0.2 布局形态（栏位、默认宽度、折叠、抽屉菜单项）。

## 原型（2026-08-16 产出）

- **位置**：`app/prototype/layout/`（page.tsx + variants.ts + switcher.tsx + variant-a/b/c.tsx + shared.tsx + data.ts + layout-prototype.css），throwaway 分支快照 `prototype/f1-layout`
- **运行**：`npm run dev` 后访问 `http://127.0.0.1:30141/prototype/layout?variant=A`（换 B/C 或用浮动条 ←→ 切换，键盘 ←/→ 亦可）
- **三变体**：A Codex 三栏（会话树|对话|右抽屉 Git/统计，抽屉常驻挂载可钉住可折叠）；B 官方增量（双栏 + 侧栏会话/历史双视图 + 浮动 GitPanel）；C 活动栏式（VS Code 风格图标列 + 上下文面板切换）
- **已覆盖交互**（playwright 实测通过）：拖拽调宽（pointer 事件）、宽度记忆（localStorage，注意 SSR 陷阱已修：useState 初始化在服务端执行，记忆须在 mount effect 应用）、右抽屉折叠/钉住、会话历史浮层抽屉、右键菜单（重命名/Fork/复制/删除）、变体切换（URL 参数可分享可刷新）
- **截图**：`temp/prototypes/f1-layout/variant-{a,b,c}.png`（未提交）
- **官方现状对照**（Explore 报告）：官方 AppShell 已有三栏骨架（#session-sidebar | 中栏 | #file-panel 右面板，`useResizablePanel` + `lib/panel-layout.ts` 常量 260/180/480、560/300/1200，localStorage 记忆）；右面板现为文件面板（TabBar 文件 tab）；会话右键菜单已有 CustomEvent 机制（`lib/session-row-context-menu.ts`，`pi-web:session-row-contextmenu`）→ F1 实现应扩展官方右面板而非新造轮子；无拖拽排序，会话按 modified 降序
