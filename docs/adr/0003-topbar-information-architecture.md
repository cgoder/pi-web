# ADR-0003: 导航架构与顶栏信息架构——活动栏撤除、顶栏高频收敛

## 状态

已接受（2026-08-22）

## 背景

F1 活动栏（`poweri/features/ActivityBar.tsx`，48px 左侧竖条：会话/文件/统计）上线后重新审视发现：

1. **双入口冗余**：sessions 与 files 在顶栏各有上游遗留 toggle（左上 ☰、右上文件面板），与活动栏完全重叠且行为不一致（顶栏强制 files 视图，仅活动栏可进统计）。
2. **净新增价值低**：三个图标中只有统计是新功能，48px × 全高的常驻成本换一个新入口，杠杆比不成立。
3. **产品原则**（2026-08-22 拍板）：低频设置（工具安装、MCP 配置、扩展安装配置等）收拢到统一的"设置"菜单；高频功能呈现在交互主界面。上游顶栏把明暗切换、语言设置放在状态栏，不符合此原则。
4. **上游动向**（0.8.10-beta，见 `docs/desktop/upstream-0.8.10-beta-impact.md`）：已引入弹层式 `SettingsPanel` 统一设置（general/models/skills/agents/plugins 五区），移除侧栏底部 M/S/P 三按钮；但顶栏 theme/language 快捷按钮保留——上游只做了一半。

## 决策

### 1. 撤除活动栏，采用"顶栏收纳"（D′ 方案）

- sessions = 左上 ☰（上游既有位置）；files / stats = 右上角相邻图标，紧贴文件面板 toggle 左侧。
- 互斥语义完整保留：同一时间最多一个侧面板；点已激活项 = 收起（VS Code 式）；跨侧互斥（开会话树关右面板，反之亦然）。
- 被否方案：
  - *保留活动栏*：48px 常驻税 > 净新增价值；若未来面板数量增长（GitPanel、轨迹等获得独立视图容器），可将右上两图标"竖起来"升级回活动栏，迁移成本低。
  - *v2 面板内聚合*（单 toggle + 右面板内 [文件|统计] 切换）：污染右侧图标的语义域——该区域语义为文档相关，统计不应混入。
  - *v3 圆环融合*（统计入口融合 contextUsage 迷你圆环）：数据源 `getContextUsage()` 仅对活跃 RPC 会话可用，历史会话恒回退纯图标，差异化不可见；对历史会话补数据需改上游 state API（红线）或自算口径（违反"统计口径与 SDK 一致"）。上游若未来开放非活跃会话的 context 数据，v3 形态可零成本复活（入口位置不变）。

### 2. 顶栏功能分工表

| 顶栏项 | 处置 | 判据 |
|---|---|---|
| ☰ 会话 toggle | 留 | 最高频 |
| branch 分支导航 | 留 | 会话内高频导航 |
| 会话信息（tokens/cost/context） | 留 | 高频常驻；F3 状态栏落地后由其接管呈现 |
| 文件 toggle | 留 | 高频；语义域 = 文档 |
| **统计入口（新增，v1 纯图标）** | 留 | 高频观测入口，打开右面板 stats 视图 |
| agents 面板（0.8.10 合并带入） | 留 | 子代理运行状态，高频 |
| theme 明暗切换 | **移除 → SettingsPanel.general** | 低频；上游 general 区已可配，PowerI 彻底撤离顶栏 |
| language 语言 | **移除 → SettingsPanel.general** | 同上 |
| system 系统提示词 | **扩展**（见第 4 条） | 升级为项目上下文文件入口 |
| history 完整历史 | **演进**（见第 5 条） | 将被 F2 家族轨迹吸收 |

### 3. 设置入口复用上游 SettingsPanel

基础层跟随 0.8.10 合并后直接 import `components/SettingsPanel.tsx`，不 fork。PowerI 后续自有偏好（统计默认视图、状态栏开关等）作为独立 section 扩展，不改上游组件。

### 4. system 按钮 → 项目上下文文件入口

聚合查看/编辑以下文件的入口：

- `AGENTS.md`（及 `AGENTS.override.md`、`CLAUDE.md`）：pi 原生自动发现加载（SDK resource-loader）。
- `SYSTEM-PROMPT.md` / `SOUL.md` / `ROLE.md` 等：PowerI 自定义约定，pi 不原生加载。生效机制走既有会话级 system prompt 注入管道（`onSystemPromptChange`），UI 入口负责聚合呈现与引导创建。

### 5. 会话对象的三种表达（history 的归宿）

同一会话对象的三种视图，各司其职：

- **侧栏会话树**：简要表达（列表级）；
- **F2 家族轨迹**（ticket 08）：丰富表达（时间线、父子会话树），吸收现有"完整历史"导出场景；
- **会话信息统计**（F6）：统计维度表达。

## 实现时机

正式实现排在 **0.8.10 正式版合并之后**，与 SettingsPanel 接入同轮完成 AppShell 重放，避免二次 fork 重同步（对齐 upstream-impact 文档第五节行动顺序）。结构性原型已 capture 于 `prototype/topbar-nav` 分支（?variant= 对比，拍板 v1），作为实现蓝本。
