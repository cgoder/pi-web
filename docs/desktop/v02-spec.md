# pi-web-desktop v0.2 实施方案（spec）

> 航图终点产物：`.scratch/pi-web-desktop-v02/` 16 张工单决策的汇总（2026-08-16 全部 resolved）。
> 架构前提：**单 fork 深改**（cgoder/pi-web desktop 分支）+ Tauri 2 薄壳（src-tauri/）+ 活动栏工作区布局。
> 本文档 = v0.2 实施蓝图；实现阶段照此执行，决策依据见各工单与 `docs/desktop/` 研究文档。

---

## 0. 分层架构原则（2026-08-19 补充）

> 详见 [ADR-0002: 分层架构](../adr/0002-layered-architecture.md)

v0.2 的所有 UI 层工作项（F1/F2/F3/F6/F11）采用**分层架构 + 受控 fork**，在 pi-web 基础上建立显式的层边界：

```
┌─────────────────────────────────────────────────────────────┐
│  PowerI 产品层（poweri/）                                    │
│  ├── poweri/layout/      活动栏布局、面板编排                │
│  ├── poweri/features/    轨迹、Git 面板、统计、状态栏        │
│  ├── poweri/shell/       Tauri 壳 UI（已有 shell/）          │
│  └── poweri/contract.ts  合约验证（关键接口检查）            │
│                                                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ 层 边 界 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                                                             │
│  基础层（pi-web 原有代码，跟随上游合并）                     │
│  ├── lib/          客户端 SDK（~9600 行，UI 无关）            │
│  ├── hooks/        状态 hooks（useAgentSession 等）           │
│  ├── components/   基础渲染组件（MarkdownBody 等）            │
│  └── app/api/      Next.js API 路由（37 个）                 │
└─────────────────────────────────────────────────────────────┘
```

### 核心原则

1. **基础层 = pi-web 上游 + 最小适配修改**
   - `lib/`、`hooks/`、`app/api/` → 跟随上游合并，尽量不改
   - 上游合并时：这些文件以"上游为准，重放增量"

2. **PowerI 产品层 = 自有代码，集中在新目录**
   - `poweri/` 是新目录，放所有 PowerI 特有的布局和组件
   - **不修改基础层的 `AppShell.tsx`，而是替换它**——PowerI 有自己的 AppShell
   - 复用基础层的 `lib/`、`hooks/`、`MarkdownBody` 等

3. **合约验证 = 每次构建检查边界**
   - 检查基础层的关键文件/接口是否存在
   - 检查 PowerI 依赖的 `lib/` 导出是否变了
   - 上游合并后如果合约失败，需要人工适配

4. **替换 AppShell，而非修改它**
   - 基础层保留原始 AppShell.tsx（不动，跟随上游）
   - PowerI 产品层写自己的 AppShell（`poweri/layout/AppShell.tsx`）
   - 启动时根据运行环境选择用哪个 AppShell

### v0.2 工作项的层归属

| 工作项 | 层归属 | 说明 |
|--------|--------|------|
| F1 活动栏布局 | PowerI 产品层 | `poweri/layout/ActivityBar.tsx` |
| F2 轨迹面板 | PowerI 产品层 | `poweri/features/TrajectoryPanel.tsx` |
| F3 状态栏 | PowerI 产品层 | `poweri/features/StatusBar.tsx` |
| F6 统计面板 | PowerI 产品层 | `poweri/features/StatsPanel.tsx` |
| F11 GitPanel | PowerI 产品层 | `poweri/features/GitPanel.tsx` |
| 壳层（S1/S2/S3） | Tauri 壳层 | `src-tauri/` + `shell/`（已有） |
| 管理增强（F7/F8/F9） | 基础层 | 小 UI 改动，跟随上游 |

### 合并策略

- **基础层文件**（`lib/`、`hooks/`、`app/api/`）→ 上游为准，有冲突时以"不破坏 PowerI 依赖的接口"为原则
- **编排层文件**（`components/AppShell.tsx`、`ChatWindow.tsx`）→ 基础层保留原版，PowerI 用自己的版本
- **PowerI 产品层**（`poweri/`）→ 完全自有，不参与合并
- **定期同步节奏**：上游发版时 merge main → desktop，合约验证通过 = 无需适配，失败 = 按 contract.ts 的提示修复

---

## 1. 总览

v0.2 把 pi-web-desktop 从「浏览器里能用的 web 版」变成「桌面工作台」：

- **壳层**（Tauri）：托盘常驻、单实例、完成通知、设置区（03/04/05）
- **工作区**：Codex 式活动栏布局 + dsh 式状态栏（07/09）
- **功能面板**：统计、轨迹、GitPanel 核心（11/08/16）
- **管理增强**：默认模型 UI、技能预览、Composer 三命令（12/13/10）
- **生态接入**：MCP 与权限系统不内置，直接用 pi 生态（14/15）
- **治理**：npm 新包名发布、跟上游+后缀版本、发版时 merge（06）

**净增量估算**：核心开发集中在壳（Rust）+ 布局/面板框架 + 轨迹 vendor + GitPanel；管理类增量均为小 UI 改动；MCP/权限为零开发（生态安装）。

---

## 2. 分层工作项清单

### 壳层（Tauri，src-tauri/ + shell/）

| # | 工作项 | 决策源 | 要点 |
|---|---|---|---|
| S1 | 托盘常驻 | 03 | `tray-icon` feature；CloseRequested→hide（固定无开关）；菜单三项=显示窗口/重启服务/退出（is_quitting→exit→杀进程组）；静态图标+事件驱动 tooltip；升级不进托盘 |
| S2 | 单实例+通知 | 04 | `tauri-plugin-single-instance`（二次启动唤起聚焦，复用 S1 显示逻辑）；`tauri-plugin-notification`；壳订阅 `GET /api/agent/running/events` SSE（running 非空→空=完成），`GET /api/sessions` 映射会话名；前台可见聚焦不打扰；无开关；SSE 断线重连 |
| S3 | 升级/版本设置区 | 05 | 壳自身版本检查不做（未发布）；**设置区 UI = 右侧抽屉**（topbar ⚙ 打开，宽 380px，分区：服务器=端口/监听/URL 预览/保存并重启，关于=壳版本+pi-web 版本+升级按钮）；升级按钮+进度日志移入设置区「关于」块（壳版本+pi-web 最新/已装版，`app.package_info()` 读壳版本）；升级前一律确认弹窗；现有 `upgrade_piweb`/`piweb_version` 命令保留。**抽屉不受 F1"无右抽屉"约束**（该约束仅限工作区面板编排，设置区是壳层 UI）；端口/监听持久化到 `~/.poweri/settings.json`，`set_server_config` 原子应用并重启；dev 模式拒绝修改（端口由 dev 脚本固定） |

### 工作区层（pi-web fork UI）

| # | 工作项 | 决策源 | 要点 |
|---|---|---|---|
| F1 | 活动栏布局 | 07 | **Winner C 活动栏式**（VS Code 范式）：图标列（会话/文件/统计）+ 上下文面板；会话面板内会话/历史双视图；无右抽屉；面板折叠=图标列；宽度记忆 localStorage 只记展开态（**SSR-safe：mount effect 应用**）；默认宽 300 clamp[180,480]；实现**扩展官方 #file-panel/useResizablePanel/lib/panel-layout.ts**，右键菜单沿用官方 CustomEvent；原型 app/prototype/layout/（快照 prototype/f1-layout） |
| F3 | 状态栏 | 09 | **dsh 形态**：composer 上方 StatsLine（turns/steps、缓存命中%、token 计数）+ 发送钮旁上下文圆环（点击→%/used/window+token 明细）+ agent 状态点；**07 底部栏占位取消**；只做精确数据（耗时/速度不做）；事件驱动无轮询（useAgentSession 现有 sessionStats/contextUsage）；参照 deepseek-harness `ui-conversation/chat/StatsLine.tsx` + `skeleton/ContextMeter.tsx` |

### 功能面板层（pi-web fork UI + API）

| # | 工作项 | 决策源 | 要点 |
|---|---|---|---|
| F6 | 统计面板 | 11 | 活动栏「统计」面板；全局不做 cost；ct 全套（总量/streak/模型占比/趋势 7-365 天/26 周热力图）；`GET /api/usage` JSONL 流式解析+size:mtime 缓存+soft/hard TTL+agent_end 失效刷新；照 ct 移植 app/api/usage/route.ts + UsagePanel.tsx |
| F2 | 轨迹面板 | 08 | **直接照搬 deepseek-harness `packages/client/ui-trajectory`**（MIT）：vendor 源码（~4600 行）+ 替换 cordis 纯类型/ui-primitives 两件 + 依赖 @tanstack/react-virtual + diff + 放宽 React peer；`lib/trajectory-adapter.ts` 把 pi 会话/SSE 数据→TrajectorySnapshot（usage+timestamp 现成，时长推算沿用 MessageView.tsx:634/643）；活动栏面板挂载（slot 注册简化为 props）；live 订阅官方 SSE 事件面 |
| F11 | GitPanel 核心 | 16 | **并入官方文件面板**（#file-panel 加 Git tab，不新增活动栏图标）；仅核心：status（复用官方 getGitStatus）/stage/unstage/discard（UI 确认）/全量 stage/discard/commit（含未暂存）/push/commit-and-push/分支切换新建（ahead/behind）；后端照 ct `/api/git/*`（stage/unstage/discard/commit/push/branches，execFile+白名单）；不走权限系统；与 worktrees 并存 |

### 管理增强层（小 UI 改动）

| # | 工作项 | 决策源 | 要点 |
|---|---|---|---|
| F5 | Composer 三命令 | 10 | 官方三语法已全覆盖；仅补内置斜杠 undo/redo/init |
| F7 | 默认模型 UI | 12 | ModelsConfig 加「设为默认」+默认徽章（写 settings.json defaultModel，rpc-manager.ts:1634 已读）；不做角色体系 |
| F8 | 技能预览 | 13 | SkillsConfig 加 SKILL.md 内容预览（经 /api/files 读）；其余官方已全覆盖 |

### 生态接入层（零开发，安装/文档）

| # | 工作项 | 决策源 | 要点 |
|---|---|---|---|
| MCP | 生态扩展 | 14 | `pi install npm:pi-mcp-extension`（或已装的 pi-mcp-adapter）；~/.pi/agent/mcp.json 配置；/mcp 管理；官方 PluginsConfig 管已装包；spec 文档指引 |
| 权限 | 生态扩展 | 15 | `pi install npm:pi-permission-system`（allow/deny/ask、YOLO 内置保留硬 deny、审计、/permission-system 模态）；扩展 UI 经官方 ExtensionWidgets 通道；ask 问卷先按 toolCall 卡，交互流不通再补最小 AskUserCard（实现期验证）；官方项目信任/工具预设保留并存 |

### 治理层

| # | 工作项 | 决策源 | 要点 |
|---|---|---|---|
| G1 | 发布链路 | 06 | 业务包 npm 公开新包名（**包名待定**，候选 pi-web-desktop）；版本 `跟上游+后缀`（0.8.9-desktop.1）；壳 npx 常量换指向（upgrade_command）；上游发版时 merge main，官方文件改动目录集中（v02 子目录优先），冲突以官方为准重放增量 |

---

## 3. 实施顺序与里程碑

```
M1 壳增强包 ──→ M2 布局与面板框架 ──→ M3 数据/管理小件 ──→ M4 轨迹面板 ──→ M5 GitPanel ──→ M6 发布与生态收尾
   (S1-S3)          (F1+F3)              (F6+F7+F8+F5)        (F2)            (F11)          (G1+MCP+权限)
```

| 里程碑 | 内容 | 依赖 | 验收口径 |
|---|---|---|---|
| **M1 壳增强包** | S1 托盘 / S2 单实例+通知 / S3 设置区 | 无（独立） | 关窗→托盘→agent 服务不中断；二次启动唤起聚焦；agent 完成收到系统通知（前台聚焦不打扰）；设置区关于块显示双版本；升级前确认弹窗 |
| **M2 布局+状态栏** | F1 活动栏 / F3 dsh 状态栏 | M1（壳 UI 承载） | 三图标面板切换/折叠/宽度记忆（刷新恢复）；会话/历史双视图；composer 统计行+圆环数据正确（与官方 topbar 数字一致）；无底部栏 |
| **M3 管理小件** | F6 统计 / F7 默认模型 / F8 技能预览 / F5 三命令 | M2（统计是活动栏面板） | 统计面板与官方 topbar token 数一致；设默认模型后新会话预选生效；技能预览渲染 SKILL.md；/undo /redo /init 可用 |
| **M4 轨迹面板** | F2 vendor ui-trajectory + adapter | M2（面板宿主） | 历史会话渲染 turn 账本+Overview 时间线；inspector 显示 token/耗时/参数；live 会话尾随不打断打字机 |
| **M5 GitPanel** | F11 核心 + /api/git/* | M2（文件面板体系） | status 列表正确；stage/discard/commit/push 全流程；discard 有确认；分支切换/新建正常 |
| **M6 发布与生态** | G1 发布链路 / MCP+权限安装指引 | M1-M5 | npm 新包名发布成功；壳 npx 拉起新包；升级链路换新包名后可用；装 mcp/权限扩展后 web 内功能正常（/mcp 命令、权限模态经扩展通道呈现） |

**并行建议**：M1 与 M2 可并行（壳 Rust 与 UI 互不阻塞，接口仅事件名约定）；M3 内四件互相独立可并行；M4/M5 各自依赖 M2 完成后即可开。

---

## 4. 与上游对齐

- 当前基线：上游 v0.8.9（merge-base 已核实），desktop 领先 20 提交、官方文件改动仅 package.json 14 行
- v0.2 开发期：上游发版（tag v*）时 merge main→desktop（06 纪律）；建议 **M2 完成时做一次上游同步检查**（UI 深改开始动官方文件，及早建立 merge 节奏）
- 冲突约定：以官方文件为准，重放我们的增量（依赖 v02 子目录集中策略）

---

## 5. 风险与待验证项

1. **AskUserCard**（15）：pi-permission-system 的 ask 交互在 pi-web 的呈现——实现期先验证 toolCall 卡展示，不通则补最小问卷组件
2. **ui-trajectory React 19 兼容**（08）：peerDep ^18.2.0 需放宽，代码 18 API 预计兼容——vendor 时先冒烟
3. **SSE 断线重连**（04）：壳订阅 running/events 需处理服务重启后恢复
4. **包名**（06/05）：新 npm 包名待定（17 航程结束前用户确认）
5. **宽度记忆 SSR**（07）：已踩坑记录——实现时用 mount effect，勿用 useState 初始化

---

## 6. 决策索引（航图）

- 航图：`.scratch/pi-web-desktop-v02/map.md`（Decisions so far 逐条含 gist）
- 工单：`.scratch/pi-web-desktop-v02/issues/`（01-16 全 resolved，各含 Answer）
- 研究：`docs/desktop/pi-sdk-capabilities-research.md`（01）、`docs/desktop/reference-impl-details-research.md`（02）
- 原型：`app/prototype/layout/`（F1，快照 prototype/f1-layout）、`app/prototype/trail/`（F2）
- 基线：`docs/desktop/`（web-to-native guide / 验证手册 / 参照研究 / borrow matrix）
