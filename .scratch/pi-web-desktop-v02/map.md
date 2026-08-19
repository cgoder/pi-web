# Wayfinder 航图：pi-web-desktop v0.2 增强路线图

> 本地 markdown tracker。地图 = 本文件；工单 = `issues/` 下每文件一张。frontier = open、未被 blocking、未 claim 的工单，按编号顺序取。

## Destination

产出一份 **pi-web-desktop v0.2 实施方案（spec）**：确定从 PiDeck / ct-jyjntc / dsh-desktop 借鉴哪些功能（范围已切，见各工单与 Out of scope）、每项落在哪一层（Tauri 壳 / pi-web fork 的 UI+API，架构已定为**单 fork 深改**）、以什么形态实现、按什么顺序做。航程结束 = 全部工单 resolved，剩下只有"照着 spec 实现"。

本航程只做决策与调研，不写业务实现；prototype 工单产出粗糙原型物用于讨论，属唯一例外。

## Notes

- 领域：pi-web 官方 fork（`desktop` 分支，上游 agegr/pi-web v0.8.9）+ Tauri 2 薄壳（src-tauri/ + shell/）
- 工作语言：中文；结论先行
- 每个工单一个会话（research 可并行）；一个会话最多 resolve 一个非 research 工单
- 基线文档：先读 `docs/desktop/`（web-to-native-mini-app-guide / pideck-research / ct-jyjntc-pi-web-research / feature-borrowing-matrix / pi-web-desktop-verification-guide），再答工单
- research 工单：/research 子代理在 throwaway 分支 `research/<name>` 上产出 findings（写入 `docs/desktop/<name>.md`），工单里留 context pointer
- grilling 工单：/grilling + /domain-modeling；需要事实时先读本地代码（app/ components/ lib/ 在本仓库内，直接查）
- prototype 工单：/prototype skill；产物以链接进工单，不粘贴正文
- fork 纪律：改动尽量集中在少量目录，保持与 main 可 merge（细节随 06 决策）

## Decisions so far

- [01 R1-pi-sdk-capabilities](issues/01-r1-pi-sdk-capabilities.md) — SDK 统计完备（getSessionStats / getContextUsage / RPC get_session_stats，官方 pi-web 已在消费）；MCP 与 plan 模式零原生支持，唯一路径是自建/引入扩展；权限只有「项目信任（defaultProjectTrust + trust.json）+ 工具 allow-list（--tools，PRESET_* 即其具名组合）」，无 allow/ask/deny/YOLO，逐工具确认需扩展 tool_call 拦截；`--approve` 仅覆盖项目信任。详情见 docs/desktop/pi-sdk-capabilities-research.md
- [02 R2-reference-impl-details](issues/02-r2-reference-impl-details.md) — PiDeck：托盘 closeToTray+isQuitting+三菜单、状态栏事件驱动推送（get_state+get_session_stats 双 RPC，无高频轮询）、三栏 react-resizable-panels（px 单一事实源、宽度只记展开态）、轨迹=右抽屉四车道时间线+已加载消息聚合；ct-jyjntc：GitPanel 全功能走 /api/git（execFile+白名单、AI 用 utility model）、统计=JSONL 流式解析（无 cost）、Composer 三语法三种深度（@补全/!拦截/斜杠）、权限=模式×策略×扩展执行三层模型。PiDeck 官方两条版本线：本地 ~/code/github/PiDeck = 官方当前主线（已迁移 Tauri 版）；/tmp/pideck-research = 官方旧版 Electron v0.7.1，正文以 Electron 版为准。详情见 docs/desktop/reference-impl-details-research.md
- [07 F1-workspace-layout-prototype](issues/07-f1-workspace-layout-prototype.md) — **布局 Winner：C 活动栏式**（VS Code 范式，用户拍板）；活动栏图标集=会话（含历史双视图）/文件/统计（Git 预留位随 16 定）；不要右抽屉；面板折叠=图标列，宽度记忆只记展开态（SSR-safe），默认 300（clamp [180,480]）；实现扩展官方 #file-panel/useResizablePanel 体系，右键菜单沿用官方 CustomEvent；原型在 app/prototype/layout/（快照 prototype/f1-layout）
- [08 F2-activity-trail-prototype](issues/08-f2-activity-trail-prototype.md) — **轨迹 Winner：车道时间线，直接照搬 deepseek-harness `packages/client/ui-trajectory`**（MIT，v0.1.0-rc.5，用户指示）；功能=事件账本+Overview 时间线+inspector+虚拟滚动+缩放/区间选择+流式尾随；运行时依赖仅 @tanstack/react-virtual+diff，cordis 纯类型可替换，React peer 需放宽；实现=vendor 源码 + lib/trajectory-adapter.ts（pi 数据→TrajectorySnapshot）+ 活动栏面板挂载（订阅官方 SSE 事件面 live）。评估细节见工单
- [03 S1-tray-resident](issues/03-s1-tray-resident.md) — **托盘规格**：关窗固定最小化到托盘（无开关，CloseRequested→prevent_default+hide）；菜单三项=显示窗口/重启服务（restart_server）/退出（is_quitting→exit→杀进程组，现有逻辑不动）；升级不入口（保留 UI 内按钮）；静态图标无轮询，tooltip 随 server:ready/exited 事件更新；Cargo 加 tray-icon feature
- [04 S2-single-instance-notifications](issues/04-s2-single-instance-notifications.md) — **单实例+通知规格**：tauri-plugin-single-instance 二次启动唤起聚焦主窗口（含托盘恢复）；完成通知=壳订阅 /api/agent/running/events SSE（running 非空→空），内容=会话名（GET /api/sessions 映射）+完成时间（无摘要）；前台可见聚焦不打扰，无开关；tauri-plugin-notification；SSE 断线重连
- [05 S3-upgrade-version-ux](issues/05-s3-upgrade-version-ux.md) — **升级/版本规格**：壳自身版本检查 v0.2 不做（未发布）；升级入口移入设置区「关于」块（topbar 只留版本徽章），壳版本+pi-web 最新/已装版集中展示；升级前一律确认弹窗；现有 upgrade_piweb/piweb_version 命令保留
- [06 F-fork-governance-publishing](issues/06-fork-governance-publishing.md) — **fork 治理**：业务包 npm 公开新包名发布（具体名随 17 定，壳 npx 链路换指向）；版本号跟上游+后缀（0.8.9-desktop.1）；上游发版时 merge main + 官方文件改动目录集中（v02 子目录优先、冲突以官方为准重放增量）；仓库留在 desktop 分支；现状=基于 v0.8.9 零上游领先，官方文件仅改 package.json 14 行
- [09 F3-status-bar](issues/09-f3-status-bar.md) — **状态栏规格（参考 dsh）**：dsh 形态——composer 上方统计行（turns/steps、缓存命中%、token 计数）+ 发送钮旁上下文圆环（点击→% / used / window + token 明细）+ agent 状态点；07 底部栏占位取消；只做精确数据（耗时/速度类不做，pi 无 duration）；事件驱动无轮询；参照 deepseek-harness ui-conversation StatsLine.tsx/ContextMeter.tsx
- [11 F6-usage-stats-panel](issues/11-f6-usage-stats-panel.md) — **统计面板规格**：全局不做 cost（会话级现成，离线文件无价格）；ct-jyjntc 全套全局统计（总量/streak/模型占比/趋势 7-365 天/26 周热力图，无项目级）；GET /api/usage JSONL 流式解析+size:mtime 缓存+soft/hard TTL+agent_end 失效刷新；入口=活动栏「统计」面板（07 定）
- [10 F5-composer-enhancements](issues/10-f5-composer-enhancements.md) — **Composer 范围**：官方 v0.8.9 已全覆盖三语法（@file-fuzzy 补全+file-index、!/!! bash 拦截、斜杠内置5+四源），与 ct 同源；v0.2 仅补内置斜杠 undo/redo/init 三项，其余零改动；模式菜单属 15 权限系统
- [12 F7-models-management-delta](issues/12-f7-models-management-delta.md) — **模型管理增量**：仅补默认模型设置 UI（设为默认+默认徽章，写 settings.json defaultModel）；不做 default/smol/plan 角色（消费方在 16 GitPanel，后议）；官方 catalog/发现/测试/scope 已齐全；状态源沿用官方无冲突
- [13 F8-skills-management-delta](issues/13-f8-skills-management-delta.md) — **技能管理增量**：仅加 SKILL.md 内容预览（官方唯一缺口，经 /api/files 读）；官方 list/search/install/update/disable/scope 已全覆盖，ct 无对照优势
- [14 F9-mcp-integration](issues/14-f9-mcp-integration.md) — **MCP 方案：不内置，直接用 pi 生态**（用户拍板）——社区扩展已成熟（pi-mcp-extension 全协议 / pi-mcp-adapter 本机已装 / @pi-unipi/mcp 目录），pi install npm:<pkg> + ~/.pi/agent/mcp.json + /mcp 命令；官方 PluginsConfig 已可管理已装包，零新 UI 零开发；v0.2 仅文档指引
- [15 F10-permission-system](issues/15-f10-permission-system.md) — **权限方案：核心+UI 全走 pi 生态**（用户拍板）——装 pi-permission-system 扩展（allow/deny/ask、YOLO 内置保留硬 deny、审计、/permission-system 模态）；扩展 UI 经官方 ExtensionWidgets 通道呈现，不自做面板/模式菜单；ask 问卷先按 toolCall 卡展示，交互流不通再补最小 AskUserCard（实现期验证）；官方项目信任/工具预设保留并存；v0.2 工作量≈0
- [16 F11-gitpanel-scope](issues/16-f11-gitpanel-scope.md) — **GitPanel：仅核心 + 并入文件面板**——status/stage/unstage/discard（UI 确认）/commit/push/分支切换；启发式/AI 提交、冲突助手、split、Git Review、历史、PR 全后置（AI 依赖 12 角色体系）；落点=官方 #file-panel 加 Git tab（不新增活动栏图标）；后端照 ct /api/git/* execFile+白名单；不走 15 权限系统（UI 确认）；与 worktrees 并存
- [17 V02-spec-summary-ordering](issues/17-v02-spec-summary-ordering.md) — **v0.2 实施计划已产出：docs/desktop/v02-spec.md**——里程碑 M1 壳增强→M2 布局+状态栏→M3 管理小件→M4 轨迹→M5 GitPanel→M6 发布+生态；壳先行、布局框架先于面板、小件并行；每阶段验收口径见 spec §3；M2 完成时上游同步检查；遗留：AskUserCard 验证/React19 冒烟/SSE 重连/新包名

- [18 Minke-inspired-optimizations-spec](issues/18-minke-inspired-optimizations-spec.md) — **工程优化总纲（Minke 启发）**：基于 Minke v0.1.0 开发经验分析，提炼五项工程优化——Rust 后端模块化（main.rs 1477 行 → < 500 行）、安装体积优化（270MB → 150-180MB，依赖闭包 + 平台裁剪）、安装后健康检查、接缝测试体系、CI 体积监控。不引入插件系统，不迁移 Electron，保持 shell 职责单一

## 架构决策

- [ADR-0002: 分层架构](../docs/adr/0002-layered-architecture.md) — **PowerI 产品层与 pi-web 基础层分离**（2026-08-19）：采用分层架构 + 受控 fork，在 desktop 分支中建立显式的层边界。基础层（lib/hooks/api）跟随上游合并，PowerI 产品层（poweri/）集中自有代码。核心原则：**替换 AppShell，而非修改它**——PowerI 写自己的布局编排，import 基础层的 lib/hooks/组件。合约验证确保上游更新不会破坏 PowerI 的依赖。详见 ADR-0002 和 AGENTS.md 的"分层架构原则"章节
- [19 Rust-backend-modularization](issues/19-rust-backend-modularization.md) — **Rust 后端模块化 ✅ done**（2026-08-19）：main.rs 1630→191 行，拆出 env_detection(551)/process_manager(437)/installer(322)/logger(63)/commands(395)；12 个 tauri command 接口原样保留；18 个单测全过；clippy 0 警告；零新依赖；未提交
- [20 Install-size-optimization](issues/20-install-size-optimization.md) — **安装体积优化**：npm install 加 `--omit=dev --omit=optional --os=<platform> --cpu=<arch>`；预期 270MB → 150-180MB；blocked by 19（模块化后 installer.rs 独立）
- [21 Post-install-health-check](issues/21-post-install-health-check.md) — **安装后健康检查**：安装后运行 `pi-web --version` 验证可执行 + 检查关键文件存在；失败时删除安装目录提示重试；blocked by 19
- [22 Seam-testing-framework](issues/22-seam-testing-framework.md) — **接缝测试体系**：覆盖环境检测（parse_version、fnm_candidates）、安装（extract_install_error、build_npm_args）、进程管理（is_port_open、kill_process_group）、跨平台（.cmd shim、WSL 路径）；CI 三平台矩阵；blocked by 19
- [23 CI-size-monitoring](issues/23-ci-size-monitoring.md) — **CI 体积监控**：GitHub Actions workflow 每次构建测量安装体积，超 200MB 预算则 CI 失败；生成 Top 10 最大目录报告；blocked by 20（体积优化后再定预算）

## Not yet specified

- 新 npm 包名（G1 发布链路）—— 实现前定（spec §5 风险 4）
- AskUserCard 交互流验证结果 —— 实现期 MCP/权限安装后验证（spec §5 风险 1）

## Out of scope

- 文件增强（Monaco / fuzzy index / diff vs HEAD）—— 用户确认出局（F12）
- ct-jyjntc 架构全套：app:// 协议、内置 Node、双运行时 light/heavy、Next 裁剪 —— 终局备选，不动
- 终端多 tab、Debug tab、项目记忆、LSP 健康 —— 排期后置
- 内置浏览器预览、提示词/Prompt 商店、会话导入（Codex/Claude）—— 产品取舍出局
- Electron 路线 —— 壳已定 Tauri，不回头
- 本航程不写业务实现 —— destination 本身
- [25 Post-install-pruning](issues/25-post-install-pruning.md) — **安装后白名单裁剪**：移植 Minke runtime-prune（sourceMaps/typeDeclarations/buildCaches/documentation/平台资产五类规则，LICENSE 保留）；安装→裁剪→健康检查验证；blocked by 20/21；预期 608MB→500-540MB
