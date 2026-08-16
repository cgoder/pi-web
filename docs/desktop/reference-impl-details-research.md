# 参照项目实现细节盘点（R2）

> 研究日期：2026-08-18
> 对象：A. PiDeck（Electron v0.7.1，浅克隆 /tmp/pideck-research，commit 3d313a9）；B. ct-jyjntc/pi-web（fork 官方 pi-web，浅克隆 /tmp/ct-piweb-research）
> 方法：源码逐文件分析（与基线 docs/desktop/pideck-research.md、ct-jyjntc-pi-web-research.md 交叉，本文只写基线未覆盖的增量细节）
> 引用约定：文件路径:行号（绝对路径，基于上述克隆）

---

## A. PiDeck（Electron 项目）

### A1. 托盘常驻：行为与菜单项

**结论**：默认关窗即隐藏到托盘（`closeToTray` 默认 true），托盘菜单固定三项「显示窗口 / 重启 PiDeck / 退出 PiDeck」；退出前必须置 `isQuitting` 标志，否则 close 事件会把退出流程吞成隐藏。

- **托盘创建**：`/tmp/pideck-research/src/main/index.ts:1267-1284`（`setupTray()`）——16×16 图标 + tooltip "PiDeck"；Windows 惯例双击托盘图标恢复窗口（`tray.on("double-click")`）。
- **菜单清单**：`/tmp/pideck-research/src/main/index.ts:1156-1185`（`refreshTrayContextMenu()`）——`Menu.buildFromTemplate`：① 显示窗口（show + focus）② separator ③ 重启（`restartApp`，先置 `isQuitting` + 停常驻服务再 relaunch）④ separator ⑤ 退出（置 `isQuitting` 后 `app.quit()`）。文案：`/tmp/pideck-research/src/shared/i18n/mainProcessCopy.ts:34-36`（zh）/218-220（en）。
- **关窗语义**：`/tmp/pideck-research/src/main/index.ts:1667-1677`——`close` 事件里 `if (!isQuitting && settingsStore.get().closeToTray) { preventDefault(); hide(); }` 否则直接退出；默认值 `closeToTray: true` 见 `/tmp/pideck-research/src/main/settings/SettingsStore.ts:117`，设置项 UI 在 `/tmp/pideck-research/src/renderer/src/components/app/settings/CommonTab.tsx:252-255`。
- **退出兜底**：`/tmp/pideck-research/src/main/index.ts:3022-3031`——`before-quit` 统一置 `isQuitting`、销毁托盘、停 agent/terminal/pet 等常驻服务；`window-all-closed` 时 macOS 永不退出，其他平台仅 `isQuitting` 为真才 `app.quit()`。
- **附注（版本线说明）**：官方 PiDeck 存在两条版本线——旧版 Electron v0.7.1（浅克隆 `/tmp/pideck-research`，commit 3d313a9）与本地完整克隆 `/Users/tianzhao/code/github/PiDeck`（HEAD f714645，**官方当前主线，已迁移/重写为 Tauri 版** v0.1.x，品牌 "Pi Desktop Manager"，目录 apps/desktop/src-tauri）。正文八问以工单调研基线 Electron v0.7.1 为准；Tauri 版信息（系统托盘仅 Windows 且只有 Open/Quit 两项，`apps/desktop/src-tauri/src/system_tray.rs:1-58`，macOS/Linux 无托盘）说明**官方也在 Tauri 化**，对我们走 Tauri 路线是印证，但作为「Tauri 化后托盘退化」的对照，不作为功能设计主参考。

### A2. 状态栏：展示信息、数据来源、刷新方式

**结论**：状态信息不是常驻底栏，而是**会话头部的一排状态 chip**（上下文占用 %、缓存命中率、费用 $）＋ hover 弹出的明细（token 进出、cache 读写、TTFT/总耗时/tps、美元+人民币费用），另有发送按钮旁 14px 上下文圆环面板（同一份明细数据）。数据由主进程 AgentManager 经 IPC `agents:runtime-state` **事件驱动推送**（pi RPC 事件边沿 + 50ms 节流的流式补丁），完整状态= `get_state` + `get_session_stats` 两个 RPC 与 session 文件解析并行取回，无独立轮询线程。

- **UI 形态**：`/tmp/pideck-research/src/renderer/src/components/session/SurfaceComponents.tsx:305-420`（`SessionStatus`：ctx-chip/cache-chip/cost-chip + Tooltip 明细），明细构建纯函数 `buildSessionStatusDetail` 同文件 229-302；圆环面板 `/tmp/pideck-research/src/renderer/src/components/session/SessionContextMeter.tsx:1-60`（复用同一构建器；「对话 vs 系统+工具」两段占比中对话 token 由主进程按会话文件字符数÷4 估算 `contextMessageTokens`）。
- **IPC 通道**：`/tmp/pideck-research/src/shared/ipc.ts:228`（`agents:runtime-state`）；渲染层订阅后 merge 进原子状态 `/tmp/pideck-research/src/renderer/src/atoms/session-atoms.ts:1048-1060`（含缓存命中率快照入列做会话平均）。
- **完整状态组装**：`/tmp/pideck-research/src/main/pi/AgentManager.ts:1854-1908`（`getRuntimeState`：`Promise.all([get_state RPC, get_session_stats RPC, 会话文件 cache-hit 统计])`，文件统计带 size/mtime 缓存；`cacheHitPercent` 不来自 RPC，从 session 文件逐行 parse）。
- **推送触发点（无固定轮询）**：
  - 工具边沿：`AgentManager.ts:1981-1989`（`emitToolRuntimeTransition`，直接从原始 pi 事件发出，不等待 RPC）；
  - 流式轻量补丁：`AgentManager.ts:5046-5060`（`emitStreamingStatePatch`，50ms 消息 flush 时顺带同步 isStreaming/isExecutingTool，无 RPC）；
  - 事件驱动完整推送：compaction_start/end（3226-3260）、agent_end（3347）、perf 结算（message_end，3950-3963，TTFT/tps 主进程本地计时）、主动推送（compact 请求 1677）；
  - 兜底定时：`agent_settled` 缺失时 5s 后 `markIdleIfPiReportsNoWork` 查一次 get_state（`AgentManager.ts:198` `AGENT_SETTLED_TIMEOUT_MS = 5000`，3350-3357）。

### A3. 工作区三栏布局：DOM 结构、折叠交互、宽度记忆

**结论**：三栏（侧栏 | 对话 | 右抽屉）由 `react-resizable-panels` 的 `ResizablePanelGroup` 实现，App 持有 px 状态为单一事实源；拖拽过程不回写 React 状态（防抖动），释放时经 `onLayoutChanged` 统一提交；折叠语义：侧栏拖到 minSize 以下自动折叠（折叠后 0 宽），抽屉未钉住时可拖拽折叠、钉住（pinned）时禁止折叠且最小 220px；宽度持久化到 localStorage（**只记展开宽度，从不记折叠态**），抽屉开合+钉住状态按项目记忆。

- **DOM 结构**：`/tmp/pideck-research/src/renderer/src/components/app/AppShell.tsx:98-400`（`AppShell`：`ResizablePanelGroup orientation="horizontal"` 内三个 `ResizablePanel` id=list/chat/drawer + 两个 `ResizableHandle`；抽屉面板**常驻挂载**，drawer=null 时折叠为 0 宽，避免动态挂载导致布局时序错误）。CSS 变量 `--list-width/--drawer-width` 等驱动旧样式（AppShell.tsx:294-308）。
- **状态归属**：px 状态 `listWidth/drawerWidth/listCollapsed/drawerCollapsed` 在 App（`/tmp/pideck-research/src/renderer/src/App.tsx:315,623,884-887`），拖拽中不回写、释放后 `shouldCommitPanelPixels` 过滤瞬时值（AppShell.tsx:238-286）；宽度变化 >1px 才同步（防反馈回路）。
- **折叠交互**：标题栏折叠按钮（App.tsx:3218 `onToggleListCollapsed`）+ 拖拽低于 minSize 自动折叠（AppShell.tsx:113-126 注释「折叠语义对齐旧实现」）；侧栏折叠后焦点释放（`/tmp/pideck-research/src/renderer/src/hooks/useResize.ts:66-80`）。
- **宽度记忆**：侧栏 `/tmp/pideck-research/src/renderer/src/hooks/useResize.ts:12-58`——`pid:list-width` 全局键、默认 221、范围 [100,440]、读时 clamp；**不记忆折叠态**（重启总是展开）；抽屉 `/tmp/pideck-research/src/renderer/src/hooks/useWorkspacePanels.ts:141-160`——`pid:drawer-width` 全局键、默认 320、范围 [180,560]、pinned 时最小 220；抽屉打开面板与钉住状态按项目存 `pid:project-drawer:<projectId>`（useWorkspacePanels.ts:176-230，项目切换时恢复）。

### A4. 活动轨迹聚合：UI 形态、事件来源

**结论**：轨迹复盘是**右侧抽屉「轨迹」面板**（跟随当前会话）：turn 账本 + 4-lane 时间线（input/model/tools/process）+ 选中 inspector，数据**直接来自已加载的 ChatMessage 列表聚合（不另开 IPC）**；live 期间由主进程把 pi RPC 原始事件流（`message_update`/`message_end`/`tool_execution_start|end|update`/`agent_*`/`compaction_*` 等）折叠成 ChatMessage 经 `agents:message`（50ms 节流）推送，思考与正文走独立增量通道 `agents:thinking` / `agents:text-stream`。

- **UI 形态**：`/tmp/pideck-research/src/renderer/src/components/session/trajectory/SessionTrajectoryView.tsx:1-90`（LANE_ORDER 四车道、拖拽平移/缩放时间域、in-flight 投影 now、耗时三分 in-flight/未知/真实）；抽屉挂载点 `/tmp/pideck-research/src/renderer/src/components/workspace/DrawerSurface.tsx:91`（`SessionTrajectoryPanel`）。
- **聚合规则**：`/tmp/pideck-research/src/renderer/src/components/session/trajectory/buildTrajectory.ts:1-60`——用户消息开新 turn，其后 assistant/thinking/tool 归入该 turn；工具起止用 `meta.startedAt + meta.durationMs`（不伪造 in-flight 耗时）；JSONL 过程事件（session/model/thinking/compaction）按时间插入最近 turn；历史时间区间用相邻锚点回推。
- **pi RPC 事件映射（主进程）**：`/tmp/pideck-research/src/main/pi/AgentManager.ts:3155-3512`——`session_info_changed`/`agent_start`/`message_start`/`auto_retry_start|end`/`compaction_start|end`/`agent_end`/`agent_settled`/`message_update`(assistantMessageEvent)/`message_end`/`tool_execution_start|end|update`/`extension_ui_request` 逐一处理。
- **live 通道**：`agents:message` 50ms 节流 flush（AgentManager.ts:5008,5043）；思考增量 `agents:thinking`（4073-4093 `finishThinkingChannel`，5149 `emitThinkingNow`，增量 delta + 50 次推送≈2.5s 全量兜底）；正文增量 `agents:text-stream`（5192 `emitTextStreamNow`，`message_end` 发 done）；live 挂载判定（只挂最后一个 agent-run）`/tmp/pideck-research/src/renderer/src/components/session/timeline/liveMount.ts:1-46`。

---

## B. ct-jyjntc/pi-web

### B5. GitPanel：功能清单与交互细节

**结论**：右分栏 Git 面板，功能 = status 列表（冲突置顶）+ 逐文件 stage/unstage/discard + 全量 stage/discard + 内联 diff 展开 + commit（可含未暂存）+ commit-and-push + 独立 push + AI/启发式提交信息 + 分支切换/新建 + 拉取 + 冲突助手（ours/theirs/base/AI 四选）+ commit split（AI 规划/启发式规划 + 分组执行）+ 提交历史（懒加载 + 单文件 diff）+ Git Review（真正开一个 pi session 让 Reviewer 子代理审查）+ PR 链接与 PR diff。全部走 HTTP API（`/api/git/*`），后端 `execFile` 调系统 git 二进制；AI 能力经 utility model（pi SDK）。

- **前端主文件**：`/tmp/ct-piweb-research/components/GitPanel.tsx`（1393 行）。status 拉取 `GET /api/git/status?cwd&fresh=1`（52 行），refreshKey/onStatusChange 双刷新通道（120-148）。
- **stage/unstage/discard**：`POST /api/git/stage|unstage|discard`（GitPanel.tsx:314-323），discard 有 confirm；全量按钮在工具栏（739-770）。
- **commit**：`GitCommitDialog`（GitPanel.tsx:1185-1200）——includeUnstaged 开关（commit 前先 stage）、Commit / Commit & Push / Push only / Generate / Split 五个动作；`runCommit`（600-625）：冲突>0 直接拒绝 → 可选 stage → 空消息时用**启发式草稿**（文件名+统计）→ `POST /api/git/commit` → 可选 `POST /api/git/push`。
- **AI 提交信息**：`POST /api/git/commit-message`（mode=ai|heuristic，route：`/tmp/ct-piweb-research/app/api/git/commit-message/route.ts`）；AI 实现 `lib/git-commit-message-ai.ts:46-106`——utility model（Settings 里 commitModel 优先）+ 25s 超时 + temperature 0.2 + 结果清洗（去 fence/引号/截 72 字符 subject）；启发式 `draftCommitMessage` 在 `lib/git-changes.ts`。
- **分支切换/新建**：`GET /api/git/branches`（列表）+ `POST /api/git/branches`（action=checkout|create）（GitPanel.tsx:658-681），UI 为下拉菜单 + 底部新建输入框（818-880），显示 ahead/behind。
- **冲突助手**：`POST /api/git/conflict`（action=ours|theirs|base|content|ai，route：`/tmp/ct-piweb-research/app/api/git/conflict/route.ts`）；文件行内 ours/theirs/base/AI 四个按钮（GitPanel.tsx:1312-1345）；AI 解析 `lib/git-conflict.ts:221-280`——plan 角色模型 + 60s 超时 + 完整文件输出 + 残留冲突标记校验；merge 中状态条 + "Complete merge"（GitPanel.tsx:444-459, 986-1002）。
- **commit split**：`POST /api/git/commit-split`（mode=plan|execute，route：`/tmp/ct-piweb-research/app/api/git/commit-split/route.ts`）；plan（`lib/git-commit-split.ts:146-232`）：AI 按 JSON 契约分组（utility model，45s，2-6 组，source 变化时回退启发式）+ `heuristicPlan` 按目录/类型分组；execute（234-285）：逐组 unstage→stage→commit 原子执行；UI：计划面板可改每条 message、显示未分配文件（GitPanel.tsx:1004-1060）。
- **Git Review 会话**：`POST /api/git/review`（route：`/tmp/ct-piweb-research/app/api/git/review/route.ts`）→ `lib/git-review.ts:37-58` 构造 prompt（要求 spawn Reviewer 子代理、只读、JSON 输出契约，diff ≤50k 字符）→ 前端 `POST /api/agent/new` 开真 session（GitPanel.tsx:378-425）→ 最佳努力 PATCH 改名（`Git review · <branch> · HH:MM`）→ 切换会话；结果卡 `ReviewSummaryCard`（`/tmp/ct-piweb-research/components/ReviewSummaryCard.tsx:1-116`）解析 JSON 报告（overall_correctness + P0-P3 findings，`lib/review-report.ts`）。
- **历史/PR**：`GitHistory`（懒加载 `GET /api/git/log` + `GET /api/git/commit` + `GET /api/git/commit-diff`，`/tmp/ct-piweb-research/components/GitHistory.tsx:60-160`）；Linked PR（gh CLI 经 `POST /api/github` action=list_prs/diff，GitPanel.tsx:169-200, 884-970）；无 remote 时 push 触发 publish 引导（`GitPublishDialog` + `GithubConnectModal`，`POST /api/git/push-create-remote`）。
- **后端共性**：所有 git API 走 `assertAllowedCwd/assertAllowedPaths`（`/tmp/ct-piweb-research/lib/api-cwd.ts`）；git 命令统一 `execFile(resolveGitBinary(), ["-C", cwd, ...])`（`/tmp/ct-piweb-research/lib/git-changes.ts:1-52`）；status 有缓存（`getGitStatus(allowCached)`）。

### B6. 使用统计面板：数据来源、展示、入口

**结论**：数据在服务端 `GET /api/usage` 由 **pi session `.jsonl` 流式解析**聚合（只统计 token 与消息数，**不含 cost**——session 文件没有价格信息）；展示为设置页「Usage」面板（总量/连续天数/模型占比/趋势柱状图/26 周热力图）；缓存按 size:mtime + soft/hard TTL（45s/15min），agent 回合结束后前端主动失效刷新。

- **聚合实现**：`/tmp/ct-piweb-research/app/api/usage/route.ts`——逐行读 `{"type":"message"}`（63-118 行），substring 提取 timestamp/role/usage.totalTokens/model（不整行 JSON.parse），8 worker 并发、按文件 size:mtime 签名只重解析变更文件（188-230），soft 45s 直接回缓存、hard 15min 重 stat（44-46）；响应含 totals(tokens/sessions/messages/activeDays)、streak、topModel、models(share)、trend（零填充日序列，7-365 天）、heatmap（26 周）。
- **UI**：`/tmp/ct-piweb-research/components/UsagePanel.tsx`（421 行）——`prefetchUsage`/`invalidateUsage`（78-104）；趋势柱状图按模型分段着色（344-375）。
- **入口**：设置页侧栏 `section === "usage"`（`/tmp/ct-piweb-research/components/SettingsPage.tsx:465,818`），切到该 tab 前预热（524,785）；agent_end 后 debounce `invalidateUsage()`（`/tmp/ct-piweb-research/components/AppShell.tsx:587`）。

### B7. Composer 语法：@文件 / !shell / 斜杠命令

**结论**：三者全部**前端解析/拦截 + 服务端执行**，混合实现：`@文件` 是前端自动补全（纯文本插入，服务端只提供文件索引，语义由 pi 本体解析）；`!shell` 是前端拦截走 RPC `type:"bash"`（`!` 发给 agent 执行、`!!` 本地执行且不进上下文，这是 fork 相对官方的差异点）；斜杠命令内置部分前端直接调 RPC 处理，自定义命令来自 markdown 文件、插入文本后由 pi 本体解析。

- **@文件**：`/tmp/ct-piweb-research/lib/file-fuzzy.ts:33-60`（`extractAtQuery`：行首/空白后触发，支持 `@"引号路径"`；插入 `buildAtInsertText` 169 行，补全 `@relative/path `）；菜单数据源 = 前端缓存文件索引（`GET /api/file-index`，约 10s 缓存）+ 索引截断时 debounce 服务端搜索（`/tmp/ct-piweb-research/components/ChatInput.tsx:540-600`）；补全后仅改文本，随 prompt 原样发送。
- **!shell**：前端 `bashMode = startsWith("!")`、`bashExcluded = startsWith("!!")`，仅显示状态标签（ChatInput.tsx:161-162, 1443-1447）；发送时 `handleSend` 拦截（`/tmp/ct-piweb-research/hooks/useAgentSession.ts:872-880`）→ `executeBash`（994-1020）→ `sendAgentCommand(sid, { type:"bash", command, excludeFromContext })`，模型不参与；`!!` 只影响 `excludeFromContext`。
- **斜杠命令**：匹配 `value.startsWith("/") && 无空白`（ChatInput.tsx:478-539，内置 + 自定义/扩展/prompt/skill 五源分组排序）；内置命令前端处理：compact/reload/name/session/copy/undo/redo/init（`BUILTIN_SLASH_COMMANDS` 见 `/tmp/ct-piweb-research/components/chat-input/chat-input-shared.ts:69-85`，处理在 `hooks/useAgentSession.ts:1268-1400`——compact/set_session_name 等 RPC）；自定义命令列表来自 `lib/commands.ts:1-80`（读 `~/.pi/agent/commands/*.md` 与 `<cwd>/.pi/commands/*.md`，frontmatter description + `$NAME` 占位符），选中后仅插入 `/name ` 文本，展开由 pi 本体执行。

### B8. 权限系统 UI：modes + allow/ask/deny 交互

**结论**：双层面：① 会话 AgentMode（ask/auto/plan/yolo）在 composer 左下角模式菜单切换，切换 = 乐观更新全局偏好（webSettings.agentMode）+ 发 `set_mode` RPC；② 细粒度权限策略（allow/ask/deny 三态，OpenCode 兼容格式）在设置页「Permissions」面板以表格/JSON 双模式编辑，经 `/api/permissions` 写盘为**base 策略**（`~/.pi/agent/pi-permissions.jsonc`）并合成 **effective 策略**（`~/.pi/agent/extensions/pi-permission-system/config.json`，由第三方权限扩展强制执行）；运行时 ask 弹窗不是专用卡片，而是权限扩展经 `ask_user_question` 工具触发内联问卷（AskUserCard）。

- **AgentMode**：`/tmp/ct-piweb-research/lib/agent-mode.ts:1-50`（四种模式 + 每模式 surface 覆盖表 `AGENT_MODE_PERMISSION_OVERLAY`：仅 auto 叠 `edit/write: allow`，仅 yolo 置扩展全局 `yoloMode` 把 ask→allow 重写）；composer 菜单 `/tmp/ct-piweb-research/components/chat-input/ChatInputModeMenu.tsx:1-30`（Lock/Pencil/DraftingCompass/LockOpen 图标）；切 yolo 有确认弹窗 `YoloAccessDialog`（ChatInput.tsx:1457-1468）。
- **切换落地**：`/tmp/ct-piweb-research/hooks/useAgentSession.ts:1676-1710`（`setAgentMode`：乐观 UI → `saveWebSettings({agentMode})`（全局）→ `sendAgentCommand({type:"set_mode"})`，任一成功即生效）；模式还影响工具集（plan 剥离 edit/write，`agentModeStripsWriteTools`）。
- **策略文档与三态**：`/tmp/ct-piweb-research/lib/permission-policy.ts:1-90`——`PermissionAction = "allow"|"ask"|"deny"`；默认策略（46-72）：`"*":"ask"`、`path` 下 `*.env`/`**/.ssh/**` deny、`bash` 下 `git status/diff*/log*` allow、`rm -rf *`/`sudo *` deny；base/effective 双层文件与 compose 逻辑（98-200，`composeEffectivePermission` = base + 模式覆盖，写 config.json 前原子写）。
- **API 与 UI**：`/tmp/ct-piweb-research/app/api/permissions/route.ts`（GET 返回 mode+policy+defaultPolicy；POST action=ensure/reset-defaults/save-policy 或 mode 切换 ask|full）；设置面板 `/tmp/ct-piweb-research/components/settings/PermissionsSettingsPanel.tsx`（376 行）——yolo 开关（170-190）、表格行编辑（surface/pattern/action 下拉/reason，229-290）与 JSON 编辑切换；运行时 ask 交互 = `AskUserCard` 内联问卷（`/tmp/ct-piweb-research/components/message/AskUserCard.tsx:1-30`，挂在 ToolCallBlock 的 card 形态下 `components/message/blocks/ToolCallBlock.tsx:357`）；前端评估/匹配辅助逻辑在 `/tmp/ct-piweb-research/lib/first-party/permission/{evaluate,match}.ts`（供权限扩展复用）。

---

## 对 v0.2 决策的含义

1. **A1 托盘 → 工单 03-s1-tray-resident**：托盘菜单最小三项（显示/重启/退出）+ 可配置 closeToTray + `isQuitting` 标志位防「关窗语义吞退出」的机制，直接照搬进 Tauri 托盘设计；注意 PiDeck Tauri 版托盘已退化（仅 Windows），我们的 Tauri 托盘需重做。
2. **A2 状态栏 → 工单 09-f3-status-bar**：状态数据源应采用「事件驱动推送为主 + 轻量补丁与完整状态分离（50ms 节流）+ 极少量兜底定时」，不要做高频轮询；`get_state`+`get_session_stats` 双 RPC 并行与文件级 cache-hit 统计可复用。
3. **A3 布局 → 工单 07-f1-workspace-layout-prototype**：三栏即用 react-resizable-panels（或等价面板库），px 状态单一事实源、拖拽释放才提交、宽度记忆只记展开宽度（localStorage）、抽屉按项目记忆开合/钉住——这些是「不会抖、不丢状态」的关键约束。
4. **A4 轨迹 → 工单 08-f2-activity-trail-prototype**：轨迹面板 = 右抽屉 tab + 已加载消息聚合（不另开通道）+ 四车道时间线 + turn 账本 + inspector；live 事件流要独立增量通道（thinking/text 各一）并做 delta/全量兜底。
5. **B5 GitPanel → 工单 16-f11-gitpanel-scope**：v0.2 GitPanel 功能集可直接按「status/stage/discard/commit+push/AI 提交信息/冲突四选/AI split/Git Review 会话」排优先级；后端一律 `execFile` git 二进制 + cwd/path 白名单，AI 能力走 utility model 即可，无需重造。
6. **B6 使用统计 → 工单 11-f6-usage-stats-panel**：token 统计可从 session JSONL 流式解析（size:mtime 缓存 + TTL），但 **cost 无法从 session 文件得出**——要做费用统计必须另存 usage 快照或在代理层计价（PiDeck 的 usage 统计含 cost，走的是它自己的日志管线，可作参照）。
7. **B7 Composer → 工单 10-f5-composer-enhancements**：@文件自动补全前端做（服务端只给索引）、!shell 前端拦截走 RPC bash（`!`/`!!` 语义 = 是否进上下文）、斜杠命令内置项前端直接处理 + 自定义命令读 markdown 文件——三种语法三种实现深度，v0.2 可按此分层落地。
8. **B8 权限 → 工单 15-f10-permission-system**：模式切换（ask/auto/plan/yolo）+ 三态策略文档（allow/ask/deny）+ base/effective 双层文件 + 运行时 ask 走 ask_user_question 问卷，这套「模式 × 策略 × 扩展执行」三层模型是 v0.2 权限系统的最小完整形态。
