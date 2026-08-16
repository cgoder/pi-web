# 17-v02-spec-summary-ordering

Type: grilling
Status: resolved
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16

## Question

v0.2 spec 汇总与实施顺序的决策（本航图压轴）：

- 把各工单决策汇总成一份完整 spec 文档（产出 `docs/desktop/v02-spec.md`，链接进本工单 Answer）
- 实施顺序：依赖 + 价值排序（壳三件 vs 布局 vs GitPanel…）；每阶段的验收口径
- 里程碑切分（如 M1 壳增强 / M2 布局+轨迹 / M3 功能面板 / M4 GitPanel+权限）
- 与上游发版节奏的对齐

决策输出：v0.2 实施计划（顺序 + 里程碑 + spec 文档指针）。

## Answer（2026-08-16 收尾）

**v0.2 实施计划已产出：`docs/desktop/v02-spec.md`**（完整 spec，含分层工作项清单/里程碑/验收口径/上游对齐/风险）。

- **里程碑**：M1 壳增强包（S1-S3，独立）→ M2 布局+状态栏（F1+F3，后续宿主）→ M3 管理小件（F6 统计/F7 默认模型/F8 技能预览/F5 三命令，可并行）→ M4 轨迹面板（F2 vendor）→ M5 GitPanel 核心（F11）→ M6 发布与生态（G1 新包名 + MCP/权限安装指引）
- **顺序逻辑**：壳独立先行；布局框架先于所有面板；管理小件独立可并行；轨迹/GitPanel 依赖布局；发布收尾
- **验收口径**：每里程碑一节（见 spec §3 表格）
- **上游对齐**：发版时 merge（06 纪律），建议 M2 完成时做一次上游同步检查
- **遗留待验证**：AskUserCard 交互流、ui-trajectory React 19 冒烟、SSE 重连、新包名（实现前定）
