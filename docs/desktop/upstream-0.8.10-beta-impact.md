# 上游 0.8.10-beta 影响评估——内置 Subagent 与统一设置

> 状态：**已结案（2026-09-02 回写）**——实际合并发生在 v0.8.11（见文末「结案后记」）；正文保留为当时的调研快照。
> 调研日期：2026-08-21。来源：`upstream/feature/built-in-subagents`（HEAD c032e20，npm `@agegr/pi-web@0.8.10-beta.1`，发布于 2026-08-20T16:07Z）。
> 调研方式：fetch 上游分支与 origin/main（0.8.9，我们的基底）做全量 diff；35 个提交、90 文件、+9440/-2136。

## 一、上游变化全景（四大主题）

### 1. 统一设置入口
- 新组件 `components/SettingsPanel.tsx`：弹层式统一设置，五个 section——
  `general`（主题/语言，无需项目）、`models`、`skills`、`agents`（子代理 profile 编辑）、`plugins`（后四者需项目）。
- **移除**侧栏底部旧的 模型/技能/插件 三个配置按钮及对应独立弹窗状态（AppShell 净 -40 行大 hunk）。
- 导航位置持久化：`lib/settings-navigation.ts`（`getLastSettingsSection/setLastSettingsSection`）。
- 各 section 惰性挂载（`mountedSections`），草稿跨 section 保留。

### 2. 内置 Subagent（本次主体）
- 实现：内联隐藏扩展，受全局开关 `~/.pi/agent/agents/settings.json` 的 `builtInEnabled` 控制（上游 ADR-0003）。
  启用时压制 legacy `pi-subagents` 扩展的保留工具名（`Agent`/`get_subagent_result`/`steer_subagent`）。
- 子代理 = 真实子会话 jsonl：首行 header 带 `"parentSession": "<父文件绝对路径>"`；第 2 行起有 custom entry
  `{type:"custom",customType:"pi-web:subagent",data:{version:1,parentSessionId,parentSessionPath,parentToolCallId,profile,description,task,runInBackground,createdAt,resourceSnapshot}}`；
  结束态由尾部 `pi-web:subagent-result` 的 `status` 决定（无则 `"interrupted"`）。
- UI：顶栏新增 `agents` 面板 = `AgentSessionPanel`（根会话 + 子会话列表 + 相对时间 + 运行状态）；MessageView 中 Agent
  工具结果渲染跳转子会话按钮（`onOpenSession` prop 层层透传）。
- 新 API：
  | 路由 | 契约 |
  |---|---|
  | `GET/PUT /api/subagents/settings` | `{enabled}` ↔ 读写 `builtInEnabled` |
  | `GET /api/subagents/[id]` | `{run}`（SubagentRunInfo）；`POST {action:"steer",message}\|{action:"abort"}` → `{ok,run}`，非运行态 409 |
  | `GET /api/subagents/profiles?cwd=` | `{profiles}`（builtin+global+project 合并）；PUT/PATCH/DELETE 管理 profile |

### 3. 工具选择持久化（Chat-only）
- 上游 ADR-0002：空工具选择 = **Chat only** 持久资源策略；普通会话经 `pi-web:tool-selection` custom entry 落盘：
  `{type:"custom",customType:"pi-web:tool-selection",data:{version:1,tools:[]}}`（最新一条权威；无 entry=legacy；`tools:[]`=chat-only）。
- 工具预设显示名 `"off"` → `"chat-only"`（lib 层 `ToolPreset` 值不变：none/read-only/default/full）。
- System 面板拆分出 Tools 面板（`ToolDefinitionsPanel.tsx` 显示工具定义）；`ModelSelector.tsx` 从 ChatInput 抽出复用（ChatInput 与 AgentsConfig 共用）。
- RPC：`set_tools` 响应变为 `{sessionId?, recreated?}`——会话重建时前端需 `closeEvents()` 并重绑 sessionId（useAgentSession +65 行的主体的）。

### 4. 会话家族（session family）
- `lib/types.ts` SessionInfo 新增：`parentSessionId?`（语义扩展为 fork 来源或 subagent 父）、
  `relation?: {kind:"fork";originSessionId?} | {kind:"subagent";parentSessionId;profile;description;status}`、
  `SubagentSessionStatus = starting|running|completed|failed|aborted|interrupted`。
- `/api/sessions` **不过滤子会话**（列表包含 subagent jsonl），响应顶层新增 `completionNotificationSuppressedSessionIds:string[]`；
  `/api/sessions/[id]` GET 新增 `info.relation` 与 `toolNames?`。
- `lib/session-family.ts`：`listSessionFamilies()` → `{root, subagents[], latestModified}[]`（fork 保持顶层、仅 subagent 成树；沿 relation 向上爬根，带环检测）。SessionSidebar 已改用它替代旧树形 UI。
- 性能防御：`readSessionRelationEntries` 只读前 2 行 + 尾部 256KB（`SESSION_RESULT_MAX_BYTES`），不全量解析。

## 二、对我方基础层的合并冲击清单

| 文件 | 变化量 | 我方动作 |
|---|---|---|
| `components/AppShell.tsx` | +371/-226 | poweri fork 重放增量（活动栏、stats 分支、rightPanelMode 等 ~50 行） |
| `components/MessageView.tsx` | +94 | poweri fork 重放（文件预览接入 1 处 import） |
| `components/ChatWindow.tsx` | +26 | poweri fork 重放 |
| `hooks/useAgentSession.ts`、`lib/session-reader.ts`(+143) 等 | 大 | 基础层跟随合并（我方零修改，理论无冲突） |
| `docs/adr/0002、0003` | 新增 | **编号与我方 ADR-0002-layered-architecture 撞车**，合并时改名错开（如保留我方编号、上游加 `-upstream` 后缀或重编） |
| i18n | 新 key（common.settings 等） | 跟随上游 |

## 三、对 poweri/ 产品层的适配要求（合并前必须完成）

1. **F6 历史时间线防污染**：`/api/sessions` 将混入 subagent 子会话。时间线必须过滤
   `session.relation?.kind === "subagent"`（推荐语义：子会话不占独立行；父会话行的活跃时间取家族 latestModified，
   对齐上游 SessionSidebar 的家族呈现）。
2. **usage-stats / session-summaries 解析器加固**：显式跳过所有 `entry.type === "custom"` 行
   （tool-selection / subagent / subagent-result），否则每次切工具、每次子代理运行都会污染统计。
   同时需产品决策：**子会话 token 默认并入父会话**（子任务是父任务的一部分，符合时间线主框架理念），面板可选下钻。
3. **fork 判定迁移**：任何用裸 `parentSessionId` 判定 fork 的逻辑改用 `relation?.kind === "fork"` + `originSessionId`。
4. **契约校验前置**：`poweri/contract.ts`（ADR-0002-layered 承诺、ticket 24 挂账）必须在合并前补上——
   本次上游 AppShell/MessageView/useAgentSession 均有大改，没有契约校验的合并是盲飞。

## 四、对 v0.2 计划的修订

| Ticket | 原计划 | 修订 |
|---|---|---|
| 12 F7 模型管理 | 延后等上游 | **关闭：由上游覆盖**（SettingsPanel models 区） |
| 13 F8 技能管理 | 延后等上游 | **关闭：由上游覆盖**（skills 区 + dormancy） |
| 10 F5 输入框增强 | 延后等上游 | **关闭：主体由上游覆盖**（ModelSelector + chat-only 预设 + Tools 面板）；如有 PowerI 特有诉求另立新 ticket |
| 08 F2 轨迹 | 单会话轨迹替换完整历史 | **设计升级：会话家族轨迹**——一次任务 = 父会话 + N 子会话，轨迹视图须聚合 session-family（父子树 + AgentSessionPanel 式切换互补）；dsh ui-trajectory 移植时数据源改为 TrajectorySnapshot(家族) |
| 09 F3 状态栏 | 下一个实现 | 不变（上游零涉及）。原型可立即做（prototype/ 不受基础层影响）；**正式实现排在 beta 合并之后**，避免二次 fork 重同步 |
| 16 F11 GitPanel | 排队中 | 不变（上游零涉及） |

## 五、行动顺序（2026-08-21 决策）

```
1. 补 poweri/contract.ts（合并保险丝，小）
2. 分支上试合并 upstream/feature/built-in-subagents → 出冲突面评估 + 适配 PR 清单（不落地 desktop）
3. 等 0.8.10 正式版 → 合并基础层 + 完成第三节适配（F6 过滤/解析器/custom entries/fork 重放/ADR 改名）
4. 关闭 12/13/10（上游覆盖）；08 更新为家族轨迹设计
5. F3 状态栏：原型先行（可立即启动），正式实现排在合并后
```

## 六、战略结论

- 上游这波是「设置 + subagent」地基性演进；PowerI 的差异化领域（统计/轨迹/GitPanel/状态栏/时间线）上游全部未涉及，分层架构经受住考验。
- D4「F7/F8/F5 延后等上游」决策被验证正确且已兑现——三个 ticket 零成本收获上游实现。
- 合并窗口期是当前主线：beta 发布仅一天，预计正式版节奏数天至一周内；期间做 contract.ts、试合并评估、F3 原型三件不受阻塞的事。

## 结案后记（2026-09-02 回写）

本评估针对 0.8.10-beta；实际上游跳过单独的 0.8.10 线，直接发布了 **v0.8.11**（2026-08-26，`28bab3c`），本仓已于 **2026-09-01** 完成 `chore(desktop): sync upstream v0.8.11 to desktop`（`3ee2c58`）并随 **v0.2.0**（`a11fb56`）发布适配成果。当时列的适配项落实情况：

- **替换件对齐**：`docs/desktop/replacements.json` 各替换件 watermark 已推进至 `28bab3c`（v0.8.11），此后经 `scripts/upstream-replacement-audit.mjs` 持续过账；当前包版本 `0.2.4`。
- **第三节适配项**：会话家族（session family）已接入产品层——`poweri/layout/AppShell.tsx` 以 `activeSessionFamily` 联动 subagent 子会话、以 `relation?.kind === "subagent"` 判定，与当时评估的方向一致；各项细节以当前实现为准。
- **v0.2 计划修订**：ticket 12/13/10 由上游覆盖后关闭；F3 状态栏/顶栏信息架构另见 `docs/adr/0003-topbar-information-architecture.md`。
- 本评估的合并冲击清单与「重放增量」策略现由 `docs/desktop/replacements.json` + 审计脚本机制承接，本文自此归档为历史调研快照，不再更新。
