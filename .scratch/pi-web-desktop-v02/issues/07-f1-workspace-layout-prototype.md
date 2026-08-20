# 07-f1-workspace-layout-prototype

Type: prototype
Status: done
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

## Answer（2026-08-16 用户拍板）

**Winner：C 活动栏式**（VS Code / vscode.dev 范式：图标活动栏 + 上下文面板切换）。用户确认「更像 VS Code 的 web 版本」。

- **活动栏图标集**：会话（含历史双视图）、文件（官方 #file-panel 收纳进来）、统计；**Git 不选**——F11 形态未定，活动栏预留位（随 16 决定是否启用）
- **会话历史入口**：会话面板内双视图（会话/历史 tab，历史=全部项目按时间倒序+搜索框）
- **右抽屉**：不要——所有面板在活动栏体系内切换，横向空间全部给对话
- **布局约束**：面板折叠=收起为图标列（活动栏常驻）；宽度记忆 localStorage 只记展开态（SSR-safe：mount effect 应用，勿用 useState 初始化）；默认面板宽 300（clamp [180, 480]）；会话按 modified 降序（官方现状，无拖拽排序，v0.2 不新增）
- **实现路径**：扩展官方 `#file-panel`/`useResizablePanel`/`lib/panel-layout.ts` 体系（不新造），右键菜单沿用官方 CustomEvent 机制（`pi-web:session-row-contextmenu`）；原型代码保留在 app/prototype/ 作为实现期参考（throwaway 快照 prototype/f1-layout，实现后移除）

## F1 落地：活动栏（2026-08-20）

F6 原型胜出设计（活动栏面板）推动 F1 落地，PowerI AppShell（poweri/layout/AppShell.tsx）左侧加入活动栏：

- 三图标：会话（☰ 切换左侧 sidebar）/ 文件（🗀 右侧文件面板）/ 统计（◫ 统计面板）
- 右侧面板双模式互斥（files | stats），激活图标高亮 + 左侧 accent 指示条
- 实现：poweri/features/ActivityBar.tsx（纯展示组件，状态由 AppShell 传入）
- 提交：a8300fd（与 F6 统计面板同提交）

工单 07 原问题（三栏布局/宽度记忆/抽屉菜单）部分由 F6 原型验证覆盖；GitPanel/上下文栏等其余布局项待后续工单。
